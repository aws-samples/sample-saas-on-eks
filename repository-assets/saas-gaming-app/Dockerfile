# Multi-stage build for smaller image size
FROM public.ecr.aws/docker/library/node:22-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM public.ecr.aws/docker/library/node:22-slim

# Set working directory
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy public assets to match the path expected by server.ts (__dirname/../src/public)
COPY --from=builder /app/src/public ./src/public

# Expose application port
EXPOSE 8080

# Run as non-root user for security
USER node

# Health check for Kubernetes readiness probes
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/server.js"]
