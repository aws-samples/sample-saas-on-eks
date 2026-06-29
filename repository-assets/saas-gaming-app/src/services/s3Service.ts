import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as mockDataService from './mockDataService';
import { TenantContext } from '../types/tenant';
import { recordS3Usage } from './usageMetricsService';

// Configuration from environment variables
const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

if (!S3_BUCKET) {
  console.warn('Warning: S3_BUCKET environment variable not set - using mock avatar storage');
}

// Initialize S3 client with retry configuration
const s3Client = new S3Client({
  region: AWS_REGION,
  maxAttempts: 3, // Retry up to 3 times
  retryMode: 'adaptive', // Use adaptive retry mode with exponential backoff
  forcePathStyle: false, // Use virtual-hosted-style URLs for proper regional routing
  useArnRegion: true // Use the region from the bucket ARN
});

/**
 * Upload a file to S3
 * @param tenantContext - Tenant context for isolation
 * @param key - S3 object key
 * @param body - File content
 * @param contentType - MIME type of the file
 * @returns Promise<string> - S3 object URL
 */
export async function uploadFile(
  tenantContext: TenantContext,
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  if (!S3_BUCKET) {
    // Use mock storage when S3 is not configured
    console.log('Using mock storage for avatar upload');
    const dataUrl = `data:${contentType};base64,${body.toString('base64')}`;
    const playerId = key.split('/')[1]; // Extract playerId from key like "avatars/player123/avatar.png"
    mockDataService.storeMockAvatar(tenantContext.tenantId, playerId, dataUrl);
    return dataUrl;
  }

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    });

    await s3Client.send(command);
    recordS3Usage(tenantContext, 'write', body.length);
    
    // Return the S3 URL
    return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw new Error(`Failed to upload file to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a presigned URL for downloading a file from S3
 * @param tenantContext - Tenant context for isolation
 * @param key - S3 object key
 * @param expiresIn - URL expiration time in seconds (default: 3600)
 * @returns Promise<string> - Presigned URL
 */
export async function getPresignedUrl(tenantContext: TenantContext, key: string, expiresIn: number = 3600): Promise<string> {
  if (!S3_BUCKET) {
    // Use mock storage when S3 is not configured
    const playerId = key.split('/')[1]; // Extract playerId from key
    const mockAvatar = mockDataService.getMockAvatar(tenantContext.tenantId, playerId);
    if (mockAvatar) {
      return mockAvatar; // Return the data URL directly
    }
    throw new Error('Avatar not found in mock storage');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    recordS3Usage(tenantContext, 'read');
    return url;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a file exists in S3
 * @param tenantContext - Tenant context for isolation
 * @param key - S3 object key
 * @returns Promise<boolean> - True if file exists
 */
export async function fileExists(tenantContext: TenantContext, key: string): Promise<boolean> {
  if (!S3_BUCKET) {
    // Use mock storage when S3 is not configured
    const playerId = key.split('/')[1]; // Extract playerId from key
    return mockDataService.mockAvatarExists(tenantContext.tenantId, playerId);
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    });

    await s3Client.send(command);
    recordS3Usage(tenantContext, 'read');
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.error('Error checking file existence in S3:', error);
    throw new Error(`Failed to check file existence: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { s3Client };

