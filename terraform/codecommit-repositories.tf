################################################################################
# CodeCommit Repositories
################################################################################

# Platform Configs Repository - aligned with Control Plane
resource "aws_codecommit_repository" "platform_configs" {
  repository_name = "saas-platform-configs"
  description     = "Platform configurations repository aligned with EKS control plane cluster"

  tags = merge(local.tags, {
    Repository  = "platform-configs"
    AlignedWith = "control-plane"
    Purpose     = "Platform configuration management"
  })
}

# Workloads Repository - aligned with Data Plane
resource "aws_codecommit_repository" "workloads" {
  repository_name = "saas-workloads"
  description     = "Workloads repository aligned with EKS data plane clusters"

  tags = merge(local.tags, {
    Repository  = "workloads"
    AlignedWith = "data-plane"
    Purpose     = "Application workload management"
  })
}

################################################################################
# CodeCommit Repository for Gaming Application Source Code
################################################################################

# CodeCommit Repository for Gaming Application Source Code
resource "aws_codecommit_repository" "gaming_app" {
  repository_name = "saas-gaming-app"
  description     = "Source code repository for the SaaS Gaming Application"

  tags = merge(local.tags, {
    Repository = "gaming-app"
    AlignedWith = "data-plane"
    Purpose    = "Application source code"
  })
}
