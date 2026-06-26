################################################################################
# EKS Control Plane Cluster
################################################################################

module "eks_control_plane" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = local.control_plane_cluster_name
  kubernetes_version = var.cluster_version

  # Only metrics-server addon needed - Auto Mode provides coredns, kube-proxy, vpc-cni, eks-pod-identity-agent automatically
  addons = {
    metrics-server = {
      before_compute = true
      most_recent    = true
    }
  }

  # Access configuration
  endpoint_public_access                   = var.cluster_endpoint_public_access
  enable_cluster_creator_admin_permissions = var.enable_cluster_creator_admin_permissions

  # EKS Auto Mode - simplified cluster management with default node pools
  compute_config = {
    enabled    = true
    node_pools = ["general-purpose", "system"]
  }

  # Network configuration
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  tags = merge(local.tags, {
    ClusterType = "control-plane"
  })
}

# EKS capabilities will be configured later