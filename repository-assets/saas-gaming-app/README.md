# SaaS Gaming Application

A multi-tenant SaaS gaming application built for the EKS Platform Engineering workshop. This application demonstrates how to build a scalable, cloud-native gaming platform using Amazon EKS, S3, and DynamoDB.

## Features

- Simple interactive web-based game
- Player avatar management with S3 storage
- Game state persistence with DynamoDB
- Leaderboard functionality
- Multi-tenant ready with namespace isolation
- Health check endpoints for Kubernetes
- Graceful shutdown handling

## Architecture

The application consists of:
- **HTTP Server**: Express.js server handling game API and static content
- **Game Logic**: Core game state management
- **S3 Integration**: Player avatar storage
- **DynamoDB Integration**: Game state, player data, and leaderboards

## Prerequisites

- Node.js 18+
- AWS CLI configured with credentials
- Docker (for containerization)
- Access to AWS S3 and DynamoDB

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

```bash
# Tenant Configuration (REQUIRED)
export TENANT_ID=acme-corp-001
export TENANT_NAME="Acme Corporation"
export TENANT_TIER=basic  # or 'pro'

# AWS Resources
export S3_BUCKET=your-test-bucket
export DYNAMODB_TABLE=your-test-table
export AWS_REGION=us-east-1
export PORT=8080
```

**Tenant Tiers:**
- **Basic Tier**: Uses shared DynamoDB table (`gaming-app-shared`) with tenant isolation via partition keys
- **Pro Tier**: Uses dedicated DynamoDB table (`gaming-app-tenant-{TENANT_ID}`) for better performance and isolation

### 3. Create AWS Resources for Testing

```bash
# Create S3 bucket
aws s3 mb s3://your-test-bucket

# Create DynamoDB table
aws dynamodb create-table \
  --table-name your-test-table \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

### 4. Run the Application

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start
```

### 5. Test the Application

```bash
# Health check
curl http://localhost:8080/health

# Start a game
curl -X POST http://localhost:8080/api/game/start

# Access the UI
open http://localhost:8080
```

## Docker

### Build Container Image

```bash
docker build -t saas-gaming-app:local .
```

### Run Container Locally

```bash
docker run -p 8080:8080 \
  -e TENANT_ID=acme-corp-001 \
  -e TENANT_NAME="Acme Corporation" \
  -e TENANT_TIER=basic \
  -e PORT=8080 \
  -e S3_BUCKET=$S3_BUCKET \
  -e DYNAMODB_TABLE=$DYNAMODB_TABLE \
  -e AWS_REGION=$AWS_REGION \
  -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
  saas-gaming-app:local
```

## API Endpoints

- `GET /` - Game UI
- `GET /health` - Health check
- `POST /api/game/start` - Start new game session
- `POST /api/game/move` - Submit game move
- `GET /api/game/state/:sessionId` - Get game state
- `GET /api/leaderboard` - Get top scores
- `POST /api/player/avatar` - Upload player avatar
- `GET /api/player/avatar/:playerId` - Get player avatar URL

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TENANT_ID` | Yes | - | Unique identifier for the tenant organization |
| `TENANT_NAME` | Yes | - | Display name for the tenant organization |
| `TENANT_TIER` | Yes | basic | Tenant subscription tier: 'basic' (shared table) or 'pro' (dedicated table) |
| `S3_BUCKET` | Yes | - | S3 bucket name for game assets |
| `DYNAMODB_TABLE` | Yes | - | DynamoDB table name (shared for basic, dedicated for pro) |
| `AWS_REGION` | No | us-east-1 | AWS region |
| `PORT` | No | 8080 | HTTP server port |
| `NODE_ENV` | No | production | Environment mode |

### Multi-Tenant Configuration

The application supports two tenant tiers:

**Basic Tier:**
- Uses shared DynamoDB table: `gaming-app-shared`
- Tenant isolation via composite partition keys: `TENANT#{tenantId}#PLAYER#{playerId}`
- Cost-effective for smaller tenants
- Set `TENANT_TIER=basic`

**Pro Tier:**
- Uses dedicated DynamoDB table: `gaming-app-tenant-{TENANT_ID}`
- Complete table isolation per tenant
- Better performance and no noisy neighbor issues
- Set `TENANT_TIER=pro`
- Requires dedicated table to be provisioned

## DynamoDB Schema

### Basic Tier (Shared Table)

**Table Name:** `gaming-app-shared`

**Table Structure:**
- Partition Key: `PK` (String) - Format: `TENANT#{tenantId}#PLAYER#{playerId}`
- Sort Key: `SK` (String) - Format: `PROFILE` or `GAME#{timestamp}`

**Global Secondary Index (LeaderboardIndex):**
- Partition Key: `GSI1PK` (String) - Format: `TENANT#{tenantId}#LEADERBOARD`
- Sort Key: `GSI1SK` (String) - Format: `SCORE#{paddedScore}#PLAYER#{playerId}`

### Pro Tier (Dedicated Table)

**Table Name:** `gaming-app-tenant-{TENANT_ID}`

**Table Structure:**
- Partition Key: `PK` (String) - Format: `PLAYER#{playerId}`
- Sort Key: `SK` (String) - Format: `PROFILE` or `GAME#{timestamp}`

**Global Secondary Index (LeaderboardIndex):**
- Partition Key: `GSI1PK` (String) - Value: `LEADERBOARD`
- Sort Key: `GSI1SK` (String) - Format: `SCORE#{paddedScore}#PLAYER#{playerId}`

## S3 Bucket Structure

```
${S3_BUCKET}/
  ├── assets/
  │   ├── images/
  │   └── sounds/
  └── avatars/
      └── <playerId>/
          └── avatar.png
```

## Deployment to Kubernetes

This application is designed to be deployed to Amazon EKS using the TenantBasicPackage custom resource defined by KRO (Kubernetes Resource Orchestrator).

See the workshop module documentation for deployment instructions.

## License

MIT
