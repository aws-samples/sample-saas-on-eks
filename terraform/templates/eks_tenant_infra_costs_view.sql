CREATE OR REPLACE VIEW eks_cost_db.eks_tenant_infra_costs AS

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
),

base_costs AS (
  SELECT
    w.usage_date,
    w.cluster_name,
    w.namespace,
    w.namespace AS tenant_id,
    COALESCE(t.tenant_tier, 'platform') AS tenant_tier,
    w.workload_name,
    SUM(w.split_cost) AS split_cost,
    SUM(w.unblended_cost) AS unblended_cost,
    SUM(w.usage_amount) AS usage_amount
  FROM eks_cost_db.eks_workload_costs w
  LEFT JOIN latest_tenant_tiers t ON w.namespace = t.tenant_id
  GROUP BY 1, 2, 3, 4, 5, 6
),

tenant_totals AS (
  SELECT
    tenant_id,
    SUM(split_cost) AS tenant_cost
  FROM base_costs
  WHERE tenant_tier IN ('basic', 'pro')
  GROUP BY tenant_id
),

all_tenant_cost AS (
  SELECT SUM(tenant_cost) AS total FROM tenant_totals
),

control_plane_cost AS (
  SELECT SUM(split_cost) AS total_cp_cost FROM base_costs WHERE tenant_tier = 'platform'
)

-- Data-plane: direct tenant workload costs
SELECT
  usage_date,
  cluster_name,
  namespace,
  tenant_id,
  tenant_tier,
  workload_name,
  split_cost AS cost,
  'data-plane' AS cost_category
FROM base_costs
WHERE tenant_tier IN ('basic', 'pro')

UNION ALL

-- Control-plane: proportional share per tenant (one row per tenant)
SELECT
  CAST(NULL AS TIMESTAMP) AS usage_date,
  'saas-control-plane' AS cluster_name,
  'platform-overhead' AS namespace,
  tt.tenant_id,
  'platform-shared' AS tenant_tier,
  'control-plane-share' AS workload_name,
  (tt.tenant_cost / NULLIF(atc.total, 0)) * cpc.total_cp_cost AS cost,
  'control-plane' AS cost_category
FROM tenant_totals tt
CROSS JOIN all_tenant_cost atc
CROSS JOIN control_plane_cost cpc
WHERE atc.total > 0
