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
# Repository Outputs
################################################################################

output "platform_configs_repository" {
  description = "Platform configs CodeCommit repository details"
  value = {
    name           = aws_codecommit_repository.platform_configs.repository_name
    arn            = aws_codecommit_repository.platform_configs.arn
    clone_url_http = aws_codecommit_repository.platform_configs.clone_url_http
    clone_url_ssh  = aws_codecommit_repository.platform_configs.clone_url_ssh
    repository_id  = aws_codecommit_repository.platform_configs.repository_id
  }
}

output "workloads_repository" {
  description = "Workloads CodeCommit repository details"
  value = {
    name           = aws_codecommit_repository.workloads.repository_name
    arn            = aws_codecommit_repository.workloads.arn
    clone_url_http = aws_codecommit_repository.workloads.clone_url_http
    clone_url_ssh  = aws_codecommit_repository.workloads.clone_url_ssh
    repository_id  = aws_codecommit_repository.workloads.repository_id
  }
}