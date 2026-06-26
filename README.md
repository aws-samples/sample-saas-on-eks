# Sample SaaS on Amazon EKS

This repository demonstrates a multi-tenant SaaS architecture built on Amazon EKS using a control plane / data plane cluster separation pattern. It leverages EKS capabilities (Argo CD, ACK, and KRO) to deliver a fully GitOps-driven platform where tenants are onboarded through simple Kubernetes manifests.

## Overview

The solution provisions two EKS Auto Mode clusters within a shared VPC:

- **Control Plane Cluster** — Hosts platform management components. Argo CD on this cluster syncs platform configurations (add-ons, resource graph definitions, and tenant packages) from the `saas-platform-configs` CodeCommit repository.
- **Data Plane Cluster** — Runs tenant workloads. Argo CD on this cluster syncs tenant definitions from the `saas-workloads` CodeCommit repository and uses KRO to expand them into full application stacks.

Tenant onboarding is as simple as committing a YAML file. KRO `ResourceGraphDefinitions` define what a "tenant package" includes (Deployment, Service, Ingress, S3 Bucket via ACK), and each tenant instance is a lightweight custom resource that references that package.

## Architecture

```
                    ┌───────────────────────────┐
                    │    AWS Identity Center     │
                    │    (Argo CD SSO login)     │
                    └─────────────┬─────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        │                        ▼
┌─────────────────┐               │              ┌─────────────────┐
│  saas-control-  │               │              │  saas-data-     │
│  plane cluster  │               │              │  plane cluster  │
│                 │               │              │                 │
│  ┌───────────┐  │               │              │  ┌───────────┐  │
│  │  Argo CD  │◄─┼───── CodeCommit ────────────►│  │  Argo CD  │  │
│  └───────────┘  │  saas-platform-configs       │  └───────────┘  │
│  ┌───────────┐  │  saas-workloads              │  ┌───────────┐  │
│  │    ACK    │  │               │              │  │    ACK    │  │
│  └───────────┘  │               │              │  └───────────┘  │
│  ┌───────────┐  │               │              │  ┌───────────┐  │
│  │    KRO    │  │               │              │  │    KRO    │  │
│  └───────────┘  │               │              │  └───────────┘  │
└─────────────────┘               │              └─────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │         Shared VPC         │
                    │   3 AZs • NAT Gateway      │
                    └───────────────────────────┘
```

## Repository Structure

```
.
├── terraform/              # Infrastructure as Code (VPC, EKS clusters, capabilities, IAM, CodeCommit)
└── repository-assets/      # Content to push to CodeCommit repositories after provisioning
    ├── saas-platform-configs/   # Platform configs → control plane Argo CD
    │   ├── add-ons/             #   Add-on Helm values and IAM (e.g., KEDA)
    │   ├── applicationsets/     #   Argo CD ApplicationSets
    │   ├── resourceGraphs/      #   KRO ResourceGraphDefinitions
    │   └── examples/            #   Sample tenant manifests
    └── saas-workloads/          # Workloads → data plane Argo CD
        ├── applicationsets/     #   Argo CD ApplicationSets
        └── tenants/             #   Tenant workload definitions
```

## Prerequisites

- An AWS account with [AWS Identity Center](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html) enabled
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.3
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) v2 configured with valid credentials
- [kubectl](https://kubernetes.io/docs/tasks/tools/) installed
- [Git](https://git-scm.com/) with HTTPS credentials configured for CodeCommit

## Getting Started

### 1. Deploy the Infrastructure

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

This provisions the VPC, both EKS clusters, all capabilities (ACK, Argo CD, KRO), CodeCommit repositories, IAM resources, and an Identity Center user for Argo CD access.

### 2. Push Repository Assets to CodeCommit

After Terraform completes, push the repository assets to the newly created CodeCommit repositories:

```bash
# Get clone URLs
PLATFORM_REPO=$(cd terraform && terraform output -raw platform_configs_clone_url_http)
WORKLOADS_REPO=$(cd terraform && terraform output -raw workloads_clone_url_http)

# Initialize and push platform configs
cd repository-assets/saas-platform-configs
git init && git add . && git commit -m "Initial platform configs"
git remote add origin "$PLATFORM_REPO"
git push -u origin main

# Initialize and push workloads
cd ../saas-workloads
git init && git add . && git commit -m "Initial workloads"
git remote add origin "$WORKLOADS_REPO"
git push -u origin main
```

### 3. Access Argo CD

Retrieve the Argo CD URL and credentials:

```bash
cd terraform

# Get the Argo CD URL
aws eks describe-capability --region $(terraform output -raw region) \
  --cluster-name saas-control-plane \
  --capability-name control-plane-argocd \
  --query 'capability.status.configuration.argocdUrl' --output text

# Get the admin password
terraform output -raw argo_admin_password
```

Log in using the Identity Center username (`argo-admin` by default) and the generated password.

### 4. Onboard a New Tenant

Create a new file in `repository-assets/saas-workloads/tenants/`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: tenant-3
---
apiVersion: kro.run/v1alpha1
kind: TenantBasicPackage
metadata:
  name: tenant-3
  namespace: tenant-3
spec:
  name: tenant-3
  image: nginx:latest
  replicas: 2
  bucketName: tenant-3-bucket-unique-12345
  containerPort: 80
  servicePort: 80
```

Commit and push to the `saas-workloads` repository. Argo CD will automatically deploy the tenant's Deployment, Service, Ingress, and S3 Bucket to the data plane cluster.

## Key Technologies

| Technology | Role |
|-----------|------|
| [Amazon EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/automode.html) | Simplified cluster management with automated node pools |
| [EKS Argo CD Capability](https://docs.aws.amazon.com/eks/latest/userguide/argocd.html) | Managed Argo CD for GitOps continuous delivery |
| [EKS ACK Capability](https://docs.aws.amazon.com/eks/latest/userguide/ack.html) | AWS Controllers for Kubernetes to provision cloud resources |
| [EKS KRO Capability](https://docs.aws.amazon.com/eks/latest/userguide/kro.html) | Kubernetes Resource Orchestrator for composable resource packages |
| [AWS Identity Center](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html) | SSO authentication for Argo CD |
| [AWS CodeCommit](https://docs.aws.amazon.com/codecommit/latest/userguide/welcome.html) | Git repositories for GitOps source of truth |

## Cleanup

```bash
cd terraform
terraform destroy
```

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
