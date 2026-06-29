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

# IAM policy for gaming-app repository access
resource "aws_iam_policy" "gaming_app_access" {
  name        = "saas-gaming-app-access"
  description = "Policy for accessing gaming-app CodeCommit repository"

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
          "codecommit:ListRepositories",
          "codecommit:CreateBranch",
          "codecommit:DeleteBranch",
          "codecommit:GetFile",
          "codecommit:GetFolder",
          "codecommit:PutFile"
        ]
        Resource = aws_codecommit_repository.gaming_app.arn
      }
    ]
  })

  tags = merge(local.tags, {
    Repository = "gaming-app"
    Purpose    = "Repository access policy"
  })
}
