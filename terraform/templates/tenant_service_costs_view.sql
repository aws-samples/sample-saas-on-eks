CREATE OR REPLACE VIEW eks_cost_db.tenant_service_costs AS

WITH tenant_tier_lookup AS (
  SELECT tenant_id, tenant_tier,
         ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY usage_date DESC) AS rn
  FROM eks_cost_db.usage_ratios
  WHERE tenant_id != 'seed'
),

latest_tenant_tiers AS (
  SELECT tenant_id, tenant_tier
  FROM tenant_tier_lookup
  WHERE rn = 1
)

-- Pro tier: dedicated resources → direct 1:1 cost attribution from CUR
SELECT
  DATE_TRUNC('day', c.line_item_usage_start_date) AS usage_date,
  c.line_item_product_code AS service,
  REGEXP_EXTRACT(c.line_item_resource_id, '(?i)gaming-app-(tenant-[a-z0-9-]+)', 1) AS tenant_id,
  t.tenant_tier,
  c.line_item_resource_id AS resource_id,
  c.line_item_operation AS operation,
  c.line_item_usage_type AS usage_type,
  c.line_item_availability_zone AS availability_zone,
  c.bill_payer_account_id AS payer_account_id,
  c.line_item_usage_account_id AS usage_account_id,
  c.product['region'] AS region,
  SUM(c.line_item_unblended_cost) AS unblended_cost,
  SUM(c.line_item_usage_amount) AS usage_amount,
  SUM(c.line_item_blended_cost) AS blended_cost,
  CAST(1.0 AS DOUBLE) AS usage_ratio,
  'direct' AS attribution_method
FROM eks_cost_db.scad_cca_raw c
INNER JOIN latest_tenant_tiers t
  ON REGEXP_EXTRACT(c.line_item_resource_id, '(?i)gaming-app-(tenant-[a-z0-9-]+)', 1) = t.tenant_id
  AND t.tenant_tier = 'pro'
WHERE c.line_item_product_code IN ('AmazonDynamoDB', 'AmazonS3')
  AND c.line_item_line_item_type IN ('Usage', 'DiscountedUsage')
  AND REGEXP_LIKE(c.line_item_resource_id, '(?i)tenant-[a-z0-9-]+')
  AND (
    REGEXP_LIKE(c.line_item_resource_id, '(?i)saas-gaming|gaming-app')
    OR COALESCE(c.resource_tags['user_application'], '') = 'saas-gaming'
  )
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11

UNION ALL

-- Basic tier: shared resources → split cost by latest usage ratio per tenant+service
SELECT
  DATE_TRUNC('day', c.line_item_usage_start_date) AS usage_date,
  c.line_item_product_code AS service,
  r.tenant_id AS tenant_id,
  r.tenant_tier,
  c.line_item_resource_id AS resource_id,
  c.line_item_operation AS operation,
  c.line_item_usage_type AS usage_type,
  c.line_item_availability_zone AS availability_zone,
  c.bill_payer_account_id AS payer_account_id,
  c.line_item_usage_account_id AS usage_account_id,
  c.product['region'] AS region,
  SUM(c.line_item_unblended_cost * CAST(r.usage_ratio AS DOUBLE)) AS unblended_cost,
  SUM(c.line_item_usage_amount * CAST(r.usage_ratio AS DOUBLE)) AS usage_amount,
  SUM(c.line_item_blended_cost * CAST(r.usage_ratio AS DOUBLE)) AS blended_cost,
  CAST(r.usage_ratio AS DOUBLE) AS usage_ratio,
  'proportional' AS attribution_method
FROM eks_cost_db.scad_cca_raw c
INNER JOIN (
  SELECT tenant_id, tenant_tier, service, usage_ratio,
         ROW_NUMBER() OVER (PARTITION BY tenant_id, service ORDER BY usage_date DESC) AS rn
  FROM eks_cost_db.usage_ratios
  WHERE tenant_id != 'seed'
    AND tenant_tier = 'basic'
) r ON c.line_item_product_code = r.service AND r.rn = 1
WHERE c.line_item_product_code IN ('AmazonDynamoDB', 'AmazonS3')
  AND c.line_item_line_item_type IN ('Usage', 'DiscountedUsage')
  AND REGEXP_LIKE(c.line_item_resource_id, '(?i)shared')
  AND (
    REGEXP_LIKE(c.line_item_resource_id, '(?i)saas-gaming|gaming-app')
    OR COALESCE(c.resource_tags['user_application'], '') = 'saas-gaming'
  )
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, r.usage_ratio
