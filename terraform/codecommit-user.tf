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


# Attach gaming app policy to the CodeCommit user
resource "aws_iam_user_policy_attachment" "codecommit_user_gaming_app" {
  user       = aws_iam_user.codecommit_user.name
  policy_arn = aws_iam_policy.gaming_app_access.arn
}

################################################################################
# SSH Key for the CodeCommit user
################################################################################
resource "tls_private_key" "codecommit_user" {
  algorithm = "RSA"
  rsa_bits  = 4096
}
resource "aws_iam_user_ssh_key" "codecommit_user" {
  username   = aws_iam_user.codecommit_user.name
  encoding   = "SSH"
  public_key = tls_private_key.codecommit_user.public_key_openssh
}
resource "aws_secretsmanager_secret" "ssh_private_key" {
  name        = var.secret_ssh_private_key_name
  description = "SSH private key for CodeCommit operations"
  recovery_window_in_days = 0
}
resource "aws_secretsmanager_secret_version" "ssh_private_key" {
  secret_id     = aws_secretsmanager_secret.ssh_private_key.id
  secret_string = tls_private_key.codecommit_user.private_key_pem
}
resource "aws_secretsmanager_secret" "ssh_key_id" {
  name        = var.secret_ssh_public_key_id_name
  description = "SSH public key ID for CodeCommit access"
  recovery_window_in_days = 0
}
resource "aws_secretsmanager_secret_version" "ssh_key_id" {
  secret_id     = aws_secretsmanager_secret.ssh_key_id.id
  secret_string = aws_iam_user_ssh_key.codecommit_user.ssh_public_key_id
}
