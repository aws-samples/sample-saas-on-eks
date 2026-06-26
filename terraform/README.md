# Terraform

This directory contains the Terraform configuration that provisions the complete SaaS-on-EKS infrastructure. It deploys a multi-cluster architecture with EKS capabilities for GitOps, resource orchestration, and AWS service integration.

## Architecture Overview

The infrastructure follows a **control plane / data plane** separation pattern:

```
┌─────────────────────────────────────────────────────────┐
│                        VPC                              │
│                                                         │
│  ┌────────────────────────┐  ┌────────────────────────┐ │
│  │  saas-control-plane    │  │  saas-data-plane       │ │
│  │  (EKS Auto Mode)      │  │  (EKS Auto Mode)       │ │
│  │                        │  │                        │ │
│  │  • Argo CD Capability  │  │  • Argo CD Capability  │ │
│  │  • ACK Capability      │  │  • ACK Capability      │ │
│  │  • KRO Capability      │  │  • KRO Capability      │ │
│  └────────────────────────┘  └────────────────────────┘ │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  CodeCommit Repositories                           │ │
│  │  • saas-platform-configs (→ control plane)         │ │
│  │  • saas-workloads        (→ data plane)            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  AWS Identity Center                               │ │
│  │  • Argo CD admin user & group                      │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## File Descriptions

| File | Purpose |
|------|---------|
| `main.tf` | Provider configuration, locals, and Kubernetes/Helm provider aliases for both clusters |
| `variables.tf` | Input variables (region, VPC CIDR, cluster version, Argo CD user settings) |
| `outputs.tf` | All outputs including cluster endpoints, CodeCommit URLs, and verification commands |
| `vpc.tf` | VPC with public/private subnets across 3 AZs using the `terraform-aws-modules/vpc/aws` module |
| `eks-control-plane.tf` | Control plane EKS cluster (Auto Mode with general-purpose and system node pools) |
| `eks-data-plane.tf` | Data plane EKS cluster (same configuration as control plane) |
| `eks-capabilities.tf` | EKS capabilities: ACK, Argo CD, and KRO with their IAM roles and policies |
| `capabilities_configuration.tf` | Argo CD cluster secrets and EKS access policy associations |
| `codecommit-repositories.tf` | CodeCommit repositories for platform configs and workloads |
| `codecommit-iam.tf` | IAM policies for CodeCommit repository access |
| `codecommit-user.tf` | IAM user for CodeCommit Git operations |
| `identity-center.tf` | AWS Identity Center user, group, and membership for Argo CD authentication |

## Prerequisites

- **Terraform** >= 1.3
- **AWS CLI** configured with appropriate permissions
- **AWS Identity Center** enabled in the target account (required for Argo CD SSO)
- **kubectl** installed for post-deployment verification

## Input Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `region` | AWS region for resources | `null` (uses provider default) |
| `vpc_cidr` | CIDR block for the VPC | `10.0.0.0/16` |
| `cluster_version` | Kubernetes version for EKS clusters | `1.34` |
| `enable_cluster_creator_admin_permissions` | Grant admin to cluster creator | `true` |
| `cluster_endpoint_public_access` | Enable public API endpoint | `true` |
| `argo_admin_username` | Username for Argo CD admin | `argo-admin` |
| `argo_admin_email` | Email for Argo CD admin user | `admin@example.com` |
| `argo_admin_display_name` | Display name for Argo CD admin | `Argo CD Administrator` |

## Deployment

```bash
# Initialize Terraform
terraform init

# Review the execution plan
terraform plan

# Apply the configuration
terraform apply
```

## Post-Deployment

After a successful apply, configure `kubectl` access to both clusters:

```bash
# Control plane cluster
aws eks --region <region> update-kubeconfig --name saas-control-plane

# Data plane cluster
aws eks --region <region> update-kubeconfig --name saas-data-plane
```

Retrieve the Argo CD admin password:

```bash
terraform output -raw argo_admin_password
```

Get the Argo CD console URLs:

```bash
# Control plane Argo CD
aws eks describe-capability --region <region> --cluster-name saas-control-plane \
  --capability-name control-plane-argocd \
  --query 'capability.status.configuration.argocdUrl' --output text

# Data plane Argo CD
aws eks describe-capability --region <region> --cluster-name saas-data-plane \
  --capability-name data-plane-argocd \
  --query 'capability.status.configuration.argocdUrl' --output text
```

## EKS Capabilities

| Capability | Type | Purpose |
|------------|------|---------|
| ACK | AWS Controllers for Kubernetes | Provision AWS resources (e.g., S3 buckets) directly from Kubernetes manifests |
| Argo CD | GitOps continuous delivery | Sync platform configs and workloads from CodeCommit to clusters |
| KRO | Kubernetes Resource Orchestrator | Define composable resource packages (ResourceGraphDefinitions) for tenants |

## Cleanup

```bash
terraform destroy
```

> **Note:** Capabilities are configured with `delete_propagation_policy = "RETAIN"`, so some in-cluster resources may remain after Terraform destroy. Verify manually if a complete cleanup is required.
