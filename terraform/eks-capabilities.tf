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

# ACK least-privilege policy
#
# Derived from CloudTrail (principal = ACKCapabilityRole) after a full workshop
# run, then VALIDATED END-TO-END by attaching this exact policy to the ACK role
# (with AdministratorAccess removed) and re-running onboarding of a basic and a
# pro tenant until both reached Ready. That validation surfaced five actions the
# CloudTrail export alone missed:
#   - s3:Get*  (S3 IAM action names differ from CloudTrail event names, e.g.
#               event GetBucketAnalyticsConfiguration => action s3:GetAnalyticsConfiguration)
#   - s3:Put*Configuration bucket-config writes (encryption, ownership, etc.)
#   - eks:TagResource / eks:UntagResource on pod identity associations
#   - iam:PassRole (required to create a PodIdentityAssociation pointing at a role)
#
# The ACK capability in this workshop only manages four services: DynamoDB
# tables, S3 buckets, IAM roles/policies, and EKS Pod Identity associations.
# Resources are scoped to the workshop naming conventions where the AWS API
# supports resource-level permissions.
#
# To re-derive after changing the workshop, attach a candidate policy to the ACK
# role without AdministratorAccess, run a full onboarding, and read the
# ACK.Recoverable conditions on any stuck resource for the missing action:
#   kubectl get <ackresource> -n <ns> -o jsonpath='{.status.conditions}'
resource "aws_iam_role_policy" "ack_capability_policy" {
  name = "ACKCapabilityPolicy"
  role = aws_iam_role.ack_capability_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBTableManagement"
        Effect = "Allow"
        Action = [
          "dynamodb:CreateTable",
          "dynamodb:DeleteTable",
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeContributorInsights",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:GetResourcePolicy",
          "dynamodb:ListTagsOfResource",
          "dynamodb:TagResource",
          "dynamodb:UntagResource"
        ]
        Resource = "arn:aws:dynamodb:${local.region}:${data.aws_caller_identity.current.account_id}:table/*"
      },
      {
        Sid    = "S3BucketManagement"
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:DeleteBucketEncryption",
          "s3:DeleteBucketOwnershipControls",
          "s3:DeleteBucketPublicAccessBlock",
          # Bucket configuration writes performed by the ACK S3 controller on
          # create/reconcile. NOTE: several S3 IAM action names differ from the
          # CloudTrail event names (e.g. event GetBucketAnalyticsConfiguration
          # maps to IAM action s3:GetAnalyticsConfiguration). The read surface
          # is therefore granted as s3:Get* (all read-only) scoped to the
          # workshop buckets, which is simpler and avoids that mismatch.
          "s3:PutBucketTagging",
          "s3:PutEncryptionConfiguration",
          "s3:PutBucketOwnershipControls",
          "s3:PutBucketPublicAccessBlock",
          "s3:PutBucketVersioning",
          "s3:PutBucketAcl",
          "s3:PutBucketPolicy",
          "s3:PutLifecycleConfiguration",
          "s3:PutBucketLogging",
          "s3:PutBucketNotification",
          "s3:Get*",
          "s3:ListBucket"
        ]
        # S3 bucket ARNs are global (no region/account), so this is scoped to
        # the workshop bucket naming patterns instead.
        Resource = [
          "arn:aws:s3:::gaming-app-bucket-*",
          "arn:aws:s3:::gaming-app-assets-*",
          "arn:aws:s3:::pool-resources-*",
          "arn:aws:s3:::tenant-*"
        ]
      },
      {
        Sid      = "S3ListAllMyBuckets"
        Effect   = "Allow"
        Action   = "s3:ListAllMyBuckets"
        Resource = "*"
      },
      {
        Sid    = "IAMRoleAndPolicyManagement"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:UpdateRole",
          "iam:GetRole",
          "iam:ListRoleTags",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:TagRole",
          "iam:UntagRole"
        ]
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/gaming-app-role",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/gaming-app-app-role",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/tenant-*-app-role",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/KedaOperatorRole-*"
        ]
      },
      {
        Sid    = "IAMPolicyManagement"
        Effect = "Allow"
        Action = [
          "iam:CreatePolicy",
          "iam:DeletePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicyVersions",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion",
          "iam:TagPolicy",
          "iam:UntagPolicy"
        ]
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/gaming-app-policy",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/gaming-app-s3-policy",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/gaming-app-dynamodb-policy",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/tenant-*-dynamodb-policy",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/tenant-*-s3-policy",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/KedaOperatorPolicy-*"
        ]
      },
      {
        Sid    = "IAMPassRoleForPodIdentity"
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/gaming-app-role",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/gaming-app-app-role",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/tenant-*-app-role",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/KedaOperatorRole-*"
        ]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "pods.eks.amazonaws.com"
          }
        }
      },
      {
        Sid    = "EKSPodIdentityManagement"
        Effect = "Allow"
        Action = [
          "eks:CreatePodIdentityAssociation",
          "eks:DeletePodIdentityAssociation",
          "eks:DescribePodIdentityAssociation",
          "eks:TagResource",
          "eks:UntagResource"
        ]
        Resource = [
          "arn:aws:eks:${local.region}:${data.aws_caller_identity.current.account_id}:cluster/${local.control_plane_cluster_name}",
          "arn:aws:eks:${local.region}:${data.aws_caller_identity.current.account_id}:cluster/${local.data_plane_cluster_name}",
          "arn:aws:eks:${local.region}:${data.aws_caller_identity.current.account_id}:podidentityassociation/*"
        ]
      }
    ]
  })
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
    aws_iam_role_policy.ack_capability_policy
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
    aws_iam_role_policy.ack_capability_policy
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
        idc_region       = local.region
      }
      rbac_role_mapping {
        role = "ADMIN"
        identity {
          id   = aws_identitystore_group.argo_admins.group_id
          type = "SSO_GROUP"
        }
      }
    }
  }

  depends_on = [
    module.eks_control_plane,
    aws_iam_role.argocd_capability_role,
    aws_iam_role_policy.argocd_capability_policy,
    aws_identitystore_group.argo_admins,
    aws_codecommit_repository.platform_configs,
    aws_codecommit_repository.workloads,
    aws_eks_capability.ack_capability_control_plane
  ]

  tags = merge(local.tags, {
    Purpose = "Argo CD capability for control plane cluster"
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

# KRO least-privilege policy
#
# CloudTrail analysis after a full workshop run (onboarding + offboarding of
# basic and pro tenants) recorded ZERO AWS API calls by KROCapabilityRole.
# kro orchestrates Kubernetes resources and delegates all AWS resource
# provisioning to ACK - it does not talk to AWS APIs directly.
#
# The policy is therefore reduced to read-only EKS cluster discovery, which is
# the only category that could plausibly be needed by the managed capability
# control plane. Everything else (ec2:*, iam:PassRole, etc.) was removed - it
# was never exercised.
resource "aws_iam_role_policy" "kro_capability_policy" {
  name = "KROCapabilityPolicy"
  role = aws_iam_role.kro_capability_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EKSClusterDiscovery"
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
          "eks:ListClusters",
          "eks:DescribeCapability",
          "eks:ListCapabilities"
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
    aws_iam_role_policy.kro_capability_policy
  ]

  tags = merge(local.tags, {
    Purpose = "KRO capability for data plane cluster"
  })
}