################################################################################
# AWS Identity Center (SSO) Configuration
################################################################################

# PREREQUISITE: Identity Center must be enabled in your AWS account
# You can enable it through the AWS Console or CLI:
# aws sso-admin create-instance --name "saas-workshop-identity-center"
# 
# This configuration assumes an existing Identity Center instance

# Get existing Identity Center instances
data "aws_ssoadmin_instances" "identity_center" {}

################################################################################
# Identity Center User for Argo CD
################################################################################

# Create Identity Center user for Argo CD
resource "aws_identitystore_user" "argo_admin" {
  identity_store_id = tolist(data.aws_ssoadmin_instances.identity_center.identity_store_ids)[0]

  display_name = var.argo_admin_display_name
  user_name    = var.argo_admin_username

  name {
    given_name  = "Argo"
    family_name = "Administrator"
  }

  emails {
    value   = var.argo_admin_email
    primary = true
  }
}

# Generate a random password for the Argo admin user
resource "random_password" "argo_admin_password" {
  length  = 16
  special = true
}

################################################################################
# Identity Center Group for Argo Admins
################################################################################

# Create Argo Admins group
resource "aws_identitystore_group" "argo_admins" {
  identity_store_id = tolist(data.aws_ssoadmin_instances.identity_center.identity_store_ids)[0]

  display_name = "ArgoAdmins"
  description  = "Administrators for Argo CD"
}

# Add user to Argo Admins group
resource "aws_identitystore_group_membership" "argo_admin_membership" {
  identity_store_id = tolist(data.aws_ssoadmin_instances.identity_center.identity_store_ids)[0]
  group_id          = aws_identitystore_group.argo_admins.group_id
  member_id         = aws_identitystore_user.argo_admin.user_id
}

################################################################################
# Permission Set for Argo CD Access
################################################################################

# Create permission set for Argo CD access
# resource "aws_ssoadmin_permission_set" "argo_access" {
#   name             = "ArgoCD-Access"
#   description      = "Permission set for Argo CD access"
#   instance_arn     = tolist(data.aws_ssoadmin_instances.identity_center.arns)[0]
#   session_duration = "PT8H" # 8 hours

#   tags = merge(local.tags, {
#     Purpose = "Argo CD access permissions"
#   })
# }

# Attach managed policy to permission set
# resource "aws_ssoadmin_managed_policy_attachment" "argo_access_policy" {
#   instance_arn       = tolist(data.aws_ssoadmin_instances.identity_center.arns)[0]
#   managed_policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
#   permission_set_arn = aws_ssoadmin_permission_set.argo_access.arn
# }

# # Create inline policy for EKS access
# resource "aws_ssoadmin_permission_set_inline_policy" "argo_eks_access" {
#   inline_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Effect = "Allow"
#         Action = [
#           "eks:DescribeCluster",
#           "eks:ListClusters",
#           "eks:DescribeCapability",
#           "eks:ListCapabilities"
#         ]
#         Resource = "*"
#       }
#     ]
#   })
#   instance_arn       = tolist(data.aws_ssoadmin_instances.identity_center.arns)[0]
#   permission_set_arn = aws_ssoadmin_permission_set.argo_access.arn
# }

################################################################################
# Account Assignment
################################################################################

# Assign permission set to the Argo Admins group
# resource "aws_ssoadmin_account_assignment" "argo_admin_assignment" {
#   instance_arn       = tolist(data.aws_ssoadmin_instances.identity_center.arns)[0]
#   permission_set_arn = aws_ssoadmin_permission_set.argo_access.arn

#   principal_id   = aws_identitystore_group.argo_admins.group_id
#   principal_type = "GROUP"

#   target_id   = data.aws_caller_identity.current.account_id
#   target_type = "AWS_ACCOUNT"
# }