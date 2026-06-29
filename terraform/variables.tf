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
  default     = "1.35"
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

################################################################################
# Secret Manager Variables
################################################################################
variable "secret_ssh_private_key_name" {
  description = "Secret name for ssh private key for codecommit access"
  type        = string
  default     = "saas-codecommit-ssh-private-key"
}
variable "secret_ssh_public_key_id_name" {
  description = "Secret name for ssh public key id for codecommit access"
  type        = string
  default     = "saas-codecommit-ssh-key-id"
}



################################################################################
# Cost Allocation Configuration Variables
################################################################################

variable "quicksight_notification_email" {
  description = "Email address for QuickSight notifications"
  type        = string
  default     = "workshop-admin@example.com"
}

variable "cost_currency_symbol" {
  description = "ISO 4217 currency code used to format cost values in the QuickSight dashboard (e.g. USD, EUR, GBP)"
  type        = string
  default     = "USD"

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.cost_currency_symbol))
    error_message = "cost_currency_symbol must be a 3-letter uppercase ISO 4217 currency code (e.g. USD)."
  }
}

variable "ingress_inbound_cidrs" {
  description = "Allowed inbound CIDRs for Ingress resources"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
