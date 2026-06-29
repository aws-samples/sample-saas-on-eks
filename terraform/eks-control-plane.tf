################################################################################
# CloudWatch Observability IAM Role (shared by both clusters)
################################################################################

data "aws_iam_policy_document" "cloudwatch_observability_trust" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
    actions = [
      "sts:AssumeRole",
      "sts:TagSession",
    ]
  }
}

resource "aws_iam_role" "cloudwatch_observability" {
  name               = "CloudWatchObservabilityRole"
  assume_role_policy = data.aws_iam_policy_document.cloudwatch_observability_trust.json

  tags = merge(local.tags, {
    Purpose = "CloudWatch Observability addon for EKS clusters"
  })
}

resource "aws_iam_role_policy_attachment" "cloudwatch_observability" {
  role       = aws_iam_role.cloudwatch_observability.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

################################################################################
# EKS Control Plane Cluster
################################################################################

module "eks_control_plane" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = local.control_plane_cluster_name
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
    ClusterType = "control-plane"
  })
}

# IngressClassParams for EKS Auto Mode ALB
resource "kubectl_manifest" "ingress_class_params" {
  provider = kubectl.control_plane
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
    module.eks_control_plane
  ]
}

# IngressClass for EKS Auto Mode ALB
resource "kubectl_manifest" "ingress_class" {
  provider = kubectl.control_plane
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

