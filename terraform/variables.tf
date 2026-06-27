################################################################################
# Variables for SaaS on EKS Workshop Infrastructure
################################################################################

variable "region" {
  description = "AWS region for resources"
  type        = string
  default     = null
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS clusters"
  type        = string
  default     = "1.34"
}

variable "enable_cluster_creator_admin_permissions" {
  description = "Enable admin permissions for cluster creator"
  type        = bool
  default     = true
}

variable "cluster_endpoint_public_access" {
  description = "Enable public access to cluster endpoint"
  type        = bool
  default     = true
}
################################################################################
# Argo CD Configuration Variables
################################################################################

variable "argo_admin_username" {
  description = "Username for Argo CD admin user"
  type        = string
  default     = "argo-admin"
}

variable "argo_admin_email" {
  description = "Email for Argo CD admin user"
  type        = string
  default     = "admin@example.com"
}

variable "argo_admin_display_name" {
  description = "Display name for Argo CD admin user"
  type        = string
  default     = "Argo CD Administrator"
}