################################################################################
# IAM Policies for CodeCommit Repository Access
################################################################################

# IAM policy for platform-configs repository access
resource "aws_iam_policy" "platform_configs_access" {
  name        = "saas-platform-configs-access"
  description = "Policy for accessing platform-configs CodeCommit repository"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "codecommit:GitPull",
          "codecommit:GitPush",
          "codecommit:GetBranch",
          "codecommit:GetCommit",
          "codecommit:GetRepository",
          "codecommit:ListBranches",
          "codecommit:ListRepositories"
        ]
        Resource = aws_codecommit_repository.platform_configs.arn
      }
    ]
  })

  tags = merge(local.tags, {
    Repository = "platform-configs"
    Purpose    = "Repository access policy"
  })
}

# IAM policy for workloads repository access
resource "aws_iam_policy" "workloads_access" {
  name        = "saas-workloads-access"
  description = "Policy for accessing workloads CodeCommit repository"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "codecommit:GitPull",
          "codecommit:GitPush",
          "codecommit:GetBranch",
          "codecommit:GetCommit",
          "codecommit:GetRepository",
          "codecommit:ListBranches",
          "codecommit:ListRepositories"
        ]
        Resource = aws_codecommit_repository.workloads.arn
      }
    ]
  })

  tags = merge(local.tags, {
    Repository = "workloads"
    Purpose    = "Repository access policy"
  })
}

################################################################################
# IAM Role for CI/CD Pipeline (optional)
################################################################################

# IAM role for CI/CD pipeline that needs access to both repositories
resource "aws_iam_role" "codecommit_pipeline_role" {
  name = "saas-codecommit-pipeline-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = [
            "codepipeline.amazonaws.com",
            "codebuild.amazonaws.com"
          ]
        }
      }
    ]
  })

  tags = merge(local.tags, {
    Purpose = "CI/CD pipeline role for CodeCommit access"
  })
}

# Attach policies to the pipeline role
resource "aws_iam_role_policy_attachment" "pipeline_platform_configs" {
  role       = aws_iam_role.codecommit_pipeline_role.name
  policy_arn = aws_iam_policy.platform_configs_access.arn
}

resource "aws_iam_role_policy_attachment" "pipeline_workloads" {
  role       = aws_iam_role.codecommit_pipeline_role.name
  policy_arn = aws_iam_policy.workloads_access.arn
}