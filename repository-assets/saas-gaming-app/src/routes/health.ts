import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Health check endpoint for Kubernetes readiness and liveness probes
 * Returns 200 OK if the application is running
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'production',
      s3Bucket: process.env.S3_BUCKET ? 'configured' : 'not configured',
      dynamoTable: process.env.DYNAMODB_TABLE ? 'configured' : 'not configured',
      awsRegion: process.env.AWS_REGION || 'us-east-1'
    }
  });
});

export default router;

