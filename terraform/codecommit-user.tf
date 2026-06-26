################################################################################
# CodeCommit User and SSH Key Configuration
################################################################################

# IAM user for CodeCommit access
resource "aws_iam_user" "codecommit_user" {
  name = "saas-codecommit-user"
  path = "/"

  tags = merge(local.tags, {
    Purpose = "CodeCommit access for workshop participants"
  })
}

# Full CodeCommit access policy for the user
resource "aws_iam_user_policy" "codecommit_user_full_access" {
  name = "codecommit-full-access"
  user = aws_iam_user.codecommit_user.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "codecommit:*"
        ]
        Resource = "*"
      }
    ]
  })
}

# Attach CodeCommit policies to the user
resource "aws_iam_user_policy_attachment" "codecommit_user_platform_configs" {
  user       = aws_iam_user.codecommit_user.name
  policy_arn = aws_iam_policy.platform_configs_access.arn
}

resource "aws_iam_user_policy_attachment" "codecommit_user_workloads" {
  user       = aws_iam_user.codecommit_user.name
  policy_arn = aws_iam_policy.workloads_access.arn
}

