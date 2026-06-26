################################################################################
# SaaS on EKS Workshop Infrastructure - Simplified Configuration
################################################################################

# Data sources for current AWS context
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  # Do not include local zones
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
  # Exclude problematic zones
  exclude_zone_ids = ["use1-az3", "usw1-az2", "cac1-az3"]
}

# Local values for consistent naming and configuration
locals {
  # Cluster names
  control_plane_cluster_name = "saas-control-plane"
  data_plane_cluster_name    = "saas-data-plane"

  # VPC configuration
  vpc_cidr = var.vpc_cidr
  azs      = slice(data.aws_availability_zones.available.names, 0, 3)

  # Common tags
  tags = {
    Environment = "workshop"
    Project     = "saas-on-eks"
    ManagedBy   = "terraform"
  }
}

################################################################################
# Provider Configuration
################################################################################

terraform {
  required_version = ">= 1.3"

  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = ">= 6.26.0"
      configuration_aliases = [aws.virginia]
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "2.20"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "2.17.0"
    }
    kubectl = {
      source  = "alekc/kubectl"
      version = "2.1.3"
    }
  }
}

provider "aws" {
  alias  = "virginia"
  region = "us-east-1"
}

################################################################################
# Kubernetes Providers for Control Plane Cluster
################################################################################

provider "kubernetes" {
  alias = "control_plane"

  host                   = module.eks_control_plane.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks_control_plane.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks_control_plane.cluster_name, "--region", data.aws_region.current.region]
  }
}

provider "helm" {
  alias = "control_plane"

  kubernetes {
    host                   = module.eks_control_plane.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks_control_plane.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks_control_plane.cluster_name, "--region", data.aws_region.current.region]
    }
  }
}

provider "kubectl" {
  alias = "control_plane"

  apply_retry_count      = 5
  host                   = module.eks_control_plane.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks_control_plane.cluster_certificate_authority_data)
  load_config_file       = false

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks_control_plane.cluster_name, "--region", data.aws_region.current.region]
  }
}

################################################################################
# Kubernetes Providers for Data Plane Cluster
################################################################################

provider "kubernetes" {
  alias = "data_plane"

  host                   = module.eks_data_plane.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks_data_plane.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks_data_plane.cluster_name, "--region", data.aws_region.current.region]
  }
}

provider "helm" {
  alias = "data_plane"

  kubernetes {
    host                   = module.eks_data_plane.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks_data_plane.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks_data_plane.cluster_name, "--region", data.aws_region.current.region]
    }
  }
}

provider "kubectl" {
  alias = "data_plane"

  apply_retry_count      = 5
  host                   = module.eks_data_plane.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks_data_plane.cluster_certificate_authority_data)
  load_config_file       = false

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks_data_plane.cluster_name, "--region", data.aws_region.current.region]
  }
}