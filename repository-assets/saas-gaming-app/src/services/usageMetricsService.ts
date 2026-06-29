import {
  CloudWatchClient,
  PutMetricDataCommand,
  MetricDatum,
} from '@aws-sdk/client-cloudwatch';
import { TenantContext } from '../types/tenant';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const METRICS_NAMESPACE = 'SaaSGaming/TenantUsage';

const cwClient = new CloudWatchClient({ region: AWS_REGION });

// Buffer metrics and flush periodically to reduce API calls
let metricBuffer: MetricDatum[] = [];
const FLUSH_INTERVAL_MS = 10_000; // 10 seconds
const MAX_BUFFER_SIZE = 20; // CloudWatch PutMetricData limit per call

setInterval(() => flushMetrics(), FLUSH_INTERVAL_MS);

/**
 * Record a DynamoDB operation for a tenant.
 * Tracks request count and consumed capacity (if available).
 */
export function recordDynamoDBUsage(
  tenantContext: TenantContext,
  operation: 'read' | 'write',
  consumedCapacityUnits?: number
): void {
  const dimensions = [
    { Name: 'TenantId', Value: tenantContext.tenantId },
    { Name: 'TenantTier', Value: tenantContext.tier },
    { Name: 'Service', Value: 'AmazonDynamoDB' },
    { Name: 'Operation', Value: operation },
  ];

  metricBuffer.push({
    MetricName: 'RequestCount',
    Dimensions: dimensions,
    Value: 1,
    Unit: 'Count',
    Timestamp: new Date(),
  });

  if (consumedCapacityUnits !== undefined && consumedCapacityUnits > 0) {
    metricBuffer.push({
      MetricName: 'ConsumedCapacityUnits',
      Dimensions: dimensions,
      Value: consumedCapacityUnits,
      Unit: 'Count',
      Timestamp: new Date(),
    });
  }

  if (metricBuffer.length >= MAX_BUFFER_SIZE) {
    flushMetrics();
  }
}

/**
 * Record an S3 operation for a tenant.
 * Tracks request count and bytes transferred.
 */
export function recordS3Usage(
  tenantContext: TenantContext,
  operation: 'read' | 'write',
  bytes?: number
): void {
  const dimensions = [
    { Name: 'TenantId', Value: tenantContext.tenantId },
    { Name: 'TenantTier', Value: tenantContext.tier },
    { Name: 'Service', Value: 'AmazonS3' },
    { Name: 'Operation', Value: operation },
  ];

  metricBuffer.push({
    MetricName: 'RequestCount',
    Dimensions: dimensions,
    Value: 1,
    Unit: 'Count',
    Timestamp: new Date(),
  });

  if (bytes !== undefined && bytes > 0) {
    metricBuffer.push({
      MetricName: 'BytesTransferred',
      Dimensions: dimensions,
      Value: bytes,
      Unit: 'Bytes',
      Timestamp: new Date(),
    });
  }

  if (metricBuffer.length >= MAX_BUFFER_SIZE) {
    flushMetrics();
  }
}

/**
 * Flush buffered metrics to CloudWatch.
 * Called periodically and when buffer is full.
 */
async function flushMetrics(): Promise<void> {
  if (metricBuffer.length === 0) return;

  const batch = metricBuffer.splice(0, MAX_BUFFER_SIZE);

  try {
    await cwClient.send(
      new PutMetricDataCommand({
        Namespace: METRICS_NAMESPACE,
        MetricData: batch,
      })
    );
  } catch (error) {
    // Non-fatal: log and continue. Metrics loss is acceptable.
    console.warn('Failed to publish usage metrics to CloudWatch:', error);
    // Don't re-buffer to avoid memory growth on persistent failures
  }
}

export { flushMetrics as flush };
