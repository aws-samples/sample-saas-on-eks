import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as s3Service from '../services/s3Service';
import * as gameLogic from '../services/gameLogic';
import { getTierConfig, TenantTier } from '../middleware/tierMiddleware';

const router = Router();

// Configure multer for file uploads (store in memory)
// Note: File size validation is done in the route handler based on tier
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // Max 5MB (Pro tier limit)
  },
  fileFilter: (req, file, cb) => {
    // Get tier from request
    const tier = (req as any).tenantTier as TenantTier || 'basic';
    const tierConfig = getTierConfig(tier);
    
    // Check file type based on tier
    if (file.mimetype.startsWith('image/')) {
      // Basic tier: only static images (JPEG, PNG)
      // Pro tier: static images + animated GIF
      if (!tierConfig.allowAnimatedAvatars && file.mimetype === 'image/gif') {
        cb(new Error('Animated GIF avatars are only available for Pro tier'));
      } else {
        cb(null, true);
      }
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/**
 * POST /api/player/avatar
 * Upload player avatar to S3 or select predefined avatar
 * Supports two formats:
 * 1. Multipart form data: playerId (string), avatar (file)
 * 2. JSON: { playerId: string, avatarId: string }
 */
router.post('/avatar', (req: Request, res: Response): void => {
  const contentType = req.headers['content-type'] || '';
  
  console.log('=== AVATAR ROUTE DEBUG ===');
  console.log('Content-Type:', contentType);
  console.log('Body:', JSON.stringify(req.body));
  console.log('Has avatarId:', !!req.body?.avatarId);
  console.log('Has playerId:', !!req.body?.playerId);
  
  // Check if this is a JSON request for avatar selection
  if (contentType.includes('application/json')) {
    console.log('-> Routing to JSON handler');
    // Handle JSON avatar selection directly
    handleAvatarSelection(req, res);
    return;
  }
  
  console.log('-> Routing to file upload handler');
  // Handle file upload with multer
  upload.single('avatar')(req, res, async (err: any) => {
    if (err) {
      console.log('Multer error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const tier = req.tenantTier || 'basic';
          const tierConfig = getTierConfig(tier);
          const limitMB = tierConfig.avatarSizeLimit / (1024 * 1024);
          
          res.status(400).json({
            error: 'File too large',
            message: `Avatar file must be less than ${limitMB}MB for ${tier} tier`,
            currentTier: tier,
            limit: tierConfig.avatarSizeLimit
          });
          return;
        }
      }
      
      res.status(400).json({
        error: 'Upload error',
        message: err.message || 'Failed to upload file'
      });
      return;
    }
    
    console.log('No multer error, processing file upload');
    // Process file upload
    await handleFileUpload(req, res);
  });
});

/**
 * Handle file upload after multer processing
 */
async function handleFileUpload(req: Request, res: Response): Promise<void> {
  console.log('=== FILE UPLOAD HANDLER ===');
  console.log('Body:', req.body);
  console.log('File:', req.file);
  
  try {
    const { playerId } = req.body;
    const file = req.file;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      console.log('ERROR: No tenant context');
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }

    if (!playerId) {
      console.log('ERROR: No playerId');
      res.status(400).json({
        error: 'Missing playerId',
        message: 'playerId is required'
      });
      return;
    }

    if (!file) {
      console.log('ERROR: No file - THIS IS THE ERROR YOU ARE SEEING');
      res.status(400).json({
        error: 'Missing file',
        message: 'avatar file is required'
      });
      return;
    }

    // Get tier configuration
    const tier = req.tenantTier || 'basic';
    const tierConfig = getTierConfig(tier);

    // Validate file size against tier limit
    if (file.size > tierConfig.avatarSizeLimit) {
      const limitMB = tierConfig.avatarSizeLimit / (1024 * 1024);
      res.status(400).json({
        error: 'File too large',
        message: `Avatar file must be less than ${limitMB}MB for ${tier} tier`,
        currentTier: tier,
        limit: tierConfig.avatarSizeLimit,
        fileSize: file.size,
        upgrade: tier === 'basic' ? {
          message: 'Upgrade to Pro tier for 5MB avatar uploads and animated GIF support',
          proLimit: '5MB'
        } : undefined
      });
      return;
    }

    // Generate tenant-aware S3 key for avatar
    const key = `avatars/${tenantContext.tenantId}/${playerId}/avatar.png`;

    // Upload to S3
    const url = await s3Service.uploadFile(tenantContext, key, file.buffer, file.mimetype);

    res.status(200).json({
      success: true,
      data: {
        playerId,
        avatarUrl: url,
        key
      }
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);

    // Check for S3 configuration error
    if (error instanceof Error && error.message.includes('S3_BUCKET environment variable not configured')) {
      res.status(500).json({
        error: 'Configuration error',
        message: error.message // Return the exact error message from S3 service
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to upload avatar',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handle avatar selection from predefined options
 */
async function handleAvatarSelection(req: Request, res: Response): Promise<void> {
  console.log('=== AVATAR SELECTION HANDLER ===');
  console.log('Body:', JSON.stringify(req.body));
  
  try {
    const { playerId, avatarId } = req.body;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      console.log('ERROR: No tenant context');
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }

    if (!playerId || !avatarId) {
      console.log('ERROR: Missing playerId or avatarId');
      res.status(400).json({
        error: 'Missing parameters',
        message: 'playerId and avatarId are required'
      });
      return;
    }
    
    console.log('Processing avatar selection:', { playerId, avatarId });

    // Map avatar IDs to emoji/text representations
    const avatarMap: { [key: string]: string } = {
      'avatar1': '🎮',
      'avatar2': '🚀',
      'avatar3': '⭐',
      'avatar4': '🎯',
      'avatar5': '🎪'
    };

    const avatarEmoji = avatarMap[avatarId];
    if (!avatarEmoji) {
      res.status(400).json({
        error: 'Invalid avatar',
        message: 'Invalid avatarId provided'
      });
      return;
    }

    // Create a simple text file with the emoji as the avatar
    const avatarContent = avatarEmoji;
    const key = `avatars/${tenantContext.tenantId}/${playerId}/avatar.txt`;

    try {
      // Try to upload to S3
      const url = await s3Service.uploadFile(
        tenantContext,
        key,
        Buffer.from(avatarContent, 'utf-8'),
        'text/plain'
      );

      res.status(200).json({
        success: true,
        data: {
          playerId,
          avatarId,
          avatarUrl: url,
          key
        }
      });
    } catch (s3Error) {
      // If S3 is not configured, use mock data
      if (s3Error instanceof Error && s3Error.message.includes('S3_BUCKET environment variable not configured')) {
        // Return success with mock data
        res.status(200).json({
          success: true,
          data: {
            playerId,
            avatarId,
            avatarUrl: `mock://avatar/${avatarId}`,
            key,
            mock: true
          }
        });
      } else {
        throw s3Error;
      }
    }
  } catch (error) {
    console.error('Error saving avatar selection:', error);
    
    res.status(500).json({
      error: 'Failed to save avatar',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/player/avatar/:playerId
 * Get presigned URL for player avatar
 */
router.get('/avatar/:playerId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId } = req.params;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }

    if (!playerId) {
      res.status(400).json({
        error: 'Missing playerId',
        message: 'playerId parameter is required'
      });
      return;
    }

    // Generate tenant-aware S3 key for avatar
    const key = `avatars/${tenantContext.tenantId}/${playerId}/avatar.png`;

    // Check if avatar exists
    const exists = await s3Service.fileExists(tenantContext, key);

    if (!exists) {
      res.status(404).json({
        error: 'Avatar not found',
        message: `No avatar found for player: ${playerId}`
      });
      return;
    }

    // Get presigned URL (valid for 1 hour)
    const url = await s3Service.getPresignedUrl(tenantContext, key, 3600);

    res.status(200).json({
      success: true,
      data: {
        playerId,
        avatarUrl: url,
        expiresIn: 3600
      }
    });
  } catch (error) {
    console.error('Error getting avatar URL:', error);
    
    // Check for S3 configuration error
    if (error instanceof Error && error.message.includes('S3_BUCKET environment variable not configured')) {
      res.status(500).json({
        error: 'Configuration error',
        message: error.message // Return the exact error message from S3 service
      });
      return;
    }
    
    res.status(500).json({
      error: 'Failed to get avatar URL',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/player/profile/:playerId
 * Get player profile
 */
router.get('/profile/:playerId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerId } = req.params;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }

    if (!playerId) {
      res.status(400).json({
        error: 'Missing playerId',
        message: 'playerId parameter is required'
      });
      return;
    }

    const profile = await gameLogic.getPlayerProfile(tenantContext, playerId);

    if (!profile) {
      res.status(404).json({
        error: 'Player not found',
        message: `No profile found for player: ${playerId}`
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error getting player profile:', error);
    res.status(500).json({
      error: 'Failed to get player profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/player/check-nickname
 * Check if a nickname (player name) already exists
 */
router.get('/check-nickname', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nickname } = req.query;
    const tenantContext = req.tenantContext;

    if (!tenantContext) {
      res.status(500).json({
        error: 'Tenant context missing',
        message: 'Tenant context is required'
      });
      return;
    }

    if (!nickname || typeof nickname !== 'string') {
      res.status(400).json({
        error: 'Missing nickname',
        message: 'nickname parameter is required'
      });
      return;
    }

    // Check if any player with this name exists in the leaderboard
    const profile = await gameLogic.checkNicknameExists(tenantContext, nickname.trim());

    res.status(200).json({
      success: true,
      data: {
        nickname: nickname.trim(),
        exists: profile !== null
      }
    });
  } catch (error) {
    console.error('Error checking nickname:', error);
    res.status(500).json({
      error: 'Failed to check nickname',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

