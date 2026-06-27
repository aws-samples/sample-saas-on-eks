################################################################################
# EKS Capabilities Configuration
################################################################################

# Using existing data source from main.tf

################################################################################
# ACK Capability IAM Role
################################################################################

# Trust policy for ACK capability
data "aws_iam_policy_document" "ack_trust_policy" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["capabilities.eks.amazonaws.com"]
    }
    actions = [
      "sts:AssumeRole",
      "sts:TagSession"
    ]
  }
}

# IAM role for ACK capability
resource "aws_iam_role" "ack_capability_role" {
  name               = "ACKCapabilityRole"
  assume_role_policy = data.aws_iam_policy_document.ack_trust_policy.json

  tags = merge(local.tags, {
    Purpose = "ACK capability role for EKS clusters"
  })
}

# Attach AdministratorAccess policy to ACK role
resource "aws_iam_role_policy_attachment" "ack_admin_access" {
  role       = aws_iam_role.ack_capability_role.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

################################################################################
# ACK Capability for Control Plane Cluster
################################################################################

resource "aws_eks_capability" "ack_capability_control_plane" {
  cluster_name              = module.eks_control_plane.cluster_name
  capability_name           = "control-plane-ack"
  type                      = "ACK"
  role_arn                  = aws_iam_role.ack_capability_role.arn
  delete_propagation_policy = "RETAIN"

  depends_on = [
    module.eks_control_plane,
    aws_iam_role.ack_capability_role,
    aws_iam_role_policy_attachment.ack_admin_access
  ]

  tags = merge(local.tags, {
    Purpose = "ACK capability for control plane cluster"
  })
}

################################################################################
# ACK Capability for Data Plane Cluster
################################################################################

resource "aws_eks_capability" "ack_capability_data_plane" {
  cluster_name              = module.eks_data_plane.cluster_name
  capability_name           = "data-plane-ack"
  type                      = "ACK"
  role_arn                  = aws_iam_role.ack_capability_role.arn
  delete_propagation_policy = "RETAIN"

  depends_on = [
    module.eks_data_plane,
    aws_iam_role.ack_capability_role,
    aws_iam_role_policy_attachment.ack_admin_access
  ]

  tags = merge(local.tags, {
    Purpose = "ACK capability for data plane cluster"
  })
}

# Outputs are defined in outputs.tf to avoid duplication

# Argo CD capabilities will be added after Identity Center is properly set up
################################################################################
# Argo CD Capability IAM Role
################################################################################

# Trust policy for Argo CD capability
data "aws_iam_policy_document" "argocd_trust_policy" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["capabilities.eks.amazonaws.com"]
    }
    actions = [
      "sts:AssumeRole",
      "sts:TagSession"
    ]
  }
}

# IAM role for Argo CD capability
resource "aws_iam_role" "argocd_capability_role" {
  name               = "ArgoCDCapabilityRole"
  assume_role_policy = data.aws_iam_policy_document.argocd_trust_policy.json

  tags = merge(local.tags, {
    Purpose = "Argo CD capability role for EKS clusters"
  })
}

# Custom policy provides all necessary permissions for Argo CD capability

# Custom policy for Argo CD specific permissions
resource "aws_iam_role_policy" "argocd_capability_policy" {
  name = "ArgoCDCapabilityPolicy"
  role = aws_iam_role.argocd_capability_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
          "eks:ListClusters",
          "eks:DescribeCapability",
          "eks:ListCapabilities",
          "sso-admin:DescribeInstance",
          "sso-admin:ListInstances",
          "identitystore:DescribeUser",
          "identitystore:DescribeGroup",
          "identitystore:ListUsers",
          "identitystore:ListGroups",
          "identitystore:GetUserId",
          "identitystore:GetGroupId"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "codecommit:GitPull",
          "codecommit:GetBranch",
          "codecommit:GetCommit",
          "codecommit:GetRepository",
          "codecommit:ListBranches",
          "codecommit:ListRepositories"
        ]
        Resource = [
          aws_codecommit_repository.platform_configs.arn,
          aws_codecommit_repository.workloads.arn
        ]
      }
    ]
  })
}

################################################################################
# Argo CD Capability for Control Plane Cluster
################################################################################

resource "aws_eks_capability" "argocd_capability_control_plane" {
  cluster_name              = module.eks_control_plane.cluster_name
  capability_name           = "control-plane-argocd"
  type                      = "ARGOCD"
  role_arn                  = aws_iam_role.argocd_capability_role.arn
  delete_propagation_policy = "RETAIN"

  configuration {
    argo_cd {
      aws_idc {
        idc_instance_arn = tolist(data.aws_ssoadmin_instances.identity_center.arns)[0]
        idc_region       = var.region
      }
      rbac_role_mapping {
        role = "ADMIN"
        identity {
          id   = aws_identitystore_user.argo_admin.user_id
          type = "SSO_USER"
        }
      }
    }
  }

  depends_on = [
    module.eks_control_plane,
    aws_iam_role.argocd_capability_role,
    aws_iam_role_policy.argocd_capability_policy,
    aws_identitystore_user.argo_admin,
    aws_codecommit_repository.platform_configs,
    aws_codecommit_repository.workloads,
    aws_eks_capability.ack_capability_control_plane
  ]

  tags = merge(local.tags, {
    Purpose = "Argo CD capability for control plane cluster"
  })
}

################################################################################
# Argo CD Capability for Data Plane Cluster
################################################################################

resource "aws_eks_capability" "argocd_capability_data_plane" {
  cluster_name              = module.eks_data_plane.cluster_name
  capability_name           = "data-plane-argocd"
  type                      = "ARGOCD"
  role_arn                  = aws_iam_role.argocd_capability_role.arn
  delete_propagation_policy = "RETAIN"

  configuration {
    argo_cd {
      aws_idc {
        idc_instance_arn = tolist(data.aws_ssoadmin_instances.identity_center.arns)[0]
        idc_region       = var.region
      }
      rbac_role_mapping {
        role = "ADMIN"
        identity {
          id   = aws_identitystore_user.argo_admin.user_id
          type = "SSO_USER"
        }
      }
    }
  }

  depends_on = [
    module.eks_data_plane,
    aws_iam_role.argocd_capability_role,
    aws_iam_role_policy.argocd_capability_policy,
    aws_identitystore_user.argo_admin,
    aws_codecommit_repository.platform_configs,
    aws_codecommit_repository.workloads,
    aws_eks_capability.ack_capability_data_plane
  ]

  tags = merge(local.tags, {
    Purpose = "Argo CD capability for data plane cluster"
  })
}

################################################################################
# KRO Capability IAM Role
################################################################################

# Trust policy for KRO capability
data "aws_iam_policy_document" "kro_trust_policy" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["capabilities.eks.amazonaws.com"]
    }
    actions = [
      "sts:AssumeRole",
      "sts:TagSession"
    ]
  }
}

# IAM role for KRO capability
resource "aws_iam_role" "kro_capability_role" {
  name               = "KROCapabilityRole"
  assume_role_policy = data.aws_iam_policy_document.kro_trust_policy.json

  tags = merge(local.tags, {
    Purpose = "KRO capability role for EKS clusters"
  })
}

# Custom policy for KRO specific permissions
resource "aws_iam_role_policy" "kro_capability_policy" {
  name = "KROCapabilityPolicy"
  role = aws_iam_role.kro_capability_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
          "eks:ListClusters",
          "eks:DescribeCapability",
          "eks:ListCapabilities",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeImages",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSubnets",
          "ec2:DescribeVpcs",
          "iam:GetRole",
          "iam:PassRole"
        ]
        Resource = "*"
      }
    ]
  })
}

################################################################################
# KRO Capability for Control Plane Cluster
################################################################################

resource "aws_eks_capability" "kro_capability_control_plane" {
  cluster_name              = module.eks_control_plane.cluster_name
  capability_name           = "control-plane-kro"
  type                      = "KRO"
  role_arn                  = aws_iam_role.kro_capability_role.arn
  delete_propagation_policy = "RETAIN"

  depends_on = [
    module.eks_control_plane,
    aws_iam_role.kro_capability_role,
    aws_iam_role_policy.kro_capability_policy,
    aws_eks_capability.argocd_capability_control_plane
  ]

  tags = merge(local.tags, {
    Purpose = "KRO capability for control plane cluster"
  })
}

################################################################################
# KRO Capability for Data Plane Cluster
################################################################################

resource "aws_eks_capability" "kro_capability_data_plane" {
  cluster_name              = module.eks_data_plane.cluster_name
  capability_name           = "data-plane-kro"
  type                      = "KRO"
  role_arn                  = aws_iam_role.kro_capability_role.arn
  delete_propagation_policy = "RETAIN"

  depends_on = [
    module.eks_data_plane,
    aws_iam_role.kro_capability_role,
    aws_iam_role_policy.kro_capability_policy,
    aws_eks_capability.argocd_capability_data_plane
  ]

  tags = merge(local.tags, {
    Purpose = "KRO capability for data plane cluster"
  })
}