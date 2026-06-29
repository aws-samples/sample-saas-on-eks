import { Router, Request, Response } from 'express';
import { requireProTier } from '../middleware/tierMiddleware';
import * as analyticsService from '../services/analyticsService';

const router = Router();

/**
 * GET /api/analytics/overview
 * Get analytics overview for a player
 * Query params: playerId (required)
 * Pro tier only
 */
router.get('/overview', requireProTier, async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId } = req.query;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }
    
    if (!playerId || typeof playerId !== 'string') {
      res.status(400).json({ 
        error: 'Missing playerId',
        message: 'playerId query parameter is required' 
      });
      return;
    }
    
    const overview = await analyticsService.getAnalyticsOverview(tenantContext, playerId);
    res.status(200).json({ 
      success: true, 
      data: overview 
    });
  } catch (error) {
    console.error('Error getting analytics overview:', error);
    
    if (error instanceof Error && error.message === 'Player profile not found') {
      res.status(404).json({
        error: 'Player not found',
        message: `No profile found for player: ${req.query.playerId}`
      });
      return;
    }
    
    res.status(500).json({ 
      error: 'Failed to get analytics overview',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/trends
 * Get win rate trends over time
 * Query params: playerId (required), days (optional, default: 30)
 * Pro tier only
 */
router.get('/trends', requireProTier, async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId, days = '30' } = req.query;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }
    
    if (!playerId || typeof playerId !== 'string') {
      res.status(400).json({ 
        error: 'Missing playerId',
        message: 'playerId query parameter is required' 
      });
      return;
    }
    
    const daysNum = parseInt(days as string, 10);
    if (isNaN(daysNum) || daysNum <= 0) {
      res.status(400).json({
        error: 'Invalid days parameter',
        message: 'days must be a positive integer'
      });
      return;
    }
    
    const trends = await analyticsService.getWinRateTrends(tenantContext, playerId, daysNum);
    res.status(200).json({ 
      success: true, 
      data: trends 
    });
  } catch (error) {
    console.error('Error getting win rate trends:', error);
    res.status(500).json({ 
      error: 'Failed to get trends',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/history
 * Get complete game history with pagination
 * Query params: playerId (required), limit (optional, default: 50), offset (optional, default: 0)
 * Pro tier only
 */
router.get('/history', requireProTier, async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId, limit = '50', offset = '0' } = req.query;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }
    
    if (!playerId || typeof playerId !== 'string') {
      res.status(400).json({ 
        error: 'Missing playerId',
        message: 'playerId query parameter is required' 
      });
      return;
    }
    
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    
    if (isNaN(limitNum) || limitNum <= 0) {
      res.status(400).json({
        error: 'Invalid limit parameter',
        message: 'limit must be a positive integer'
      });
      return;
    }
    
    if (isNaN(offsetNum) || offsetNum < 0) {
      res.status(400).json({
        error: 'Invalid offset parameter',
        message: 'offset must be a non-negative integer'
      });
      return;
    }
    
    const history = await analyticsService.getGameHistory(tenantContext, playerId, limitNum, offsetNum);
    res.status(200).json({ 
      success: true, 
      data: history 
    });
  } catch (error) {
    console.error('Error getting game history:', error);
    res.status(500).json({ 
      error: 'Failed to get game history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/export
 * Export player data as JSON
 * Query params: playerId (required)
 * Pro tier only
 */
router.get('/export', requireProTier, async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId } = req.query;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }
    
    if (!playerId || typeof playerId !== 'string') {
      res.status(400).json({ 
        error: 'Missing playerId',
        message: 'playerId query parameter is required' 
      });
      return;
    }
    
    const data = await analyticsService.exportPlayerData(tenantContext, playerId);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="player-${playerId}-data.json"`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error exporting player data:', error);
    
    if (error instanceof Error && error.message === 'Player profile not found') {
      res.status(404).json({
        error: 'Player not found',
        message: `No profile found for player: ${req.query.playerId}`
      });
      return;
    }
    
    res.status(500).json({ 
      error: 'Failed to export data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
