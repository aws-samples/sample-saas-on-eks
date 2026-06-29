import { Request, Response, NextFunction } from 'express';
import { TenantContext, TenantTier } from '../types/tenant';

/**
 * Tenant Context Middleware
 * Injects tenant information into every request and determines database routing
 */

/**
 * Get table name based on tenant configuration
 * Supports both Basic and Pro tier table routing
 * 
 * Basic Tier:
 * - Uses shared table for all Basic tier tenants
 * - Default: 'gaming-app-shared'
 * - Can be overridden with DYNAMODB_TABLE env var
 * 
 * Pro Tier:
 * - Uses dedicated table per tenant
 * - Default: 'gaming-app-tenant-{tenantId}'
 * - Can be overridden with DYNAMODB_TABLE env var
 * 
 * @param tenantId - Tenant identifier
 * @param tier - Tenant tier (basic or pro)
 * @returns Table name to use for this tenant
 */
function getTableName(tenantId: string, tier: TenantTier): string {
  // Check if DYNAMODB_TABLE is explicitly set in environment
  const explicitTableName = process.env.DYNAMODB_TABLE;
  
  if (explicitTableName) {
    // Use explicitly configured table name
    console.log(`[Table Config] Using explicit table: ${explicitTableName}`);
    return explicitTableName;
  }
  
  // Generate table name based on tier
  if (tier === 'pro') {
    // Pro tier: dedicated table per tenant
    const dedicatedTableName = `gaming-app-tenant-${tenantId}`;
    console.log(`[Table Config] Pro tier - using dedicated table: ${dedicatedTableName}`);
    return dedicatedTableName;
  } else {
    // Basic tier: shared table for all basic tenants
    const sharedTableName = 'gaming-app-shared';
    console.log(`[Table Config] Basic tier - using shared table: ${sharedTableName}`);
    return sharedTableName;
  }
}

/**
 * Validate tenant configuration from environment variables
 * @returns TenantContext or null if invalid
 */
function getTenantContextFromEnv(): TenantContext | null {
  const tenantId = (process.env.TENANT_ID || 'anycompany-01').toLowerCase();
  const tenantName = (process.env.TENANT_NAME || 'Any Company').toLowerCase();
  const tierStr = (process.env.TENANT_TIER || 'basic').toLowerCase();
  
  // Validate required fields
  if (!tenantId || !tenantName) {
    return null;
  }
  
  // Validate tier
  const tier: TenantTier = tierStr === 'pro' ? 'pro' : 'basic';
  
  // Determine table name
  const tableName = getTableName(tenantId, tier);
  
  return {
    tenantId,
    tenantName,
    tier,
    tableName
  };
}

/**
 * Middleware to inject tenant context into requests
 * Reads tenant configuration from environment variables and attaches to req.tenantContext
 */
export function injectTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Get tenant context from environment
    const tenantContext = getTenantContextFromEnv();
    
    if (!tenantContext) {
      console.error('Tenant configuration missing or invalid');
      res.status(500).json({
        error: 'Tenant not configured',
        message: 'TENANT_ID and TENANT_NAME environment variables are required',
        code: 'TENANT_NOT_CONFIGURED'
      });
      return;
    }
    
    // Attach tenant context to request
    req.tenantContext = tenantContext;
    
    // Log tenant context for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Tenant Context] ${tenantContext.tenantId} (${tenantContext.tier}) - ${req.method} ${req.path}`);
    }
    
    next();
  } catch (error) {
    console.error('Error in tenant context middleware:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process tenant context',
      code: 'TENANT_CONTEXT_ERROR'
    });
  }
}

/**
 * Validate tenant context exists in request
 * Use this middleware after injectTenantContext for routes that require tenant context
 */
export function requireTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.tenantContext) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Tenant context is required for this operation',
      code: 'TENANT_CONTEXT_REQUIRED'
    });
    return;
  }
  
  next();
}

/**
 * Get tenant context from request
 * Helper function to safely access tenant context
 * @param req - Express request object
 * @returns TenantContext or throws error
 */
export function getTenantContext(req: Request): TenantContext {
  if (!req.tenantContext) {
    throw new Error('Tenant context not found in request');
  }
  return req.tenantContext;
}

/**
 * Log tenant configuration on startup
 * Call this during application initialization
 */
export function logTenantConfiguration(): void {
  const tenantContext = getTenantContextFromEnv();
  
  if (tenantContext) {
    console.log('🏢 Tenant Configuration:');
    console.log(`   Tenant ID: ${tenantContext.tenantId}`);
    console.log(`   Tenant Name: ${tenantContext.tenantName}`);
    console.log(`   Tier: ${tenantContext.tier.toUpperCase()}`);
    console.log(`   Table: ${tenantContext.tableName}`);
    console.log(`   Table Strategy: ${tenantContext.tier === 'pro' ? 'Dedicated' : 'Shared'}`);
  } else {
    console.warn('⚠️  Tenant configuration not found or invalid');
    console.warn('   Set TENANT_ID and TENANT_NAME environment variables');
  }
}
