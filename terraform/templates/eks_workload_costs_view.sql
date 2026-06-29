CREATE OR REPLACE VIEW eks_cost_db.eks_workload_costs AS
SELECT
  DATE_TRUNC('day', line_item_usage_start_date) AS usage_date,
  SPLIT_PART(line_item_resource_id, '/', 2) AS cluster_name,
  SPLIT_PART(line_item_resource_id, '/', 3) AS namespace,
  SPLIT_PART(line_item_resource_id, '/', 4) AS pod_name,
  resource_tags['aws_eks_workload_name'] AS workload_name,
  resource_tags['aws_eks_workload_type'] AS workload_type,
  line_item_operation AS operation,
  line_item_usage_type AS usage_type,
  line_item_availability_zone AS availability_zone,
  bill_payer_account_id AS payer_account_id,
  line_item_usage_account_id AS usage_account_id,
  product_instance_type AS instance_type,
  product['region'] AS region,
  SUM(line_item_unblended_cost) AS unblended_cost,
  SUM(COALESCE(split_line_item_split_cost, 0)) AS split_cost,
  SUM(line_item_usage_amount) AS usage_amount,
  SUM(COALESCE(split_line_item_reserved_usage, 0)) AS reserved_usage,
  SUM(COALESCE(split_line_item_actual_usage, 0)) AS actual_usage
FROM eks_cost_db.scad_cca_raw
WHERE line_item_operation IN ('EKSPod-EC2', 'FargatePod', 'ECSTask-EC2', 'FargateTask')
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
