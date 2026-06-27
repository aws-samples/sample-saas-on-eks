################################################################################
# Outputs for SaaS on EKS Workshop Infrastructure
################################################################################

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC where everything is created"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnets" {
  description = "List of IDs of private subnets"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "List of IDs of public subnets"
  value       = module.vpc.public_subnets
}

output "region" {
  description = "AWS region"
  value       = data.aws_region.current.region
}

# Control Plane Cluster Outputs
output "control_plane_cluster_name" {
  description = "Name of the control plane EKS cluster"
  value       = module.eks_control_plane.cluster_name
}

output "control_plane_cluster_arn" {
  description = "ARN of the control plane EKS cluster"
  value       = module.eks_control_plane.cluster_arn
}

output "control_plane_cluster_endpoint" {
  description = "Endpoint for control plane Kubernetes API server"
  value       = module.eks_control_plane.cluster_endpoint
}

output "control_plane_cluster_version" {
  description = "The Kubernetes version for the control plane cluster"
  value       = module.eks_control_plane.cluster_version
}

output "control_plane_cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data for control plane cluster"
  value       = module.eks_control_plane.cluster_certificate_authority_data
}

output "control_plane_oidc_provider_arn" {
  description = "The ARN of the OIDC Provider for control plane cluster"
  value       = module.eks_control_plane.oidc_provider_arn
}

# Data Plane Cluster Outputs
output "data_plane_cluster_name" {
  description = "Name of the data plane EKS cluster"
  value       = module.eks_data_plane.cluster_name
}

output "data_plane_cluster_arn" {
  description = "ARN of the data plane EKS cluster"
  value       = module.eks_data_plane.cluster_arn
}

output "data_plane_cluster_endpoint" {
  description = "Endpoint for data plane Kubernetes API server"
  value       = module.eks_data_plane.cluster_endpoint
}

output "data_plane_cluster_version" {
  description = "The Kubernetes version for the data plane cluster"
  value       = module.eks_data_plane.cluster_version
}

output "data_plane_cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data for data plane cluster"
  value       = module.eks_data_plane.cluster_certificate_authority_data
}

output "data_plane_oidc_provider_arn" {
  description = "The ARN of the OIDC Provider for data plane cluster"
  value       = module.eks_data_plane.oidc_provider_arn
}

# kubectl Configuration Commands
output "configure_kubectl_control_plane" {
  description = "Configure kubectl for control plane cluster"
  value       = "aws eks --region ${data.aws_region.current.region} update-kubeconfig --name ${module.eks_control_plane.cluster_name}"
}

output "configure_kubectl_data_plane" {
  description = "Configure kubectl for data plane cluster"
  value       = "aws eks --region ${data.aws_region.current.region} update-kubeconfig --name ${module.eks_data_plane.cluster_name}"
}

################################################################################
# CodeCommit Repository Outputs
################################################################################

# Platform Configs Repository
output "platform_configs_repository_name" {
  description = "Name of the platform configs CodeCommit repository"
  value       = aws_codecommit_repository.platform_configs.repository_name
}

output "platform_configs_repository_arn" {
  description = "ARN of the platform configs CodeCommit repository"
  value       = aws_codecommit_repository.platform_configs.arn
}

output "platform_configs_clone_url_http" {
  description = "HTTP clone URL for platform configs repository"
  value       = aws_codecommit_repository.platform_configs.clone_url_http
}

output "platform_configs_clone_url_ssh" {
  description = "SSH clone URL for platform configs repository"
  value       = aws_codecommit_repository.platform_configs.clone_url_ssh
}

# Workloads Repository
output "workloads_repository_name" {
  description = "Name of the workloads CodeCommit repository"
  value       = aws_codecommit_repository.workloads.repository_name
}

output "workloads_repository_arn" {
  description = "ARN of the workloads CodeCommit repository"
  value       = aws_codecommit_repository.workloads.arn
}

output "workloads_clone_url_http" {
  description = "HTTP clone URL for workloads repository"
  value       = aws_codecommit_repository.workloads.clone_url_http
}

output "workloads_clone_url_ssh" {
  description = "SSH clone URL for workloads repository"
  value       = aws_codecommit_repository.workloads.clone_url_ssh
}

# IAM Policy ARNs
output "platform_configs_access_policy_arn" {
  description = "ARN of the IAM policy for platform configs repository access"
  value       = aws_iam_policy.platform_configs_access.arn
}



# CodeCommit User
output "codecommit_user_arn" {
  description = "ARN of the CodeCommit IAM user"
  value       = aws_iam_user.codecommit_user.arn
}

output "codecommit_user_name" {
  description = "Name of the CodeCommit IAM user"
  value       = aws_iam_user.codecommit_user.name
}

output "codecommit_pipeline_role_arn" {
  description = "ARN of the IAM role for CI/CD pipeline access to repositories"
  value       = aws_iam_role.codecommit_pipeline_role.arn
}
################################################################################
# EKS Capabilities Outputs
################################################################################

output "ack_capability_role_arn" {
  description = "ARN of the ACK capability IAM role"
  value       = aws_iam_role.ack_capability_role.arn
}

output "ack_capability_role_name" {
  description = "Name of the ACK capability IAM role"
  value       = aws_iam_role.ack_capability_role.name
}

# Commands to verify ACK capabilities
output "verify_ack_control_plane" {
  description = "Command to verify ACK capability on control plane cluster"
  value       = "aws eks list-capabilities --region ${data.aws_region.current.region} --cluster-name ${module.eks_control_plane.cluster_name}"
}

output "verify_ack_data_plane" {
  description = "Command to verify ACK capability on data plane cluster"
  value       = "aws eks list-capabilities --region ${data.aws_region.current.region} --cluster-name ${module.eks_data_plane.cluster_name}"
}
################################################################################
# Identity Center Outputs
################################################################################

output "identity_center_instance_arn" {
  description = "ARN of the Identity Center instance"
  value       = tolist(data.aws_ssoadmin_instances.identity_center.arns)[0]
}

output "identity_center_identity_store_id" {
  description = "Identity Store ID for Identity Center"
  value       = tolist(data.aws_ssoadmin_instances.identity_center.identity_store_ids)[0]
}

output "argo_admin_user_id" {
  description = "User ID of the Argo CD admin user in Identity Center"
  value       = aws_identitystore_user.argo_admin.user_id
}

output "argo_admin_username" {
  description = "Username for Argo CD admin user"
  value       = var.argo_admin_username
}

output "argo_admin_password" {
  description = "Password for Argo CD admin user"
  value       = random_password.argo_admin_password.result
  sensitive   = true
}

output "argo_admin_email" {
  description = "Email for Argo CD admin user"
  value       = var.argo_admin_email
}

output "argo_admins_group_id" {
  description = "Group ID of the Argo Admins group in Identity Center"
  value       = aws_identitystore_group.argo_admins.group_id
}

# output "argo_permission_set_arn" {
#   description = "ARN of the Argo CD permission set"
#   value       = aws_ssoadmin_permission_set.argo_access.arn
# }

# Command to show the admin password
output "show_argo_admin_password" {
  description = "Command to show the Argo CD admin password"
  value       = "terraform output -raw argo_admin_password"
}
################################################################################
# Argo CD Capability Outputs
################################################################################

output "argocd_capability_role_arn" {
  description = "ARN of the Argo CD capability IAM role"
  value       = aws_iam_role.argocd_capability_role.arn
}

output "argocd_capability_role_name" {
  description = "Name of the Argo CD capability IAM role"
  value       = aws_iam_role.argocd_capability_role.name
}

# Commands to get Argo CD URLs
output "get_argocd_url_control_plane" {
  description = "Command to get Argo CD URL for control plane cluster"
  value       = "aws eks describe-capability --region ${data.aws_region.current.region} --cluster-name ${module.eks_control_plane.cluster_name} --capability-name control-plane-argocd --query 'capability.status.configuration.argocdUrl' --output text"
}

output "get_argocd_url_data_plane" {
  description = "Command to get Argo CD URL for data plane cluster"
  value       = "aws eks describe-capability --region ${data.aws_region.current.region} --cluster-name ${module.eks_data_plane.cluster_name} --capability-name data-plane-argocd --query 'capability.status.configuration.argocdUrl' --output text"
}

# Commands to verify Argo CD capabilities
output "verify_argocd_control_plane" {
  description = "Command to verify Argo CD capability on control plane cluster"
  value       = "aws eks list-capabilities --region ${data.aws_region.current.region} --cluster-name ${module.eks_control_plane.cluster_name} --query 'capabilities[?type==`ARGOCD`]'"
}

output "verify_argocd_data_plane" {
  description = "Command to verify Argo CD capability on data plane cluster"
  value       = "aws eks list-capabilities --region ${data.aws_region.current.region} --cluster-name ${module.eks_data_plane.cluster_name} --query 'capabilities[?type==`ARGOCD`]'"
}
################################################################################
# KRO Capability Outputs
################################################################################

output "kro_capability_role_arn" {
  description = "ARN of the KRO capability IAM role"
  value       = aws_iam_role.kro_capability_role.arn
}

output "kro_capability_role_name" {
  description = "Name of the KRO capability IAM role"
  value       = aws_iam_role.kro_capability_role.name
}

# Commands to verify KRO capabilities
output "verify_kro_control_plane" {
  description = "Command to verify KRO capability on control plane cluster"
  value       = "aws eks list-capabilities --region ${data.aws_region.current.region} --cluster-name ${module.eks_control_plane.cluster_name} --query 'capabilities[?type==`KRO`]'"
}

output "verify_kro_data_plane" {
  description = "Command to verify KRO capability on data plane cluster"
  value       = "aws eks list-capabilities --region ${data.aws_region.current.region} --cluster-name ${module.eks_data_plane.cluster_name} --query 'capabilities[?type==`KRO`]'"
}