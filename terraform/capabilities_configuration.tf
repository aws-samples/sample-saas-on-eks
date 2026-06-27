################################################################################
# Capabilities Configuration - Argo CD Cluster Secrets
################################################################################

################################################################################
# Argo CD Cluster Secret for Control Plane (deployed to Control Plane)
################################################################################

resource "kubectl_manifest" "argocd_local_cluster_control_plane" {
  provider = kubectl.control_plane

  depends_on = [
    aws_eks_capability.argocd_capability_control_plane
  ]

  yaml_body = yamlencode({
    apiVersion = "v1"
    kind       = "Secret"
    metadata = {
      name      = "saas-control-plane"
      namespace = "argocd"
      labels = {
        "argocd.argoproj.io/secret-type" = "cluster"
        "cluster.saas.aws/name"          = "saas-control-plane"
        "cluster.saas.aws/type"          = "control-plane"
        "cluster.saas.aws/environment"   = "workshop"
        "aws-region"                     = data.aws_region.current.region
      }
    }
    stringData = {
      name    = "saas-control-plane"
      server  = module.eks_control_plane.cluster_arn
      project = "default"
    }
  })
}

################################################################################
# Argo CD Cluster Secret for Data Plane (deployed to Control Plane)
################################################################################

resource "kubectl_manifest" "argocd_data_plane_cluster_control_plane" {
  provider = kubectl.control_plane

  depends_on = [
    aws_eks_capability.argocd_capability_control_plane
  ]

  yaml_body = yamlencode({
    apiVersion = "v1"
    kind       = "Secret"
    metadata = {
      name      = "saas-data-plane"
      namespace = "argocd"
      labels = {
        "argocd.argoproj.io/secret-type" = "cluster"
        "cluster.saas.aws/name"          = "saas-data-plane"
        "cluster.saas.aws/type"          = "data-plane"
        "cluster.saas.aws/environment"   = "workshop"
        "aws-region"                     = data.aws_region.current.region
      }
    }
    stringData = {
      name    = "saas-data-plane"
      server  = module.eks_data_plane.cluster_arn
      project = "default"
    }
  })
}

# Data plane Argo CD only needs access to itself, not to control plane

################################################################################
# Argo CD Cluster Secret for Data Plane (deployed to Data Plane)
################################################################################

resource "kubectl_manifest" "argocd_local_cluster_data_plane" {
  provider = kubectl.data_plane

  depends_on = [
    aws_eks_capability.argocd_capability_data_plane
  ]

  yaml_body = yamlencode({
    apiVersion = "v1"
    kind       = "Secret"
    metadata = {
      name      = "saas-data-plane"
      namespace = "argocd"
      labels = {
        "argocd.argoproj.io/secret-type" = "cluster"
        "cluster.saas.aws/name"          = "saas-data-plane"
        "cluster.saas.aws/type"          = "data-plane"
        "cluster.saas.aws/environment"   = "workshop"
        "cluster.saas.aws/local"         = "true"
        "aws-region"                     = data.aws_region.current.region
      }
    }
    stringData = {
      name    = "saas-data-plane"
      server  = module.eks_data_plane.cluster_arn
      project = "default"
    }
  })
}

################################################################################
# EKS Access Policy Associations for Argo CD Role
################################################################################

# Associate cluster admin policy to Argo CD role on control plane cluster
resource "aws_eks_access_policy_association" "argocd_control_plane_admin" {
  cluster_name  = module.eks_control_plane.cluster_name
  principal_arn = aws_iam_role.argocd_capability_role.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [
    aws_eks_capability.argocd_capability_control_plane
  ]
}

# Associate cluster admin policy to Argo CD role on data plane cluster
resource "aws_eks_access_policy_association" "argocd_data_plane_admin" {
  cluster_name  = module.eks_data_plane.cluster_name
  principal_arn = aws_iam_role.argocd_capability_role.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [
    aws_eks_capability.argocd_capability_data_plane
  ]
}
################################################################################
# EKS Access Policy Associations for KRO Role
################################################################################

# Associate cluster admin policy to KRO role on control plane cluster
resource "aws_eks_access_policy_association" "kro_control_plane_admin" {
  cluster_name  = module.eks_control_plane.cluster_name
  principal_arn = aws_iam_role.kro_capability_role.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [
    aws_eks_capability.kro_capability_control_plane
  ]
}

# Associate cluster admin policy to KRO role on data plane cluster
resource "aws_eks_access_policy_association" "kro_data_plane_admin" {
  cluster_name  = module.eks_data_plane.cluster_name
  principal_arn = aws_iam_role.kro_capability_role.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [
    aws_eks_capability.kro_capability_data_plane
  ]
}