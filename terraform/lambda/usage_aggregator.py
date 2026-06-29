"""
Lambda: Aggregate per-tenant usage metrics from CloudWatch and write
usage-ratio records to S3 for cost splitting.

Runs on a schedule. For each (service, tenant) combination,
it computes each tenant's share of total requests, then writes a CSV to S3
that Athena can query as a usage_ratios table.
"""

import boto3
import csv
import io
import os
import json
from datetime import datetime, timedelta, timezone

METRICS_NAMESPACE = "SaaSGaming/TenantUsage"
S3_BUCKET = os.environ["USAGE_RATIOS_BUCKET"]
S3_PREFIX = os.environ.get("USAGE_RATIOS_PREFIX", "usage_ratios/")
REGION = os.environ.get("AWS_REGION", "us-east-1")

cw = boto3.client("cloudwatch", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)


def handler(event, context):
    """Aggregate recent usage metrics and write ratios to S3."""
    end_time = datetime.now(timezone.utc)
    # Look back 2 hours to catch metrics that may have been delayed
    start_time = end_time - timedelta(hours=2)

    print(f"Aggregating usage from {start_time} to {end_time}")

    # Collect all metric dimension sets per service
    usage = {}  # {(tenant_id, service): request_count}
    tenant_tiers = {}  # {tenant_id: tier}

    for service in ["AmazonDynamoDB", "AmazonS3"]:
        dimension_sets = _list_metric_dimensions(service)
        print(f"Found {len(dimension_sets)} dimension sets for {service}")

        for dims in dimension_sets:
            tenant_id = None
            tenant_tier = None
            for d in dims:
                if d["Name"] == "TenantId":
                    tenant_id = d["Value"]
                elif d["Name"] == "TenantTier":
                    tenant_tier = d["Value"]
            if not tenant_id:
                continue

            # Track tier from CloudWatch dimensions
            if tenant_tier:
                tenant_tiers[tenant_id] = tenant_tier

            count = _get_request_count_exact(dims, start_time, end_time)
            print(f"  {tenant_id}/{service} tier={tenant_tier} dims={[d['Value'] for d in dims]}: {count}")
            key = (tenant_id, service)
            usage[key] = usage.get(key, 0) + count # get the existing count and add
    # sample usage: {('tenant-2', 'AmazonDynamoDB'): 41, ('tenant-3', 'AmazonDynamoDB'): 31, ('tenant-2', 'AmazonS3'): 1}
    print(f"Usage totals: {usage}")

    if not usage or all(v == 0 for v in usage.values()):
        print("No usage data found for this period")
        return {"statusCode": 200, "body": "No usage data"}

    # Compute ratios per service
    rows = []
    for service in ["AmazonDynamoDB", "AmazonS3"]:
        service_entries = {k: v for k, v in usage.items() if k[1] == service and v > 0}
        total = sum(service_entries.values())
        if total == 0:
            continue
        for (tenant_id, svc), count in service_entries.items():
            rows.append({
                "usage_date": end_time.strftime("%Y-%m-%d %H:%M:%S"),
                "tenant_id": tenant_id,
                "tenant_tier": tenant_tiers.get(tenant_id, "unknown"),
                "service": svc,
                "request_count": count,
                "total_requests": total,
                "usage_ratio": round(count / total, 6),
            })

    if not rows:
        print("No non-zero usage to write")
        return {"statusCode": 200, "body": "No non-zero usage"}

    # Write CSV to S3
    date_partition = end_time.strftime("%Y/%m/%d")
    hour = end_time.strftime("%H%M")
    key = f"{S3_PREFIX}{date_partition}/usage_ratios_{hour}.csv"

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=[
        "usage_date", "tenant_id", "tenant_tier", "service",
        "request_count", "total_requests", "usage_ratio"
    ])
    writer.writeheader()
    writer.writerows(rows)

    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=buf.getvalue().encode("utf-8"),
        ContentType="text/csv",
    )

    print(f"Wrote {len(rows)} usage ratio records to s3://{S3_BUCKET}/{key}")
    return {"statusCode": 200, "body": json.dumps({"records": len(rows)})}


def _list_metric_dimensions(service):
    """Get all unique dimension sets for RequestCount metrics for a service."""
    dimension_sets = []
    paginator = cw.get_paginator("list_metrics")
    for page in paginator.paginate(
        Namespace=METRICS_NAMESPACE,
        MetricName="RequestCount",
        Dimensions=[{"Name": "Service", "Value": service}],
    ):
        for metric in page["Metrics"]:
            dimension_sets.append(metric["Dimensions"])
    return dimension_sets


def _get_request_count_exact(dimensions, start_time, end_time):
    """Get total request count for an exact dimension set."""
    resp = cw.get_metric_statistics(
        Namespace=METRICS_NAMESPACE,
        MetricName="RequestCount",
        Dimensions=dimensions,
        StartTime=start_time,
        EndTime=end_time,
        Period=7200,  # 2 hour period to get a single aggregated datapoint
        Statistics=["Sum"],
    )
    datapoints = resp.get("Datapoints", [])
    total = int(sum(dp["Sum"] for dp in datapoints))
    return total
