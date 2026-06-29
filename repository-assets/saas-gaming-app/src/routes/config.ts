import { Router, Request, Response } from 'express';
import { getTierConfig } from '../middleware/tierMiddleware';
import * as mockDataService from '../services/mockDataService';

const router = Router();

/**
 * GET /api/config/tier
 * Get current tenant tier and tier-specific configuration
 * Returns tier value and configuration settings
 */
router.get('/tier', (req: Request, res: Response): void => {
  try {
    // Get tier from request (injected by injectTier middleware)
    const tier = req.tenantTier || 'basic';
    
    // Get tier-specific configuration
    const config = getTierConfig(tier);
    
    res.status(200).json({
      success: true,
      data: {
        tier,
        config: {
          avatarSizeLimit: config.avatarSizeLimit,
          avatarSizeLimitMB: (config.avatarSizeLimit / (1024 * 1024)).toFixed(0),
          leaderboardLimit: config.leaderboardLimit,
          enableAnalytics: config.enableAnalytics,
          enableHistory: config.enableHistory,
          enableExport: config.enableExport,
          allowAnimatedAvatars: config.allowAnimatedAvatars
        }
      }
    });
  } catch (error) {
    console.error('Error getting tier configuration:', error);
    res.status(500).json({
      error: 'Failed to get tier configuration',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/config/tenant
 * Get current tenant context information
 * Returns tenant ID, name, and tier
 */
router.get('/tenant', (req: Request, res: Response): void => {
  try {
    // Get tenant context from request (injected by tenant context middleware)
    const tenantContext = req.tenantContext;
    
    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context not available',
        message: 'Tenant context middleware not configured'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: {
        tenantId: tenantContext.tenantId,
        tenantName: tenantContext.tenantName,
        tier: tenantContext.tier
      }
    });
  } catch (error) {
    console.error('Error getting tenant context:', error);
    res.status(500).json({
      error: 'Failed to get tenant context',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/config/status
 * Get application configuration status
 * Returns information about which services are configured and whether mock data is being used
 */
router.get('/status', (_req: Request, res: Response): void => {
  try {
    const usingMockData = mockDataService.shouldUseMockData();
    const s3Configured = !!process.env.S3_BUCKET;
    const dynamoConfigured = !!process.env.DYNAMODB_TABLE;
    
    res.status(200).json({
      success: true,
      data: {
        services: {
          dynamodb: {
            configured: dynamoConfigured,
            usingMock: usingMockData
          },
          s3: {
            configured: s3Configured,
            usingMock: !s3Configured
          }
        },
        warnings: [
          ...(!dynamoConfigured ? ['DynamoDB is not configured - using in-memory mock data for game sessions and leaderboard'] : []),
          ...(!s3Configured ? ['S3 is not configured - using in-memory mock storage for player avatars'] : [])
        ],
        mockDataStats: usingMockData ? mockDataService.getMockDataStats() : null
      }
    });
  } catch (error) {
    console.error('Error getting configuration status:', error);
    res.status(500).json({
      error: 'Failed to get configuration status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
