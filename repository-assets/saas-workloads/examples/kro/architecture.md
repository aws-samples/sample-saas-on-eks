## Architecture Diagram

```mermaid
graph TB
    subgraph "Tenant Instances"
        T1[tenant-anycompany-basic.yaml<br/>Tenant: any-corp-001<br/>tier: basic]
        T2[tenant-techstartup-pro.yaml<br/>Tenant: tech-startup-001<br/>tier: pro]
        SR[shared-resources-instance.yaml<br/>SharedResourcesPackage]
    end

    subgraph "RGD Definitions (namespace: default)"
        TM[tenant-main.yaml<br/>Tenant RGD]
        TB[tenant-basic-tier.yaml<br/>TenantBasicPackage RGD]
        TP[tenant-pro-tier.yaml<br/>TenantProPackage RGD]
        TI[tenant-iam-role.yaml<br/>TenantIAMRole RGD]
        GA[gaming-application.yaml<br/>GamingApplication RGD]
        SRP[shared-resources.yaml<br/>SharedResourcesPackage RGD]
    end

    subgraph "Created Resources"
        subgraph "namespace: saas-platform"
            S3S[S3 Bucket<br/>gaming-shared-bucket]
            DBS[DynamoDB Table<br/>gaming-shared-table]
        end

        subgraph "namespace: tenant-any-corp-001"
            NS1[Namespace]
            TBP1[TenantBasicPackage Instance]
            IAM1[IAM Role + Policies<br/>ServiceAccount<br/>PodIdentityAssociation]
            APP1[Deployment + Service<br/>Ingress + ConfigMap]
        end

        subgraph "namespace: tenant-tech-startup-001"
            NS2[Namespace]
            TPP2[TenantProPackage Instance]
            S3P[S3 Bucket<br/>tech-startup-001-gaming-assets]
            DBP[DynamoDB Table<br/>gaming-app-tenant-tech-startup-001]
            IAM2[IAM Role + Policies<br/>ServiceAccount<br/>PodIdentityAssociation]
            APP2[Deployment + Service<br/>Ingress + ConfigMap + HPA]
        end
    end

    %% Shared Resources Flow
    SR -->|creates| SRP
    SRP -->|provisions| S3S
    SRP -->|provisions| DBS

    %% Basic Tier Flow
    T1 -->|tier=basic| TM
    TM -->|creates namespace| NS1
    TM -->|conditional| TB
    TB -->|externalRef| S3S
    TB -->|externalRef| DBS
    TB -->|creates| TBP1
    TB -->|creates| TI
    TB -->|creates| GA
    TI -->|provisions| IAM1
    GA -->|provisions| APP1
    IAM1 -.->|uses| APP1

    %% Pro Tier Flow
    T2 -->|tier=pro| TM
    TM -->|creates namespace| NS2
    TM -->|conditional| TP
    TP -->|creates| TPP2
    TP -->|provisions| S3P
    TP -->|provisions| DBP
    TP -->|creates| TI
    TP -->|creates| GA
    TI -->|provisions| IAM2
    GA -->|provisions| APP2
    IAM2 -.->|uses| APP2

    style T1 fill:#e1f5ff
    style T2 fill:#fff4e1
    style SR fill:#f0f0f0
    style TM fill:#d4edda
    style TB fill:#cce5ff
    style TP fill:#fff3cd
    style S3S fill:#f8d7da
    style DBS fill:#f8d7da
    style S3P fill:#fff3cd
    style DBP fill:#fff3cd
```

### Basic Tier Flow
```
tenant-anycompany-basic.yaml (Tenant)
  ↓
tenant-main.yaml (Tenant → Namespace + TenantBasicPackage)
  ↓
tenant-basic-tier.yaml (TenantBasicPackage → TenantIAMRole + GamingApplication)
  ├─→ externalRef → S3 Bucket (saas-platform namespace)
  ├─→ externalRef → DynamoDB Table (saas-platform namespace)
  ├─→ tenant-iam-role.yaml (TenantIAMRole → IAM Resources + ServiceAccount)
  └─→ gaming-application.yaml (GamingApplication → K8s Workload Resources)
```

### Pro Tier Flow
```
tenant-techstartup-pro.yaml (Tenant)
  ↓
tenant-main.yaml (Tenant → Namespace + TenantProPackage)
  ↓
tenant-pro-tier.yaml (TenantProPackage → S3 + DynamoDB + TenantIAMRole + GamingApplication)
  ├─→ S3 Bucket (dedicated, tenant namespace)
  ├─→ DynamoDB Table (dedicated, tenant namespace)
  ├─→ tenant-iam-role.yaml (TenantIAMRole → IAM Resources + ServiceAccount)
  └─→ gaming-application.yaml (GamingApplication → K8s Workload Resources + HPA)
```