import { Request, Response, NextFunction } from 'express';

export type TenantTier = 'basic' | 'pro';

// Extend Express Request to include tier
declare global {
  namespace Express {
    interface Request {
      tenantTier?: TenantTier;
    }
  }
}

/**
 * Tier-specific configuration settings
 */
export interface TierConfig {
  avatarSizeLimit: number;
  leaderboardLimit: number;
  enableAnalytics: boolean;
  enableHistory: boolean;
  enableExport: boolean;
  allowAnimatedAvatars: boolean;
}

/**
 * Middleware to inject tenant tier from environment variable
 * Reads TENANT_TIER environment variable and attaches it to the request object
 * Defaults to 'basic' if not set or invalid
 */
export function injectTier(req: Request, _res: Response, next: NextFunction): void {
  const tier = (process.env.TENANT_TIER || 'basic').toLowerCase() as TenantTier;
  
  if (tier !== 'basic' && tier !== 'pro') {
    console.warn(`Invalid TENANT_TIER: ${tier}, defaulting to basic`);
    req.tenantTier = 'basic';
  } else {
    req.tenantTier = tier;
  }
  
  next();
}

/**
 * Middleware to require Pro tier for specific endpoints
 * Returns 403 Forbidden with upgrade information if tier is not Pro
 */
export function requireProTier(req: Request, res: Response, next: NextFunction): void {
  if (req.tenantTier !== 'pro') {
    res.status(403).json({
      error: 'Pro tier required',
      message: 'This feature is only available for Pro tier tenants',
      upgrade: {
        currentTier: req.tenantTier,
        requiredTier: 'pro',
        features: [
          'Advanced analytics dashboard',
          'Complete game history',
          'Top 10 leaderboard',
          'Data export',
          'Larger avatar uploads (5MB)',
          'Animated GIF avatars'
        ]
      }
    });
    return;
  }
  
  next();
}

/**
 * Get tier-specific configuration
 * Returns configuration object with limits and feature flags for the given tier
 */
export function getTierConfig(tier: TenantTier): TierConfig {
  const configs: Record<TenantTier, TierConfig> = {
    basic: {
      avatarSizeLimit: 1048576, // 1MB
      leaderboardLimit: 3,
      enableAnalytics: false,
      enableHistory: false,
      enableExport: false,
      allowAnimatedAvatars: false
    },
    pro: {
      avatarSizeLimit: 5242880, // 5MB
      leaderboardLimit: 10,
      enableAnalytics: true,
      enableHistory: true,
      enableExport: true,
      allowAnimatedAvatars: true
    }
  };
  
  return configs[tier];
}
