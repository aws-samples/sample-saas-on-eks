# Repository Assets

This directory contains the Git repository content that gets pushed to AWS CodeCommit repositories after the infrastructure is provisioned. The assets are organized into two separate repositories that align with the multi-cluster architecture.

## Directory Structure

```
repository-assets/
├── saas-platform-configs/    → Pushed to the "saas-platform-configs" CodeCommit repo
│   ├── add-ons/              # Platform add-on configurations (Helm values, IAM via Kustomize)
│   ├── applicationsets/      # Argo CD ApplicationSets for platform management
│   ├── examples/             # Example tenant definitions
│   └── resourceGraphs/       # KRO ResourceGraphDefinitions for tenant packaging
└── saas-workloads/           → Pushed to the "saas-workloads" CodeCommit repo
    ├── applicationsets/      # Argo CD ApplicationSets for tenant workload delivery
    └── tenants/              # Tenant workload manifests
```

## saas-platform-configs

This repository is aligned with the **control plane cluster** and contains all platform-level configuration:

- **add-ons/** — Platform add-on management using a GitOps pattern. Add-ons (such as KEDA) are deployed via Argo CD ApplicationSets that combine Helm charts with per-cluster values files and IAM resources managed through Kustomize overlays.
- **applicationsets/** — Argo CD ApplicationSet definitions that drive the continuous delivery of platform configs and add-ons across clusters.
- **resourceGraphs/** — KRO `ResourceGraphDefinition` custom resources that define composable tenant packages. For example, `tenant-basic-package.yaml` bundles a Deployment, Service, Ingress, and an ACK-managed S3 Bucket into a single `TenantBasicPackage` custom resource.
- **examples/** — Sample tenant instance manifests that can be used as templates when onboarding new tenants.

## saas-workloads

This repository is aligned with the **data plane cluster** and contains tenant workload definitions:

- **applicationsets/** — An Argo CD ApplicationSet that automatically discovers and deploys tenant manifests from the `tenants/` directory to all registered clusters.
- **tenants/** — Individual tenant manifest files. Each file declares a `Namespace` and a `TenantBasicPackage` custom resource instance, which KRO expands into the full set of application resources.

## Usage

After running `terraform apply` in the `terraform/` directory, the CodeCommit repositories will exist but be empty. Push these assets to their respective repositories:

```bash
# Get repository URLs from Terraform outputs
PLATFORM_REPO=$(terraform -chdir=../terraform output -raw platform_configs_clone_url_http)
WORKLOADS_REPO=$(terraform -chdir=../terraform output -raw workloads_clone_url_http)

# Push platform configs
cd saas-platform-configs
git init && git add . && git commit -m "Initial platform configs"
git remote add origin "$PLATFORM_REPO"
git push -u origin main

# Push workloads
cd ../saas-workloads
git init && git add . && git commit -m "Initial workloads"
git remote add origin "$WORKLOADS_REPO"
git push -u origin main
```

## Adding a New Tenant

1. Create a new tenant manifest in `saas-workloads/tenants/` (use `tenant-2-basic.yaml` as a template).
2. Define the tenant namespace and a `TenantBasicPackage` resource with the desired configuration.
3. Commit and push to the `saas-workloads` CodeCommit repository.
4. Argo CD will automatically detect and deploy the new tenant to the data plane cluster.
