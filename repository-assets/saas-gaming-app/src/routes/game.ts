import { Router, Request, Response } from 'express';
import * as gameLogic from '../services/gameLogic';
import { getTierConfig } from '../middleware/tierMiddleware';

const router = Router();

/**
 * POST /api/game/start
 * Start a new game session
 * Body: { playerId: string, playerName: string }
 */
router.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId, playerName } = req.body;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }

    if (!playerId || !playerName) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'playerId and playerName are required'
      });
      return;
    }

    const gameState = await gameLogic.startGame(tenantContext, playerId, playerName);

    res.status(201).json({
      success: true,
      data: gameState
    });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({
      error: 'Failed to start game',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/game/move
 * Submit a game move (guess)
 * Body: { sessionId: string, guess: number }
 */
router.post('/move', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, guess } = req.body;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }

    if (!sessionId || guess === undefined) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'sessionId and guess are required'
      });
      return;
    }

    if (typeof guess !== 'number') {
      res.status(400).json({
        error: 'Invalid guess',
        message: 'guess must be a number'
      });
      return;
    }

    const result = await gameLogic.processMove(tenantContext, sessionId, guess);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error processing move:', error);
    
    if (error instanceof Error && 
        (error.message.includes('not found') || error.message.includes('not active'))) {
      res.status(404).json({
        error: 'Game not found or not active',
        message: error.message
      });
      return;
    }

    if (error instanceof Error && error.message.includes('must be between')) {
      res.status(400).json({
        error: 'Invalid guess',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to process move',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/game/state/:sessionId
 * Get current game state
 */
router.get('/state/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }

    if (!sessionId) {
      res.status(400).json({
        error: 'Missing sessionId',
        message: 'sessionId parameter is required'
      });
      return;
    }

    const gameState = await gameLogic.getGameState(tenantContext, sessionId);

    if (!gameState) {
      res.status(404).json({
        error: 'Game not found',
        message: `No game found with sessionId: ${sessionId}`
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: gameState
    });
  } catch (error) {
    console.error('Error getting game state:', error);
    res.status(500).json({
      error: 'Failed to get game state',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/leaderboard
 * Get top players leaderboard
 * Query params: limit (optional, uses tier-specific default)
 */
router.get('/leaderboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }

    // Get tier from request context
    const tier = req.tenantTier || 'basic';
    const tierConfig = getTierConfig(tier);
    
    // Use tier-specific limit as default, allow override up to tier limit
    const requestedLimit = parseInt(req.query.limit as string) || tierConfig.leaderboardLimit;
    const limit = Math.min(requestedLimit, tierConfig.leaderboardLimit);

    if (limit < 1) {
      res.status(400).json({
        error: 'Invalid limit',
        message: 'limit must be at least 1'
      });
      return;
    }

    const leaderboard = await gameLogic.getLeaderboard(tenantContext, limit);

    res.status(200).json({
      success: true,
      data: leaderboard,
      meta: {
        tier,
        limit,
        maxLimit: tierConfig.leaderboardLimit
      }
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({
      error: 'Failed to get leaderboard',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

