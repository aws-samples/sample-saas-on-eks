################################################################################
# Cost Allocation Infrastructure for EKS Split Cost Allocation
################################################################################

################################################################################
# S3 Buckets
################################################################################

# S3 bucket for CUR parquet data
resource "aws_s3_bucket" "eks_cur_data" {
  bucket        = "eks-cur-data-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"
  force_destroy = true

  tags = merge(local.tags, {
    Purpose = "EKS CUR data storage"
  })
}

resource "aws_s3_bucket_public_access_block" "eks_cur_data" {
  bucket = aws_s3_bucket.eks_cur_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "eks_cur_data" {
  bucket = aws_s3_bucket.eks_cur_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 bucket for Athena query results
resource "aws_s3_bucket" "athena_results" {
  bucket        = "athena-results-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"
  force_destroy = true

  tags = merge(local.tags, {
    Purpose = "Athena query results"
  })
}

resource "aws_s3_bucket_public_access_block" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Bucket policy for QuickSight access to CUR data
resource "aws_s3_bucket_policy" "eks_cur_data_quicksight" {
  bucket = aws_s3_bucket.eks_cur_data.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "quicksight.amazonaws.com"
        }
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.eks_cur_data.arn,
          "${aws_s3_bucket.eks_cur_data.arn}/*"
        ]
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

# Bucket policy for QuickSight access to Athena results
resource "aws_s3_bucket_policy" "athena_results_quicksight" {
  bucket = aws_s3_bucket.athena_results.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "quicksight.amazonaws.com"
        }
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = [
          aws_s3_bucket.athena_results.arn,
          "${aws_s3_bucket.athena_results.arn}/*"
        ]
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

# Upload parquet file to S3
# Note: The parquet file must be included in the terraform zip at: assets/eks-scad-cur2-export-gan-00001.snappy.parquet
resource "aws_s3_object" "cur_parquet" {
  bucket = aws_s3_bucket.eks_cur_data.id
  key    = "scad_cca_raw/eks-scad-cur2-export-gan-00001.snappy.parquet"
  source = "${path.module}/assets/eks-scad-cur2-export-gan-00001.snappy.parquet"
  etag   = filemd5("${path.module}/assets/eks-scad-cur2-export-gan-00001.snappy.parquet")

  tags = merge(local.tags, {
    Purpose = "Sample EKS SCAD CUR data"
  })
}

################################################################################
# Lake Formation Permissions
################################################################################

data "aws_iam_session_context" "current" {
  arn = data.aws_caller_identity.current.arn
}

resource "aws_lakeformation_data_lake_settings" "default" {
  admins = [data.aws_iam_session_context.current.issuer_arn]

  create_database_default_permissions {
    principal   = "IAM_ALLOWED_PRINCIPALS"
    permissions = ["ALL"]
  }

  create_table_default_permissions {
    principal   = "IAM_ALLOWED_PRINCIPALS"
    permissions = ["ALL"]
  }
}

################################################################################
# Glue Resources
################################################################################

# Glue database for EKS cost data
resource "aws_glue_catalog_database" "eks_cost_db" {
  catalog_id  = data.aws_caller_identity.current.account_id
  name        = "eks_cost_db"
  description = "Database for EKS SCAD CUR cost data"

  tags = local.tags

  depends_on = [aws_lakeformation_data_lake_settings.default]
}

# IAM role for Glue crawler
resource "aws_iam_role" "glue_crawler_role" {
  name = "eks-cur-glue-crawler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "glue.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "glue_crawler_service" {
  role       = aws_iam_role.glue_crawler_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"
}

resource "aws_iam_role_policy" "glue_crawler_s3" {
  name = "glue-crawler-s3-access"
  role = aws_iam_role.glue_crawler_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.eks_cur_data.arn,
          "${aws_s3_bucket.eks_cur_data.arn}/*"
        ]
      }
    ]
  })
}

# Glue crawler to index the parquet files
resource "aws_glue_crawler" "eks_cur_crawler" {
  name          = "eks-cur-crawler"
  role          = aws_iam_role.glue_crawler_role.arn
  database_name = aws_glue_catalog_database.eks_cost_db.name
  table_prefix  = ""

  s3_target {
    path = "s3://${aws_s3_bucket.eks_cur_data.id}/scad_cca_raw/"
  }

  schema_change_policy {
    update_behavior = "UPDATE_IN_DATABASE"
    delete_behavior = "LOG"
  }

  configuration = jsonencode({
    Version = 1.0
    CrawlerOutput = {
      Partitions = { AddOrUpdateBehavior = "InheritFromTable" }
      Tables     = { TableThreshold = 1, AddOrUpdateBehavior = "MergeNewColumns" }
    }
    Grouping = {
      TableGroupingPolicy     = "CombineCompatibleSchemas"
      TableLevelConfiguration = 2
    }
  })

  tags = local.tags

  depends_on = [
    aws_s3_object.cur_parquet,
    aws_iam_role_policy.glue_crawler_s3,
    aws_iam_role_policy_attachment.glue_crawler_service
  ]
}

# Run the Glue crawler and wait for completion
resource "null_resource" "run_glue_crawler" {
  depends_on = [aws_glue_crawler.eks_cur_crawler, aws_s3_object.cur_parquet]

  provisioner "local-exec" {
    command = <<-EOT
      CRAWLER_NAME="${aws_glue_crawler.eks_cur_crawler.name}"
      REGION="${data.aws_region.current.region}"
      MAX_WAIT=60
      COUNT=0

      # Check current state first - wait if crawler is already running
      CURRENT_STATE=$(aws glue get-crawler --name $CRAWLER_NAME --region $REGION --query 'Crawler.State' --output text)
      
      if [ "$CURRENT_STATE" != "READY" ]; then
        echo "Crawler is currently $CURRENT_STATE, waiting for it to become READY..."
        while [ "$CURRENT_STATE" != "READY" ]; do
          if [ $COUNT -ge $MAX_WAIT ]; then
            echo "Timeout waiting for crawler to become READY"
            exit 1
          fi
          sleep 10
          COUNT=$((COUNT + 1))
          CURRENT_STATE=$(aws glue get-crawler --name $CRAWLER_NAME --region $REGION --query 'Crawler.State' --output text)
        done
      fi

      echo "Starting Glue crawler..."
      aws glue start-crawler --name $CRAWLER_NAME --region $REGION
      
      # Reset counter for the run wait
      COUNT=0
      
      echo "Waiting for crawler to complete..."
      while true; do
        if [ $COUNT -ge $MAX_WAIT ]; then
          echo "Timeout waiting for crawler to complete"
          exit 1
        fi
        STATUS=$(aws glue get-crawler --name $CRAWLER_NAME --region $REGION --query 'Crawler.State' --output text)
        echo "Crawler status: $STATUS"
        if [ "$STATUS" = "READY" ]; then
          echo "Crawler completed successfully!"
          break
        fi
        sleep 10
        COUNT=$((COUNT + 1))
      done
    EOT
  }

  triggers = {
    crawler_name = aws_glue_crawler.eks_cur_crawler.name
    parquet_etag = aws_s3_object.cur_parquet.etag
  }
}

################################################################################
# Athena Resources
################################################################################

# Athena workgroup
resource "aws_athena_workgroup" "eks_cost_workgroup" {
  name          = "eks-cost-workgroup"
  description   = "Workgroup for EKS cost analysis queries"
  force_destroy = true

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true

    result_configuration {
      output_location = "s3://${aws_s3_bucket.athena_results.id}/query-results/"

      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }

  tags = local.tags
}

# Create Athena view for EKS workload costs
resource "null_resource" "create_athena_view" {
  depends_on = [null_resource.run_glue_crawler, aws_athena_workgroup.eks_cost_workgroup]

  provisioner "local-exec" {
    command = <<-EOT
      WORKGROUP="${aws_athena_workgroup.eks_cost_workgroup.name}"
      REGION="${data.aws_region.current.region}"
      MAX_WAIT=30
      COUNT=0

      echo "Creating Athena view..."
      
      QUERY_STRING=$(cat ${path.module}/templates/eks_workload_costs_view.sql)
      
      QUERY_ID=$(aws athena start-query-execution \
        --query-string "$QUERY_STRING" \
        --work-group $WORKGROUP \
        --query-execution-context Database=eks_cost_db \
        --region $REGION \
        --query 'QueryExecutionId' --output text)
      
      echo "Query execution ID: $QUERY_ID"
      
      # Wait for query to complete
      while true; do
        if [ $COUNT -ge $MAX_WAIT ]; then
          echo "Timeout waiting for Athena query to complete"
          exit 1
        fi
        STATUS=$(aws athena get-query-execution --query-execution-id $QUERY_ID --region $REGION --query 'QueryExecution.Status.State' --output text)
        echo "Query status: $STATUS"
        if [ "$STATUS" = "SUCCEEDED" ]; then
          echo "View created successfully!"
          break
        elif [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CANCELLED" ]; then
          echo "Query failed with status: $STATUS"
          aws athena get-query-execution --query-execution-id $QUERY_ID --region $REGION --query 'QueryExecution.Status.StateChangeReason' --output text
          exit 1
        fi
        sleep 5
        COUNT=$((COUNT + 1))
      done

      # Create EKS tenant infra costs view
      echo "Creating EKS tenant infra costs view..."
      COUNT=0
      
      QUERY_STRING2=$(cat ${path.module}/templates/eks_tenant_infra_costs_view.sql)
      
      QUERY_ID2=$(aws athena start-query-execution \
        --query-string "$QUERY_STRING2" \
        --work-group $WORKGROUP \
        --query-execution-context Database=eks_cost_db \
        --region $REGION \
        --query 'QueryExecutionId' --output text)
      
      echo "Query execution ID: $QUERY_ID2"
      
      while true; do
        if [ $COUNT -ge $MAX_WAIT ]; then
          echo "Timeout waiting for Athena query to complete"
          exit 1
        fi
        STATUS=$(aws athena get-query-execution --query-execution-id $QUERY_ID2 --region $REGION --query 'QueryExecution.Status.State' --output text)
        echo "Query status: $STATUS"
        if [ "$STATUS" = "SUCCEEDED" ]; then
          echo "EKS tenant infra costs view created successfully!"
          break
        elif [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CANCELLED" ]; then
          echo "Query failed with status: $STATUS"
          aws athena get-query-execution --query-execution-id $QUERY_ID2 --region $REGION --query 'QueryExecution.Status.StateChangeReason' --output text
          exit 1
        fi
        sleep 5
        COUNT=$((COUNT + 1))
      done
    EOT
  }

  triggers = {
    crawler_id          = null_resource.run_glue_crawler.id
    view_sql_hash       = filemd5("${path.module}/templates/eks_workload_costs_view.sql")
    infra_view_sql_hash = filemd5("${path.module}/templates/eks_tenant_infra_costs_view.sql")
  }
}

################################################################################
# Identity Center - QuickSight Admin Group
################################################################################

# Create QuickSight Admin group in Identity Center
resource "aws_identitystore_group" "quicksight_admins" {
  identity_store_id = tolist(data.aws_ssoadmin_instances.identity_center.identity_store_ids)[0]

  display_name = "QuickSightAdmins"
  description  = "QuickSight Administrators group"
}

# Add argo-admin user to QuickSightAdmins group
resource "aws_identitystore_group_membership" "quicksight_admin_membership" {
  identity_store_id = tolist(data.aws_ssoadmin_instances.identity_center.identity_store_ids)[0]
  group_id          = aws_identitystore_group.quicksight_admins.group_id
  member_id         = aws_identitystore_user.argo_admin.user_id
}

################################################################################
# QuickSight Account Subscription
################################################################################

resource "aws_quicksight_account_subscription" "eks_cost_analytics" {
  account_name          = "eks-cost-analytics-${data.aws_caller_identity.current.account_id}"
  edition               = "ENTERPRISE"
  authentication_method = "IAM_IDENTITY_CENTER"
  notification_email    = var.quicksight_notification_email

  admin_group                      = ["QuickSightAdmins"]
  iam_identity_center_instance_arn = tolist(data.aws_ssoadmin_instances.identity_center.arns)[0]

  depends_on = [aws_identitystore_group.quicksight_admins]

  lifecycle {
    ignore_changes = [account_name]
  }
}

# Disable termination protection to allow clean deletion
resource "aws_quicksight_account_settings" "eks_cost_analytics" {
  termination_protection_enabled = false

  depends_on = [aws_quicksight_account_subscription.eks_cost_analytics]
}

################################################################################
# QuickSight Service Role
################################################################################

resource "aws_iam_role" "quicksight_service_role" {
  name = "aws-quicksight-service-role-v0"
  path = "/service-role/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "quicksight.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags

  depends_on = [aws_quicksight_account_subscription.eks_cost_analytics]
}

resource "aws_iam_role_policy_attachment" "quicksight_athena_access" {
  role       = aws_iam_role.quicksight_service_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSQuicksightAthenaAccess"
}

resource "aws_iam_role_policy" "quicksight_s3_access" {
  name = "quicksight-s3-access"
  role = aws_iam_role.quicksight_service_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:ListBucketMultipartUploads",
          "s3:AbortMultipartUpload",
          "s3:PutObject",
          "s3:ListMultipartUploadParts"
        ]
        Resource = [
          aws_s3_bucket.eks_cur_data.arn,
          "${aws_s3_bucket.eks_cur_data.arn}/*",
          aws_s3_bucket.athena_results.arn,
          "${aws_s3_bucket.athena_results.arn}/*"
        ]
      }
    ]
  })
}

################################################################################
# QuickSight Data Source
################################################################################

# Wait for QuickSight to fully initialize after subscription
resource "time_sleep" "wait_for_quicksight" {
  depends_on      = [aws_quicksight_account_subscription.eks_cost_analytics, aws_iam_role.quicksight_service_role]
  create_duration = "60s"
}

# Create QuickSight data source using AWS CLI via terraform_data
# Terraform provider doesn't support RoleArn in athena_parameters — CLI workaround required
resource "terraform_data" "quicksight_data_source" {
  depends_on = [
    time_sleep.wait_for_quicksight,
    aws_iam_role.quicksight_service_role,
    aws_iam_role_policy.quicksight_s3_access,
    aws_iam_role_policy_attachment.quicksight_athena_access,
    aws_athena_workgroup.eks_cost_workgroup,
    aws_s3_bucket_policy.eks_cur_data_quicksight,
    aws_s3_bucket_policy.athena_results_quicksight,
    null_resource.create_athena_view
  ]

  # input stores values accessible via self.input in destroy provisioner
  input = {
    region = local.region
  }

  triggers_replace = {
    role_arn   = aws_iam_role.quicksight_service_role.arn
    workgroup  = aws_athena_workgroup.eks_cost_workgroup.name
    account_id = data.aws_caller_identity.current.account_id
    region     = local.region
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e

      ACCOUNT_ID="${data.aws_caller_identity.current.account_id}"
      REGION="${data.aws_region.current.region}"
      DATA_SOURCE_ID="eks-cost-athena-datasource"
      ROLE_ARN="${aws_iam_role.quicksight_service_role.arn}"
      WORKGROUP="${aws_athena_workgroup.eks_cost_workgroup.name}"
      
      echo "Creating QuickSight data source with RoleArn..."
      
      # Delete existing data source if it exists (ensures clean state)
      echo "Deleting existing data source if present..."
      aws quicksight delete-data-source \
        --aws-account-id $ACCOUNT_ID \
        --data-source-id $DATA_SOURCE_ID \
        --region $REGION 2>/dev/null || true
      
      sleep 2
      
      echo "Creating new data source..."
      aws quicksight create-data-source \
        --aws-account-id $ACCOUNT_ID \
        --data-source-id $DATA_SOURCE_ID \
        --name "EKS Cost Athena DataSource" \
        --type ATHENA \
        --data-source-parameters "AthenaParameters={WorkGroup=$WORKGROUP,RoleArn=$ROLE_ARN}" \
        --permissions "[{\"Principal\":\"arn:aws:quicksight:$REGION:$ACCOUNT_ID:group/default/QuickSightAdmins\",\"Actions\":[\"quicksight:DescribeDataSource\",\"quicksight:DescribeDataSourcePermissions\",\"quicksight:PassDataSource\",\"quicksight:UpdateDataSource\",\"quicksight:DeleteDataSource\",\"quicksight:UpdateDataSourcePermissions\"]}]" \
        --region $REGION
      
      # Wait for data source to be ready
      echo "Waiting for data source to be ready..."
      MAX_WAIT=30
      COUNT=0
      while true; do
        if [ $COUNT -ge $MAX_WAIT ]; then
          echo "Timeout waiting for data source"
          exit 1
        fi
        STATUS=$(aws quicksight describe-data-source \
          --aws-account-id $ACCOUNT_ID \
          --data-source-id $DATA_SOURCE_ID \
          --region $REGION \
          --query 'DataSource.Status' --output text 2>/dev/null || echo "PENDING")
        echo "Data source status: $STATUS"
        if [ "$STATUS" = "CREATION_SUCCESSFUL" ]; then
          echo "Data source ready!"
          break
        elif [ "$STATUS" = "CREATION_FAILED" ]; then
          echo "Data source creation failed"
          aws quicksight describe-data-source \
            --aws-account-id $ACCOUNT_ID \
            --data-source-id $DATA_SOURCE_ID \
            --region $REGION
          exit 1
        fi
        sleep 5
        COUNT=$((COUNT + 1))
      done
    EOT
  }

  # Destroy provisioner to clean up the data source
  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
      REGION="${self.input.region != null ? self.input.region : "us-east-1"}"
      DATA_SOURCE_ID="eks-cost-athena-datasource"
      
      echo "Deleting QuickSight data source..."
      aws quicksight delete-data-source \
        --aws-account-id $ACCOUNT_ID \
        --data-source-id $DATA_SOURCE_ID \
        --region $REGION 2>/dev/null || true
    EOT
  }
}

# Commented out: replaced by terraform_data.quicksight_data_source above
# resource "null_resource" "quicksight_data_source" { ... }

# Data source for referencing the CLI-created QuickSight data source ARN
locals {
  quicksight_data_source_arn = "arn:aws:quicksight:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:datasource/eks-cost-athena-datasource"
}

################################################################################
# QuickSight Data Set (native resource)
################################################################################

resource "aws_quicksight_data_set" "eks_workload_costs" {
  data_set_id = "eks-workload-costs-dataset"
  name        = "EKS Workload Costs"
  import_mode = "DIRECT_QUERY"

  physical_table_map {
    physical_table_map_id = "eks-workload-costs-table"

    relational_table {
      data_source_arn = local.quicksight_data_source_arn
      catalog         = "AwsDataCatalog"
      schema          = "eks_cost_db"
      name            = "eks_workload_costs"

      input_columns {
        name = "usage_date"
        type = "DATETIME"
      }
      input_columns {
        name = "cluster_name"
        type = "STRING"
      }
      input_columns {
        name = "namespace"
        type = "STRING"
      }
      input_columns {
        name = "pod_name"
        type = "STRING"
      }
      input_columns {
        name = "workload_name"
        type = "STRING"
      }
      input_columns {
        name = "workload_type"
        type = "STRING"
      }
      input_columns {
        name = "operation"
        type = "STRING"
      }
      input_columns {
        name = "usage_type"
        type = "STRING"
      }
      input_columns {
        name = "availability_zone"
        type = "STRING"
      }
      input_columns {
        name = "payer_account_id"
        type = "STRING"
      }
      input_columns {
        name = "usage_account_id"
        type = "STRING"
      }
      input_columns {
        name = "instance_type"
        type = "STRING"
      }
      input_columns {
        name = "region"
        type = "STRING"
      }
      input_columns {
        name = "unblended_cost"
        type = "DECIMAL"
      }
      input_columns {
        name = "split_cost"
        type = "DECIMAL"
      }
      input_columns {
        name = "usage_amount"
        type = "DECIMAL"
      }
      input_columns {
        name = "reserved_usage"
        type = "DECIMAL"
      }
      input_columns {
        name = "actual_usage"
        type = "DECIMAL"
      }
    }
  }

  permissions {
    principal = "arn:aws:quicksight:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:group/default/QuickSightAdmins"
    actions = [
      "quicksight:DescribeDataSet",
      "quicksight:DescribeDataSetPermissions",
      "quicksight:PassDataSet",
      "quicksight:DescribeIngestion",
      "quicksight:ListIngestions",
      "quicksight:UpdateDataSet",
      "quicksight:DeleteDataSet",
      "quicksight:CreateIngestion",
      "quicksight:CancelIngestion",
      "quicksight:UpdateDataSetPermissions",
    ]
  }

  depends_on = [
    terraform_data.quicksight_data_source,
    null_resource.create_athena_view
  ]
}

# Commented out: replaced by aws_quicksight_data_set.eks_workload_costs above
# resource "null_resource" "quicksight_data_set" { ... }

################################################################################
# QuickSight Dashboard (native resource)
################################################################################

resource "aws_quicksight_dashboard" "eks_cost_dashboard" {
  dashboard_id        = "eks-cost-dashboard"
  name                = "EKS Container Cost Dashboard"
  version_description = "v3 - currency formatting on cost columns"

  permissions {
    principal = "arn:aws:quicksight:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:group/default/QuickSightAdmins"
    actions = [
      "quicksight:DescribeDashboard",
      "quicksight:ListDashboardVersions",
      "quicksight:UpdateDashboardPermissions",
      "quicksight:QueryDashboard",
      "quicksight:UpdateDashboard",
      "quicksight:DeleteDashboard",
      "quicksight:UpdateDashboardPublishedVersion",
      "quicksight:DescribeDashboardPermissions",
    ]
  }

  definition {
    data_set_identifiers_declarations {
      identifier   = "eks_workload_costs"
      data_set_arn = aws_quicksight_data_set.eks_workload_costs.arn
    }

    data_set_identifiers_declarations {
      identifier   = "eks_tenant_infra_costs"
      data_set_arn = aws_quicksight_data_set.eks_tenant_infra_costs.arn
    }

    data_set_identifiers_declarations {
      identifier   = "tenant_service_costs"
      data_set_arn = aws_quicksight_data_set.tenant_service_costs.arn
    }

    # Default currency formatting for all cost columns. Applies to every visual
    # (KPI, pie, bar, line) that aggregates these columns across all sheets.
    column_configurations {
      column {
        data_set_identifier = "eks_tenant_infra_costs"
        column_name         = "cost"
      }
      format_configuration {
        number_format_configuration {
          numeric_format_configuration {
            currency_display_format_configuration {
              symbol       = var.cost_currency_symbol
              number_scale = "NONE"
              decimal_places_configuration {
                decimal_places = 2
              }
              separator_configuration {
                decimal_separator = "DOT"
                thousands_separator {
                  symbol     = "COMMA"
                  visibility = "VISIBLE"
                }
              }
              negative_value_configuration {
                display_mode = "NEGATIVE"
              }
            }
          }
        }
      }
    }

    column_configurations {
      column {
        data_set_identifier = "eks_workload_costs"
        column_name         = "split_cost"
      }
      format_configuration {
        number_format_configuration {
          numeric_format_configuration {
            currency_display_format_configuration {
              symbol       = var.cost_currency_symbol
              number_scale = "NONE"
              decimal_places_configuration {
                decimal_places = 2
              }
              separator_configuration {
                decimal_separator = "DOT"
                thousands_separator {
                  symbol     = "COMMA"
                  visibility = "VISIBLE"
                }
              }
              negative_value_configuration {
                display_mode = "NEGATIVE"
              }
            }
          }
        }
      }
    }

    column_configurations {
      column {
        data_set_identifier = "tenant_service_costs"
        column_name         = "unblended_cost"
      }
      format_configuration {
        number_format_configuration {
          numeric_format_configuration {
            currency_display_format_configuration {
              symbol       = var.cost_currency_symbol
              number_scale = "NONE"
              decimal_places_configuration {
                decimal_places = 2
              }
              separator_configuration {
                decimal_separator = "DOT"
                thousands_separator {
                  symbol     = "COMMA"
                  visibility = "VISIBLE"
                }
              }
              negative_value_configuration {
                display_mode = "NEGATIVE"
              }
            }
          }
        }
      }
    }

    filter_groups {
      filter_group_id = "cluster-filter-group-sheet1"
      cross_dataset   = "ALL_DATASETS"
      status          = "ENABLED"

      scope_configuration {
        selected_sheets {
          sheet_visual_scoping_configurations {
            sheet_id = "sheet1"
            scope    = "ALL_VISUALS"
          }
        }
      }

      filters {
        category_filter {
          filter_id = "cluster-filter-sheet1"
          column {
            data_set_identifier = "eks_workload_costs"
            column_name         = "cluster_name"
          }
          configuration {
            filter_list_configuration {
              match_operator     = "CONTAINS"
              select_all_options = "FILTER_ALL_VALUES"
            }
          }
        }
      }
    }

    filter_groups {
      filter_group_id = "namespace-filter-group-sheet1"
      cross_dataset   = "ALL_DATASETS"
      status          = "ENABLED"

      scope_configuration {
        selected_sheets {
          sheet_visual_scoping_configurations {
            sheet_id = "sheet1"
            scope    = "ALL_VISUALS"
          }
        }
      }

      filters {
        category_filter {
          filter_id = "namespace-filter-sheet1"
          column {
            data_set_identifier = "eks_workload_costs"
            column_name         = "namespace"
          }
          configuration {
            filter_list_configuration {
              match_operator     = "CONTAINS"
              select_all_options = "FILTER_ALL_VALUES"
            }
          }
        }
      }
    }

    sheets {
      sheet_id = "sheet1"
      name     = "Cost Overview"

      filter_controls {
        dropdown {
          filter_control_id = "cluster-dropdown"
          title             = "Cluster"
          source_filter_id  = "cluster-filter-sheet1"
          type              = "SINGLE_SELECT"
          display_options {
            title_options {
              visibility = "VISIBLE"
              font_configuration {}
            }
            select_all_options {
              visibility = "VISIBLE"
            }
          }
        }
      }

      filter_controls {
        dropdown {
          filter_control_id = "namespace-dropdown"
          title             = "Namespace"
          source_filter_id  = "namespace-filter-sheet1"
          type              = "SINGLE_SELECT"
          display_options {
            title_options {
              visibility = "VISIBLE"
              font_configuration {}
            }
            select_all_options {
              visibility = "VISIBLE"
            }
          }
        }
      }

      visuals {
        kpi_visual {
          visual_id = "total-cost-kpi"
          title {
            format_text {
              plain_text = "Total Split Cost"
            }
          }
          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "split_cost_total"
                  column {
                    data_set_identifier = "eks_workload_costs"
                    column_name         = "split_cost"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "SUM"
                  }
                }
              }
            }
          }
        }
      }

      visuals {
        pie_chart_visual {
          visual_id = "cost-by-cluster"
          title {
            format_text {
              plain_text = "Cost by Cluster"
            }
          }
          chart_configuration {
            field_wells {
              pie_chart_aggregated_field_wells {
                category {
                  categorical_dimension_field {
                    field_id = "cluster_name"
                    column {
                      data_set_identifier = "eks_workload_costs"
                      column_name         = "cluster_name"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "split_cost"
                    column {
                      data_set_identifier = "eks_workload_costs"
                      column_name         = "split_cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
            donut_options {
              arc_options {
                arc_thickness = "WHOLE"
              }
            }
          }
        }
      }

      visuals {
        bar_chart_visual {
          visual_id = "cost-by-namespace"
          title {
            format_text {
              plain_text = "Cost by Namespace"
            }
          }
          chart_configuration {
            field_wells {
              bar_chart_aggregated_field_wells {
                category {
                  categorical_dimension_field {
                    field_id = "namespace"
                    column {
                      data_set_identifier = "eks_workload_costs"
                      column_name         = "namespace"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "split_cost"
                    column {
                      data_set_identifier = "eks_workload_costs"
                      column_name         = "split_cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
            orientation      = "HORIZONTAL"
            bars_arrangement = "STACKED"
          }
        }
      }

      visuals {
        line_chart_visual {
          visual_id = "cost-over-time"
          title {
            format_text {
              plain_text = "Daily Cost Trend"
            }
          }
          chart_configuration {
            field_wells {
              line_chart_aggregated_field_wells {
                category {
                  date_dimension_field {
                    field_id     = "usage_date"
                    hierarchy_id = "usage_date"
                    column {
                      data_set_identifier = "eks_workload_costs"
                      column_name         = "usage_date"
                    }
                    date_granularity = "DAY"
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "split_cost"
                    column {
                      data_set_identifier = "eks_workload_costs"
                      column_name         = "split_cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
          }
          column_hierarchies {
            date_time_hierarchy {
              hierarchy_id = "usage_date"
            }
          }
        }
      }

      layouts {
        configuration {
          grid_layout {
            canvas_size_options {
              screen_canvas_size_options {
                resize_option = "RESPONSIVE"
              }
            }
            elements {
              element_id   = "total-cost-kpi"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 0
              column_span  = 36
              row_span     = 6
            }
            elements {
              element_id   = "cost-by-cluster"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 6
              column_span  = 18
              row_span     = 12
            }
            elements {
              element_id   = "cost-by-namespace"
              element_type = "VISUAL"
              column_index = 18
              row_index    = 6
              column_span  = 18
              row_span     = 12
            }
            elements {
              element_id   = "cost-over-time"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 18
              column_span  = 36
              row_span     = 12
            }
          }
        }
      }
    }

    # Sheet 2: Tenant Service Costs (DynamoDB & S3)
    sheets {
      sheet_id = "sheet2"
      name     = "Tenant Service Costs"

      filter_controls {
        dropdown {
          filter_control_id = "tenant-dropdown"
          title             = "Tenant"
          source_filter_id  = "tenant-filter-sheet2"
          type              = "SINGLE_SELECT"
          display_options {
            title_options {
              visibility = "VISIBLE"
              font_configuration {}
            }
            select_all_options {
              visibility = "VISIBLE"
            }
          }
        }
      }

      filter_controls {
        dropdown {
          filter_control_id = "service-dropdown"
          title             = "Service"
          source_filter_id  = "service-filter-sheet2"
          type              = "SINGLE_SELECT"
          display_options {
            title_options {
              visibility = "VISIBLE"
              font_configuration {}
            }
            select_all_options {
              visibility = "VISIBLE"
            }
          }
        }
      }

      # KPI: Total Tenant Service Cost
      visuals {
        kpi_visual {
          visual_id = "total-service-cost-kpi"
          title {
            format_text {
              plain_text = "Total Tenant Service Cost"
            }
          }
          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "unblended_cost_total"
                  column {
                    data_set_identifier = "tenant_service_costs"
                    column_name         = "unblended_cost"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "SUM"
                  }
                }
              }
            }
          }
        }
      }

      # Pie chart: Cost by Tenant
      visuals {
        pie_chart_visual {
          visual_id = "cost-by-tenant"
          title {
            format_text {
              plain_text = "Cost by Tenant"
            }
          }
          chart_configuration {
            field_wells {
              pie_chart_aggregated_field_wells {
                category {
                  categorical_dimension_field {
                    field_id = "tenant_id_dim"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "tenant_id"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "unblended_cost_tenant"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "unblended_cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
            donut_options {
              arc_options {
                arc_thickness = "WHOLE"
              }
            }
          }
        }
      }

      # Bar chart: Cost by Service (DynamoDB vs S3) per Tenant
      visuals {
        bar_chart_visual {
          visual_id = "cost-by-service-tenant"
          title {
            format_text {
              plain_text = "Cost by Service per Tenant"
            }
          }
          chart_configuration {
            field_wells {
              bar_chart_aggregated_field_wells {
                category {
                  categorical_dimension_field {
                    field_id = "tenant_id_bar"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "tenant_id"
                    }
                  }
                }
                colors {
                  categorical_dimension_field {
                    field_id = "service_color"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "service"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "unblended_cost_bar"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "unblended_cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
            orientation      = "HORIZONTAL"
            bars_arrangement = "STACKED"
          }
        }
      }

      # Line chart: Daily Service Cost Trend by Tenant
      visuals {
        line_chart_visual {
          visual_id = "service-cost-over-time"
          title {
            format_text {
              plain_text = "Daily Service Cost Trend"
            }
          }
          chart_configuration {
            field_wells {
              line_chart_aggregated_field_wells {
                category {
                  date_dimension_field {
                    field_id     = "usage_date_line"
                    hierarchy_id = "usage_date_line"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "usage_date"
                    }
                    date_granularity = "DAY"
                  }
                }
                colors {
                  categorical_dimension_field {
                    field_id = "tenant_id_line"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "tenant_id"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "unblended_cost_line"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "unblended_cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
          }
          column_hierarchies {
            date_time_hierarchy {
              hierarchy_id = "usage_date_line"
            }
          }
        }
      }

      # Bar chart: Cost by Tier
      visuals {
        bar_chart_visual {
          visual_id = "cost-by-tier"
          title {
            format_text {
              plain_text = "Cost by Tenant Tier"
            }
          }
          chart_configuration {
            field_wells {
              bar_chart_aggregated_field_wells {
                category {
                  categorical_dimension_field {
                    field_id = "tenant_tier_dim"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "tenant_tier"
                    }
                  }
                }
                colors {
                  categorical_dimension_field {
                    field_id = "service_tier_color"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "service"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "unblended_cost_tier"
                    column {
                      data_set_identifier = "tenant_service_costs"
                      column_name         = "unblended_cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
            orientation      = "HORIZONTAL"
            bars_arrangement = "STACKED"
          }
        }
      }

      layouts {
        configuration {
          grid_layout {
            canvas_size_options {
              screen_canvas_size_options {
                resize_option = "RESPONSIVE"
              }
            }
            elements {
              element_id   = "total-service-cost-kpi"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 0
              column_span  = 36
              row_span     = 6
            }
            elements {
              element_id   = "cost-by-tenant"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 6
              column_span  = 18
              row_span     = 12
            }
            elements {
              element_id   = "cost-by-service-tenant"
              element_type = "VISUAL"
              column_index = 18
              row_index    = 6
              column_span  = 18
              row_span     = 12
            }
            elements {
              element_id   = "service-cost-over-time"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 18
              column_span  = 36
              row_span     = 12
            }
            elements {
              element_id   = "cost-by-tier"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 30
              column_span  = 36
              row_span     = 12
            }
          }
        }
      }
    }

    # Filter groups for Sheet 2
    filter_groups {
      filter_group_id = "tenant-filter-group-sheet2"
      cross_dataset   = "ALL_DATASETS"
      status          = "ENABLED"

      scope_configuration {
        selected_sheets {
          sheet_visual_scoping_configurations {
            sheet_id = "sheet2"
            scope    = "ALL_VISUALS"
          }
        }
      }

      filters {
        category_filter {
          filter_id = "tenant-filter-sheet2"
          column {
            data_set_identifier = "tenant_service_costs"
            column_name         = "tenant_id"
          }
          configuration {
            filter_list_configuration {
              match_operator     = "CONTAINS"
              select_all_options = "FILTER_ALL_VALUES"
            }
          }
        }
      }
    }

    filter_groups {
      filter_group_id = "service-filter-group-sheet2"
      cross_dataset   = "ALL_DATASETS"
      status          = "ENABLED"

      scope_configuration {
        selected_sheets {
          sheet_visual_scoping_configurations {
            sheet_id = "sheet2"
            scope    = "ALL_VISUALS"
          }
        }
      }

      filters {
        category_filter {
          filter_id = "service-filter-sheet2"
          column {
            data_set_identifier = "tenant_service_costs"
            column_name         = "service"
          }
          configuration {
            filter_list_configuration {
              match_operator     = "CONTAINS"
              select_all_options = "FILTER_ALL_VALUES"
            }
          }
        }
      }
    }

    # Sheet 3: EKS Infrastructure Cost per Tenant
    sheets {
      sheet_id = "sheet3"
      name     = "EKS Infra Cost per Tenant"

      filter_controls {
        dropdown {
          filter_control_id = "cluster-dropdown-sheet3"
          title             = "Cluster"
          source_filter_id  = "cluster-filter-sheet3"
          type              = "SINGLE_SELECT"
          display_options {
            title_options {
              visibility = "VISIBLE"
              font_configuration {}
            }
            select_all_options {
              visibility = "VISIBLE"
            }
          }
        }
      }

      filter_controls {
        dropdown {
          filter_control_id = "tier-dropdown-sheet3"
          title             = "Tenant Tier"
          source_filter_id  = "tier-filter-sheet3"
          type              = "SINGLE_SELECT"
          display_options {
            title_options {
              visibility = "VISIBLE"
              font_configuration {}
            }
            select_all_options {
              visibility = "VISIBLE"
            }
          }
        }
      }

      # KPI: Total EKS Infra Cost
      visuals {
        kpi_visual {
          visual_id = "total-eks-infra-cost"
          title {
            format_text {
              plain_text = "Total EKS Infrastructure Cost"
            }
          }
          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "infra_split_cost_total"
                  column {
                    data_set_identifier = "eks_tenant_infra_costs"
                    column_name         = "cost"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "SUM"
                  }
                }
              }
            }
          }
        }
      }

      # Pie chart: EKS Infra Cost by Tenant
      visuals {
        pie_chart_visual {
          visual_id = "infra-cost-by-tenant"
          title {
            format_text {
              plain_text = "EKS Infra Cost by Tenant"
            }
          }
          chart_configuration {
            field_wells {
              pie_chart_aggregated_field_wells {
                category {
                  categorical_dimension_field {
                    field_id = "infra_tenant_id"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "tenant_id"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "infra_split_cost_tenant"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
            donut_options {
              arc_options {
                arc_thickness = "WHOLE"
              }
            }
          }
        }
      }

      # Bar chart: EKS Infra Cost by Tier (basic vs pro vs platform)
      visuals {
        bar_chart_visual {
          visual_id = "infra-cost-by-tier"
          title {
            format_text {
              plain_text = "EKS Infra Cost by Tier"
            }
          }
          chart_configuration {
            field_wells {
              bar_chart_aggregated_field_wells {
                category {
                  categorical_dimension_field {
                    field_id = "infra_tier"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "tenant_tier"
                    }
                  }
                }
                colors {
                  categorical_dimension_field {
                    field_id = "infra_cluster_tier"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "cluster_name"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "infra_split_cost_tier"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
            orientation      = "HORIZONTAL"
            bars_arrangement = "STACKED"
          }
        }
      }

      # Bar chart: EKS Infra Cost by Tenant per Cluster
      visuals {
        bar_chart_visual {
          visual_id = "infra-cost-tenant-cluster"
          title {
            format_text {
              plain_text = "EKS Infra Cost by Tenant per Cluster"
            }
          }
          chart_configuration {
            field_wells {
              bar_chart_aggregated_field_wells {
                category {
                  categorical_dimension_field {
                    field_id = "infra_tenant_bar"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "tenant_id"
                    }
                  }
                }
                colors {
                  categorical_dimension_field {
                    field_id = "infra_cluster_bar"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "cluster_name"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "infra_split_cost_bar"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
            orientation      = "HORIZONTAL"
            bars_arrangement = "STACKED"
          }
        }
      }

      # Line chart: Daily EKS Infra Cost Trend by Tenant
      visuals {
        line_chart_visual {
          visual_id = "infra-cost-trend"
          title {
            format_text {
              plain_text = "Daily EKS Infra Cost Trend by Tenant"
            }
          }
          chart_configuration {
            field_wells {
              line_chart_aggregated_field_wells {
                category {
                  date_dimension_field {
                    field_id     = "infra_usage_date"
                    hierarchy_id = "infra_usage_date"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "usage_date"
                    }
                    date_granularity = "DAY"
                  }
                }
                colors {
                  categorical_dimension_field {
                    field_id = "infra_tenant_trend"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "tenant_id"
                    }
                  }
                }
                values {
                  numerical_measure_field {
                    field_id = "infra_split_cost_trend"
                    column {
                      data_set_identifier = "eks_tenant_infra_costs"
                      column_name         = "cost"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
          }
          column_hierarchies {
            date_time_hierarchy {
              hierarchy_id = "infra_usage_date"
            }
          }
        }
      }

      layouts {
        configuration {
          grid_layout {
            canvas_size_options {
              screen_canvas_size_options {
                resize_option = "RESPONSIVE"
              }
            }
            elements {
              element_id   = "total-eks-infra-cost"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 0
              column_span  = 36
              row_span     = 6
            }
            elements {
              element_id   = "infra-cost-by-tenant"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 6
              column_span  = 18
              row_span     = 12
            }
            elements {
              element_id   = "infra-cost-by-tier"
              element_type = "VISUAL"
              column_index = 18
              row_index    = 6
              column_span  = 18
              row_span     = 12
            }
            elements {
              element_id   = "infra-cost-tenant-cluster"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 18
              column_span  = 36
              row_span     = 12
            }
            elements {
              element_id   = "infra-cost-trend"
              element_type = "VISUAL"
              column_index = 0
              row_index    = 30
              column_span  = 36
              row_span     = 12
            }
          }
        }
      }
    }

    # Filter groups for Sheet 3
    filter_groups {
      filter_group_id = "cluster-filter-group-sheet3"
      cross_dataset   = "ALL_DATASETS"
      status          = "ENABLED"

      scope_configuration {
        selected_sheets {
          sheet_visual_scoping_configurations {
            sheet_id = "sheet3"
            scope    = "ALL_VISUALS"
          }
        }
      }

      filters {
        category_filter {
          filter_id = "cluster-filter-sheet3"
          column {
            data_set_identifier = "eks_tenant_infra_costs"
            column_name         = "cluster_name"
          }
          configuration {
            filter_list_configuration {
              match_operator     = "CONTAINS"
              select_all_options = "FILTER_ALL_VALUES"
            }
          }
        }
      }
    }

    filter_groups {
      filter_group_id = "tier-filter-group-sheet3"
      cross_dataset   = "ALL_DATASETS"
      status          = "ENABLED"

      scope_configuration {
        selected_sheets {
          sheet_visual_scoping_configurations {
            sheet_id = "sheet3"
            scope    = "ALL_VISUALS"
          }
        }
      }

      filters {
        category_filter {
          filter_id = "tier-filter-sheet3"
          column {
            data_set_identifier = "eks_tenant_infra_costs"
            column_name         = "tenant_tier"
          }
          configuration {
            filter_list_configuration {
              match_operator     = "CONTAINS"
              select_all_options = "FILTER_ALL_VALUES"
            }
          }
        }
      }
    }
  }

  depends_on = [
    aws_quicksight_data_set.eks_workload_costs,
    aws_quicksight_data_set.tenant_service_costs,
    aws_quicksight_data_set.eks_tenant_infra_costs
  ]
}

# Commented out: replaced by aws_quicksight_dashboard.eks_cost_dashboard above
# resource "null_resource" "quicksight_dashboard" { ... }

################################################################################
# Tenant DynamoDB & S3 Cost Allocation
################################################################################

################################################################################
# Usage Aggregator Lambda
################################################################################

# IAM role for the usage aggregator Lambda
resource "aws_iam_role" "usage_aggregator_role" {
  name = "tenant-usage-aggregator-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "usage_aggregator_basic" {
  role       = aws_iam_role.usage_aggregator_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "usage_aggregator_permissions" {
  name = "usage-aggregator-permissions"
  role = aws_iam_role.usage_aggregator_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:GetMetricData",
          "cloudwatch:ListMetrics"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.eks_cur_data.arn}/usage_ratios/*"
      }
    ]
  })
}

# Package Lambda code
data "archive_file" "usage_aggregator" {
  type        = "zip"
  source_file = "${path.module}/lambda/usage_aggregator.py"
  output_path = "${path.module}/lambda/usage_aggregator.zip"
}

# Lambda function
resource "aws_lambda_function" "usage_aggregator" {
  function_name    = "tenant-usage-aggregator"
  role             = aws_iam_role.usage_aggregator_role.arn
  handler          = "usage_aggregator.handler"
  runtime          = "python3.12"
  timeout          = 120
  filename         = data.archive_file.usage_aggregator.output_path
  source_code_hash = data.archive_file.usage_aggregator.output_base64sha256

  environment {
    variables = {
      USAGE_RATIOS_BUCKET = aws_s3_bucket.eks_cur_data.id
      USAGE_RATIOS_PREFIX = "usage_ratios/"
    }
  }

  tags = merge(local.tags, {
    Purpose = "Aggregate per-tenant usage metrics for cost splitting"
  })
}

# EventBridge Scheduler to run Lambda at the top of every hour
resource "aws_scheduler_schedule" "usage_aggregator_schedule" {
  name        = "tenant-usage-aggregator-schedule"
  description = "Trigger usage aggregator Lambda at the top of every hour"
  group_name  = "default"

  schedule_expression          = "cron(0/5 * * * ? *)"
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.usage_aggregator.arn
    role_arn = aws_iam_role.scheduler_usage_aggregator_role.arn
  }
}

resource "aws_iam_role" "scheduler_usage_aggregator_role" {
  name = "scheduler-usage-aggregator-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "scheduler_invoke_lambda" {
  name = "scheduler-invoke-usage-aggregator"
  role = aws_iam_role.scheduler_usage_aggregator_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.usage_aggregator.arn
      }
    ]
  })
}

################################################################################
# Glue Crawler for Usage Ratios
################################################################################

# Seed CSV so the usage_ratios S3 prefix and Glue table are never empty
resource "aws_s3_object" "usage_ratios_seed" {
  bucket       = aws_s3_bucket.eks_cur_data.id
  key          = "usage_ratios/seed/usage_ratios_seed.csv"
  content_type = "text/csv"
  content      = <<-CSV
    usage_date,tenant_id,tenant_tier,service,request_count,total_requests,usage_ratio
    2026-04-01 00:00:00,tenant-001,pro,AmazonDynamoDB,5000,10000,0.5
    2026-04-01 00:00:00,tenant-001,pro,AmazonS3,3000,10000,0.3
    2026-04-01 00:00:00,tenant-002,basic,AmazonDynamoDB,3000,10000,0.3
    2026-04-01 00:00:00,tenant-002,basic,AmazonS3,4000,10000,0.4
    2026-04-01 00:00:00,tenant-004,basic,AmazonDynamoDB,2000,10000,0.2
    2026-04-01 00:00:00,tenant-004,basic,AmazonS3,3000,10000,0.3
  CSV

  tags = merge(local.tags, {
    Purpose = "Seed data for usage_ratios Glue table"
  })
}

# Define the Glue table directly instead of relying on a crawler
resource "aws_glue_catalog_table" "usage_ratios" {
  database_name = aws_glue_catalog_database.eks_cost_db.name
  name          = "usage_ratios"
  description   = "Per-tenant usage ratios for proportional cost splitting"

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"         = "csv"
    "skip.header.line.count" = "1"
    "EXTERNAL"               = "TRUE"
  }

  storage_descriptor {
    location      = "s3://${aws_s3_bucket.eks_cur_data.id}/usage_ratios/"
    input_format  = "org.apache.hadoop.mapred.TextInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.serde2.OpenCSVSerde"
      parameters = {
        "separatorChar" = ","
        "quoteChar"     = "\""
      }
    }

    columns {
      name = "usage_date"
      type = "string"
    }
    columns {
      name = "tenant_id"
      type = "string"
    }
    columns {
      name = "tenant_tier"
      type = "string"
    }
    columns {
      name = "service"
      type = "string"
    }
    columns {
      name = "request_count"
      type = "string"
    }
    columns {
      name = "total_requests"
      type = "string"
    }
    columns {
      name = "usage_ratio"
      type = "string"
    }
  }

  depends_on = [aws_s3_object.usage_ratios_seed]
}

# Run the usage ratios Glue crawler
resource "null_resource" "run_usage_ratios_crawler" {
  depends_on = [aws_glue_catalog_table.usage_ratios, aws_lambda_function.usage_aggregator]

  provisioner "local-exec" {
    command = <<-EOT
      REGION="${data.aws_region.current.region}"

      # Invoke Lambda once to seed initial usage data
      echo "Invoking usage aggregator Lambda to seed data..."
      aws lambda invoke \
        --function-name ${aws_lambda_function.usage_aggregator.function_name} \
        --region $REGION \
        /tmp/usage_aggregator_output.json 2>/dev/null || true

      echo "Usage ratios table and seed data ready."
    EOT
  }

  triggers = {
    table_name  = aws_glue_catalog_table.usage_ratios.name
    lambda_hash = data.archive_file.usage_aggregator.output_base64sha256
  }
}

################################################################################
# Athena View for Tenant Service Costs
################################################################################

# Create Athena view for tenant DynamoDB & S3 costs
resource "null_resource" "create_tenant_service_costs_view" {
  depends_on = [
    null_resource.run_glue_crawler,
    null_resource.run_usage_ratios_crawler,
    aws_athena_workgroup.eks_cost_workgroup
  ]

  provisioner "local-exec" {
    command = <<-EOT
      WORKGROUP="${aws_athena_workgroup.eks_cost_workgroup.name}"
      REGION="${data.aws_region.current.region}"
      MAX_WAIT=30
      COUNT=0

      echo "Creating Athena view for tenant service costs..."

      QUERY_STRING=$(cat ${path.module}/templates/tenant_service_costs_view.sql)

      QUERY_ID=$(aws athena start-query-execution \
        --query-string "$QUERY_STRING" \
        --work-group $WORKGROUP \
        --query-execution-context Database=eks_cost_db \
        --region $REGION \
        --query 'QueryExecutionId' --output text)

      echo "Query execution ID: $QUERY_ID"

      while true; do
        if [ $COUNT -ge $MAX_WAIT ]; then
          echo "Timeout waiting for Athena query to complete"
          exit 1
        fi
        STATUS=$(aws athena get-query-execution --query-execution-id $QUERY_ID --region $REGION --query 'QueryExecution.Status.State' --output text)
        echo "Query status: $STATUS"
        if [ "$STATUS" = "SUCCEEDED" ]; then
          echo "Tenant service costs view created successfully!"
          break
        elif [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CANCELLED" ]; then
          echo "Query failed with status: $STATUS"
          aws athena get-query-execution --query-execution-id $QUERY_ID --region $REGION --query 'QueryExecution.Status.StateChangeReason' --output text
          exit 1
        fi
        sleep 5
        COUNT=$((COUNT + 1))
      done
    EOT
  }

  triggers = {
    crawler_id    = null_resource.run_glue_crawler.id
    view_sql_hash = filemd5("${path.module}/templates/tenant_service_costs_view.sql")
  }
}

################################################################################
# QuickSight Data Set for Tenant Service Costs
################################################################################

resource "aws_quicksight_data_set" "tenant_service_costs" {
  data_set_id = "tenant-service-costs-dataset"
  name        = "Tenant Service Costs (DynamoDB & S3)"
  import_mode = "DIRECT_QUERY"

  physical_table_map {
    physical_table_map_id = "tenant-service-costs-table"

    relational_table {
      data_source_arn = local.quicksight_data_source_arn
      catalog         = "AwsDataCatalog"
      schema          = "eks_cost_db"
      name            = "tenant_service_costs"

      input_columns {
        name = "usage_date"
        type = "DATETIME"
      }
      input_columns {
        name = "service"
        type = "STRING"
      }
      input_columns {
        name = "tenant_id"
        type = "STRING"
      }
      input_columns {
        name = "tenant_tier"
        type = "STRING"
      }
      input_columns {
        name = "resource_id"
        type = "STRING"
      }
      input_columns {
        name = "operation"
        type = "STRING"
      }
      input_columns {
        name = "usage_type"
        type = "STRING"
      }
      input_columns {
        name = "availability_zone"
        type = "STRING"
      }
      input_columns {
        name = "payer_account_id"
        type = "STRING"
      }
      input_columns {
        name = "usage_account_id"
        type = "STRING"
      }
      input_columns {
        name = "region"
        type = "STRING"
      }
      input_columns {
        name = "unblended_cost"
        type = "DECIMAL"
      }
      input_columns {
        name = "usage_amount"
        type = "DECIMAL"
      }
      input_columns {
        name = "blended_cost"
        type = "DECIMAL"
      }
      input_columns {
        name = "usage_ratio"
        type = "DECIMAL"
      }
      input_columns {
        name = "attribution_method"
        type = "STRING"
      }
    }
  }

  permissions {
    principal = "arn:aws:quicksight:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:group/default/QuickSightAdmins"
    actions = [
      "quicksight:DescribeDataSet",
      "quicksight:DescribeDataSetPermissions",
      "quicksight:PassDataSet",
      "quicksight:DescribeIngestion",
      "quicksight:ListIngestions",
      "quicksight:UpdateDataSet",
      "quicksight:DeleteDataSet",
      "quicksight:CreateIngestion",
      "quicksight:CancelIngestion",
      "quicksight:UpdateDataSetPermissions",
    ]
  }

  depends_on = [
    terraform_data.quicksight_data_source,
    null_resource.create_tenant_service_costs_view
  ]
}

################################################################################
# QuickSight Data Set for EKS Tenant Infrastructure Costs
################################################################################

resource "aws_quicksight_data_set" "eks_tenant_infra_costs" {
  data_set_id = "eks-tenant-infra-costs-dataset"
  name        = "EKS Tenant Infrastructure Costs"
  import_mode = "DIRECT_QUERY"

  physical_table_map {
    physical_table_map_id = "eks-tenant-infra-costs-table"

    relational_table {
      data_source_arn = local.quicksight_data_source_arn
      catalog         = "AwsDataCatalog"
      schema          = "eks_cost_db"
      name            = "eks_tenant_infra_costs"

      input_columns {
        name = "usage_date"
        type = "DATETIME"
      }
      input_columns {
        name = "cluster_name"
        type = "STRING"
      }
      input_columns {
        name = "namespace"
        type = "STRING"
      }
      input_columns {
        name = "tenant_id"
        type = "STRING"
      }
      input_columns {
        name = "tenant_tier"
        type = "STRING"
      }
      input_columns {
        name = "workload_name"
        type = "STRING"
      }
      input_columns {
        name = "cost"
        type = "DECIMAL"
      }
      input_columns {
        name = "cost_category"
        type = "STRING"
      }
    }
  }

  permissions {
    principal = "arn:aws:quicksight:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:group/default/QuickSightAdmins"
    actions = [
      "quicksight:DescribeDataSet",
      "quicksight:DescribeDataSetPermissions",
      "quicksight:PassDataSet",
      "quicksight:DescribeIngestion",
      "quicksight:ListIngestions",
      "quicksight:UpdateDataSet",
      "quicksight:DeleteDataSet",
      "quicksight:CreateIngestion",
      "quicksight:CancelIngestion",
      "quicksight:UpdateDataSetPermissions",
    ]
  }

  depends_on = [
    terraform_data.quicksight_data_source,
    null_resource.create_athena_view
  ]
}
