################################################################################
# EKS Data Plane Cluster
################################################################################

module "eks_data_plane" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = local.data_plane_cluster_name
  kubernetes_version = var.cluster_version

  addons = {
    metrics-server = {
      before_compute = true
      most_recent    = true
    }
    amazon-cloudwatch-observability = {
      most_recent = true
      configuration_values = jsonencode({
        agent = {
          resources = {
            limits = {
              cpu    = "500m"
              memory = "1024Mi"
            }
            requests = {
              cpu    = "250m"
              memory = "512Mi"
            }
          }
        }
      })
      pod_identity_association = [{
        role_arn        = aws_iam_role.cloudwatch_observability.arn
        service_account = "cloudwatch-agent"
      }]
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
    ClusterType = "data-plane"
  })
}

# Enable Network Policies
resource "kubectl_manifest" "config_map_network_policy" {
  provider = kubectl.data_plane

  depends_on = [
    module.eks_data_plane
  ]

  yaml_body = yamlencode({
    apiVersion = "v1"
    kind       = "ConfigMap"
    metadata = {
      name = "amazon-vpc-cni"
      namespace = "kube-system"
    }
    data = {
      enable-network-policy-controller = "true"
    }
  })
}

resource "kubernetes_config_map_v1" "kro_config" {
  provider = kubernetes.data_plane
  metadata {
    name      = "kro-config"
    namespace = "default"
  }

  data = {
    account_id        = data.aws_caller_identity.current.account_id
    region            = local.region
    ecr_repo          = aws_ecr_repository.gaming_app.repository_url
    cluster_name      = local.data_plane_cluster_name
  }

  depends_on = [
    module.eks_data_plane
  ]

}

# IngressClassParams for EKS Auto Mode ALB
resource "kubectl_manifest" "ingress_class_params_data_plane" {
  provider = kubectl.data_plane
  wait = true

  yaml_body = <<-YAML
    apiVersion: eks.amazonaws.com/v1
    kind: IngressClassParams
    metadata:
      name: alb
    spec:
      scheme: internet-facing
      inboundCIDRs: ${jsonencode(var.ingress_inbound_cidrs)}
  YAML

  depends_on = [
    module.eks_data_plane
  ]
}

# IngressClass for EKS Auto Mode ALB
resource "kubectl_manifest" "ingress_class_data_plane" {
  provider = kubectl.data_plane
  wait = true

  yaml_body = <<-YAML
    apiVersion: networking.k8s.io/v1
    kind: IngressClass
    metadata:
      name: alb
      annotations:
        # Use this annotation to set an IngressClass as Default
        # If an Ingress doesn't specify a class, it will use the Default
        ingressclass.kubernetes.io/is-default-class: "true"
      labels:
          app.kubernetes.io/name: LoadBalancerController
    spec:
      # Configures the IngressClass to use EKS Auto Mode
      controller: eks.amazonaws.com/alb
      parameters:
        apiGroup: eks.amazonaws.com
        kind: IngressClassParams
        # Use the name of the IngressClassParams set in the previous step
        name: alb
  YAML

  depends_on = [
    kubectl_manifest.ingress_class_params
  ]
}
