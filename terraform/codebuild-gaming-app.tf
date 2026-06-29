################################################################################
# ECR Repository for Gaming Application Container Images
################################################################################

resource "aws_ecr_repository" "gaming_app" {
  name                 = "saas-gaming-app"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.tags, {
    Application = "gaming-app"
    Purpose     = "Container images"
  })
}


################################################################################
# IAM Role for CodeBuild
################################################################################

resource "aws_iam_role" "codebuild_gaming_app" {
  name = "codebuild-gaming-app-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(local.tags, {
    Purpose = "CodeBuild service role for gaming app"
  })
}

# IAM Policy for CodeBuild
resource "aws_iam_role_policy" "codebuild_gaming_app" {
  name = "codebuild-gaming-app-policy"
  role = aws_iam_role.codebuild_gaming_app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/codebuild/saas-gaming-app-build",
          "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/codebuild/saas-gaming-app-build:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "codecommit:GitPull"
        ]
        Resource = aws_codecommit_repository.gaming_app.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetAuthorizationToken",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.codebuild_artifacts.arn}",
          "${aws_s3_bucket.codebuild_artifacts.arn}/*"
        ]
      }
    ]
  })
}

################################################################################
# S3 Bucket for CodeBuild Artifacts
################################################################################

resource "aws_s3_bucket" "codebuild_artifacts" {
  bucket = "saas-gaming-app-codebuild-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"

  tags = merge(local.tags, {
    Purpose = "CodeBuild artifacts storage"
  })
}

resource "aws_s3_bucket_versioning" "codebuild_artifacts" {
  bucket = aws_s3_bucket.codebuild_artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "codebuild_artifacts" {
  bucket = aws_s3_bucket.codebuild_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "codebuild_artifacts" {
  bucket = aws_s3_bucket.codebuild_artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

################################################################################
# CodeBuild Project for Gaming Application
################################################################################

resource "aws_codebuild_project" "gaming_app" {
  name          = "saas-gaming-app-build"
  description   = "Build and push the SaaS Gaming Application container image"
  build_timeout = 30
  service_role  = aws_iam_role.codebuild_gaming_app.arn

  artifacts {
    type = "NO_ARTIFACTS"
  }

  cache {
    type  = "LOCAL"
    modes = ["LOCAL_DOCKER_LAYER_CACHE", "LOCAL_SOURCE_CACHE"]
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/amazonlinux2-x86_64-standard:5.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = true

    environment_variable {
      name  = "AWS_ACCOUNT_ID"
      value = data.aws_caller_identity.current.account_id
    }

    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = data.aws_region.current.region
    }

    environment_variable {
      name  = "ECR_REPOSITORY_URI"
      value = aws_ecr_repository.gaming_app.repository_url
    }

    environment_variable {
      name  = "IMAGE_TAG"
      value = "latest"
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/saas-gaming-app-build"
      stream_name = "build-log"
    }
  }

  source {
    type            = "CODECOMMIT"
    location        = aws_codecommit_repository.gaming_app.clone_url_http
    git_clone_depth = 1
    buildspec       = <<-EOF
      version: 0.2

      phases:
        pre_build:
          commands:
            - echo Logging in to Amazon ECR...
            - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
            - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
            - IMAGE_TAG=$${IMAGE_TAG:-latest}
        build:
          commands:
            - echo Build started on `date`
            - echo Building the Docker image...
            - docker build -t $ECR_REPOSITORY_URI:latest .
            - docker tag $ECR_REPOSITORY_URI:latest $ECR_REPOSITORY_URI:$COMMIT_HASH
            - docker tag $ECR_REPOSITORY_URI:latest $ECR_REPOSITORY_URI:$IMAGE_TAG
        post_build:
          commands:
            - echo Build completed on `date`
            - echo Pushing the Docker images...
            - docker push $ECR_REPOSITORY_URI:latest
            - docker push $ECR_REPOSITORY_URI:$COMMIT_HASH
            - docker push $ECR_REPOSITORY_URI:$IMAGE_TAG
            - echo Writing image definitions file...
            - printf '{"ImageURI":"%s"}' $ECR_REPOSITORY_URI:$IMAGE_TAG > imageDetail.json

      artifacts:
        files:
          - imageDetail.json
    EOF
  }

  tags = merge(local.tags, {
    Application = "gaming-app"
    Purpose     = "Container image build"
  })
}

################################################################################
# CodeBuild Trigger on CodeCommit Push (Optional - via EventBridge)
################################################################################

resource "aws_cloudwatch_event_rule" "gaming_app_build_trigger" {
  name        = "saas-gaming-app-build-trigger"
  description = "Trigger CodeBuild on push to main branch"

  event_pattern = jsonencode({
    source      = ["aws.codecommit"]
    detail-type = ["CodeCommit Repository State Change"]
    resources   = [aws_codecommit_repository.gaming_app.arn]
    detail = {
      event         = ["referenceCreated", "referenceUpdated"]
      referenceType = ["branch"]
      referenceName = ["main"]
    }
  })

  tags = local.tags
}

resource "aws_cloudwatch_event_target" "gaming_app_build" {
  rule      = aws_cloudwatch_event_rule.gaming_app_build_trigger.name
  target_id = "TriggerCodeBuild"
  arn       = aws_codebuild_project.gaming_app.arn
  role_arn  = aws_iam_role.eventbridge_codebuild.arn
}

# IAM Role for EventBridge to trigger CodeBuild
resource "aws_iam_role" "eventbridge_codebuild" {
  name = "eventbridge-codebuild-gaming-app-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "eventbridge_codebuild" {
  name = "eventbridge-codebuild-policy"
  role = aws_iam_role.eventbridge_codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "codebuild:StartBuild"
        Resource = aws_codebuild_project.gaming_app.arn
      }
    ]
  })
}

################################################################################
# Local value for gaming app image URI
################################################################################

locals {
  gaming_app_image_uri = "${aws_ecr_repository.gaming_app.repository_url}:latest"
}
