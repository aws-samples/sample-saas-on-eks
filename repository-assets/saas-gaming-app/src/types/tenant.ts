/**
 * Tenant Types and Interfaces
 * Defines the multi-tenant data structures for B2B SaaS model
 */

/**
 * Tenant tier types
 */
export type TenantTier = 'basic' | 'pro';

/**
 * Tenant interface
 * Represents a company/organization using the platform
 */
export interface Tenant {
  tenantId: string;          // Unique tenant identifier (e.g., "acme-corp-001")
  tenantName: string;        // Company/organization name (e.g., "Acme Corporation")
  tier: TenantTier;          // Subscription tier
  tableName?: string;        // DynamoDB table name (for Pro tier)
  createdAt: number;         // Creation timestamp
  updatedAt: number;         // Last update timestamp
}

/**
 * Tenant context interface
 * Contains tenant information injected into each request
 */
export interface TenantContext {
  tenantId: string;          // Unique tenant identifier
  tenantName: string;        // Display name for the tenant
  tier: TenantTier;          // Subscription tier (basic or pro)
  tableName: string;         // DynamoDB table name to use
}

/**
 * Extended Express Request with tenant context
 */
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}
