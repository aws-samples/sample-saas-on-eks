import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import { TenantContext } from '../types/tenant';
import { recordDynamoDBUsage } from './usageMetricsService';

// Configuration from environment variables
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

if (!DYNAMODB_TABLE) {
  console.warn('Warning: DYNAMODB_TABLE environment variable not set');
}

// Initialize DynamoDB client with retry configuration
const dynamoClient = new DynamoDBClient({
  region: AWS_REGION,
  maxAttempts: 3, // Retry up to 3 times
  retryMode: 'adaptive' // Use adaptive retry mode with exponential backoff
});

// Create DynamoDB Document Client for easier data manipulation
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true
  }
});

/**
 * Multi-Tenant Key Generation Functions
 */

/**
 * Generate partition key based on tenant tier
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @returns Partition key string
 */
function generatePartitionKey(tenantContext: TenantContext, playerId: string): string {
  if (tenantContext.tier === 'pro') {
    // Pro tier: dedicated table, simple key
    return `PLAYER#${playerId}`;
  } else {
    // Basic tier: shared table, tenant-scoped key
    return `TENANT#${tenantContext.tenantId}#PLAYER#${playerId}`;
  }
}

/**
 * Generate GSI1 partition key for leaderboard based on tenant tier
 * @param tenantContext - Tenant context
 * @returns GSI1 partition key string
 */
function generateLeaderboardKey(tenantContext: TenantContext): string {
  if (tenantContext.tier === 'pro') {
    // Pro tier: simple leaderboard key
    return 'LEADERBOARD';
  } else {
    // Basic tier: tenant-scoped leaderboard
    return `TENANT#${tenantContext.tenantId}#LEADERBOARD`;
  }
}

/**
 * Generate GSI1 sort key for leaderboard entry
 * @param score - Player score
 * @param playerId - Player identifier
 * @returns GSI1 sort key string
 */
function generateLeaderboardSortKey(score: number, playerId: string): string {
  // Pad score to 10 digits for proper sorting
  const paddedScore = score.toString().padStart(10, '0');
  return `SCORE#${paddedScore}#PLAYER#${playerId}`;
}

/**
 * Generate GSI2 partition key for player games
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @returns GSI2 partition key string
 */
function generatePlayerGamesKey(tenantContext: TenantContext, playerId: string): string {
  if (tenantContext.tier === 'pro') {
    // Pro tier: simple player key
    return `PLAYER#${playerId}`;
  } else {
    // Basic tier: tenant-scoped player key
    return `TENANT#${tenantContext.tenantId}#PLAYER#${playerId}`;
  }
}

/**
 * Get table name for tenant
 * @param tenantContext - Tenant context
 * @returns Table name to use
 */
function getTableName(tenantContext: TenantContext): string {
  return tenantContext.tableName;
}

/**
 * Save an item to DynamoDB (multi-tenant aware)
 * @param tenantContext - Tenant context
 * @param item - Item to save
 * @returns Promise<void>
 */
export async function putItem(tenantContext: TenantContext, item: Record<string, any>): Promise<void> {
  const tableName = getTableName(tenantContext);
  
  if (!tableName) {
    throw new Error('DynamoDB table not configured for tenant');
  }

  try {
    // Add tenantId to item for Basic tier (for additional safety)
    const itemWithTenant = tenantContext.tier === 'basic' 
      ? { ...item, tenantId: tenantContext.tenantId }
      : item;

    const command = new PutCommand({
      TableName: tableName,
      Item: itemWithTenant
    });

    await docClient.send(command);
    recordDynamoDBUsage(tenantContext, 'write');
  } catch (error) {
    console.error('Error putting item to DynamoDB:', error);
    throw new Error(`Failed to save item to DynamoDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get an item from DynamoDB (multi-tenant aware)
 * @param tenantContext - Tenant context
 * @param pk - Partition key value
 * @param sk - Sort key value
 * @returns Promise<Record<string, any> | null> - Item or null if not found
 */
export async function getItem(tenantContext: TenantContext, pk: string, sk: string): Promise<Record<string, any> | null> {
  const tableName = getTableName(tenantContext);
  
  if (!tableName) {
    throw new Error('DynamoDB table not configured for tenant');
  }

  try {
    const command = new GetCommand({
      TableName: tableName,
      Key: { PK: pk, SK: sk }
    });

    const response = await docClient.send(command);
    recordDynamoDBUsage(tenantContext, 'read');
    
    // Validate tenant ownership for Basic tier
    if (response.Item && tenantContext.tier === 'basic') {
      if (response.Item.tenantId && response.Item.tenantId !== tenantContext.tenantId) {
        console.warn(`Cross-tenant access attempt: ${tenantContext.tenantId} tried to access ${response.Item.tenantId}`);
        return null;
      }
    }
    
    return response.Item || null;
  } catch (error) {
    console.error('Error getting item from DynamoDB:', error);
    throw new Error(`Failed to get item from DynamoDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Query items from DynamoDB (multi-tenant aware)
 * @param tenantContext - Tenant context
 * @param pk - Partition key value
 * @param skPrefix - Optional sort key prefix for begins_with condition
 * @returns Promise<Record<string, any>[]> - Array of items
 */
export async function queryItems(tenantContext: TenantContext, pk: string, skPrefix?: string): Promise<Record<string, any>[]> {
  const tableName = getTableName(tenantContext);
  
  if (!tableName) {
    throw new Error('DynamoDB table not configured for tenant');
  }

  try {
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: skPrefix
        ? 'PK = :pk AND begins_with(SK, :sk)'
        : 'PK = :pk',
      ExpressionAttributeValues: skPrefix
        ? { ':pk': pk, ':sk': skPrefix }
        : { ':pk': pk }
    });

    const response = await docClient.send(command);
    const items = response.Items || [];
    recordDynamoDBUsage(tenantContext, 'read');
    
    // Filter by tenantId for Basic tier (additional safety)
    if (tenantContext.tier === 'basic') {
      return items.filter(item => !item.tenantId || item.tenantId === tenantContext.tenantId);
    }
    
    return items;
  } catch (error) {
    console.error('Error querying items from DynamoDB:', error);
    throw new Error(`Failed to query items from DynamoDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update an item in DynamoDB (multi-tenant aware)
 * @param tenantContext - Tenant context
 * @param pk - Partition key value
 * @param sk - Sort key value
 * @param updates - Object with attribute names and values to update
 * @returns Promise<void>
 */
export async function updateItem(
  tenantContext: TenantContext,
  pk: string,
  sk: string,
  updates: Record<string, any>
): Promise<void> {
  const tableName = getTableName(tenantContext);
  
  if (!tableName) {
    throw new Error('DynamoDB table not configured for tenant');
  }

  try {
    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.keys(updates).forEach((key, index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      updateExpressions.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = updates[key];
    });

    const command = new UpdateCommand({
      TableName: tableName,
      Key: { PK: pk, SK: sk },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });

    await docClient.send(command);
    recordDynamoDBUsage(tenantContext, 'write');
  } catch (error) {
    console.error('Error updating item in DynamoDB:', error);
    throw new Error(`Failed to update item in DynamoDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Query leaderboard using GSI (multi-tenant aware)
 * @param tenantContext - Tenant context
 * @param limit - Maximum number of results to return
 * @returns Promise<Record<string, any>[]> - Array of leaderboard entries
 */
export async function queryLeaderboard(tenantContext: TenantContext, limit: number = 10): Promise<Record<string, any>[]> {
  const tableName = getTableName(tenantContext);
  
  if (!tableName) {
    throw new Error('DynamoDB table not configured for tenant');
  }

  try {
    // Generate tenant-aware leaderboard key
    const leaderboardKey = generateLeaderboardKey(tenantContext);
    
    const command = new QueryCommand({
      TableName: tableName,
      IndexName: 'LeaderboardIndex',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: {
        ':gsi1pk': leaderboardKey
      },
      ScanIndexForward: false, // Sort in descending order (highest scores first)
      Limit: limit
    });

    const response = await docClient.send(command);
    recordDynamoDBUsage(tenantContext, 'read');
    return response.Items || [];
  } catch (error) {
    console.error('Error querying leaderboard from DynamoDB:', error);
    throw new Error(`Failed to query leaderboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Scan all items with a specific PK prefix (use sparingly) - multi-tenant aware
 * @param tenantContext - Tenant context
 * @param pkPrefix - Partition key prefix
 * @returns Promise<Record<string, any>[]> - Array of items
 */
export async function scanItemsByPrefix(tenantContext: TenantContext, pkPrefix: string): Promise<Record<string, any>[]> {
  const tableName = getTableName(tenantContext);
  
  if (!tableName) {
    throw new Error('DynamoDB table not configured for tenant');
  }

  try {
    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: 'begins_with(PK, :prefix)',
      ExpressionAttributeValues: {
        ':prefix': pkPrefix
      }
    });

    const response = await docClient.send(command);
    const items = response.Items || [];
    recordDynamoDBUsage(tenantContext, 'read');
    
    // Filter by tenantId for Basic tier (additional safety)
    if (tenantContext.tier === 'basic') {
      return items.filter(item => !item.tenantId || item.tenantId === tenantContext.tenantId);
    }
    
    return items;
  } catch (error) {
    console.error('Error scanning items from DynamoDB:', error);
    throw new Error(`Failed to scan items from DynamoDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Query games by date range for a player using GSI (multi-tenant aware)
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @param startDate - Start timestamp (milliseconds)
 * @param endDate - End timestamp (milliseconds)
 * @returns Promise<Record<string, any>[]> - Array of game records
 */
export async function queryGamesByDateRange(
  tenantContext: TenantContext,
  playerId: string,
  startDate: number,
  endDate: number
): Promise<Record<string, any>[]> {
  const tableName = getTableName(tenantContext);
  
  if (!tableName) {
    throw new Error('DynamoDB table not configured for tenant');
  }

  try {
    // Generate tenant-aware player games key
    const playerGamesKey = generatePlayerGamesKey(tenantContext, playerId);
    
    // Query using the PlayerGamesIndex GSI
    const command = new QueryCommand({
      TableName: tableName,
      IndexName: 'PlayerGamesIndex',
      KeyConditionExpression: 'GSI2PK = :playerId AND GSI2SK BETWEEN :startDate AND :endDate',
      ExpressionAttributeValues: {
        ':playerId': playerGamesKey,
        ':startDate': `GAME#${startDate}`,
        ':endDate': `GAME#${endDate}`
      }
    });

    const response = await docClient.send(command);
    recordDynamoDBUsage(tenantContext, 'read');
    
    // Transform the results to match GameHistoryEntry interface
    return (response.Items || []).map(item => ({
      sessionId: item.sessionId,
      playedAt: item.createdAt || item.updatedAt,
      status: item.status,
      score: item.score,
      guesses: item.guessesUsed || (10 - (item.guessesRemaining || 0)),
      targetNumber: item.targetNumber,
      guessesRemaining: item.guessesRemaining,
      guessesUsed: item.guessesUsed || (10 - (item.guessesRemaining || 0))
    }));
  } catch (error) {
    console.error('Error querying games by date range:', error);
    throw new Error(`Failed to query games by date range: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Query all games for a player using GSI (multi-tenant aware)
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @returns Promise<Record<string, any>[]> - Array of all game records
 */
export async function queryAllPlayerGames(tenantContext: TenantContext, playerId: string): Promise<Record<string, any>[]> {
  const tableName = getTableName(tenantContext);
  
  if (!tableName) {
    throw new Error('DynamoDB table not configured for tenant');
  }

  try {
    // Generate tenant-aware player games key
    const playerGamesKey = generatePlayerGamesKey(tenantContext, playerId);
    
    // Query using the PlayerGamesIndex GSI
    const command = new QueryCommand({
      TableName: tableName,
      IndexName: 'PlayerGamesIndex',
      KeyConditionExpression: 'GSI2PK = :playerId AND begins_with(GSI2SK, :gamePrefix)',
      ExpressionAttributeValues: {
        ':playerId': playerGamesKey,
        ':gamePrefix': 'GAME#'
      }
    });

    const response = await docClient.send(command);
    recordDynamoDBUsage(tenantContext, 'read');
    
    // Transform the results to match GameHistoryEntry interface
    return (response.Items || []).map(item => ({
      sessionId: item.sessionId,
      playedAt: item.createdAt || item.updatedAt,
      status: item.status,
      score: item.score,
      guesses: item.guessesUsed || (10 - (item.guessesRemaining || 0)),
      targetNumber: item.targetNumber,
      guessesRemaining: item.guessesRemaining,
      guessesUsed: item.guessesUsed || (10 - (item.guessesRemaining || 0))
    }));
  } catch (error) {
    console.error('Error querying all player games:', error);
    throw new Error(`Failed to query all player games: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update daily statistics for a player (multi-tenant aware)
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @param date - Date string (ISO format: YYYY-MM-DD)
 * @param won - Whether the game was won
 * @param score - Game score
 * @param guesses - Number of guesses used
 * @returns Promise<void>
 */
export async function updateDailyStats(
  tenantContext: TenantContext,
  playerId: string,
  date: string,
  won: boolean,
  score: number,
  guesses: number
): Promise<void> {
  const tableName = getTableName(tenantContext);
  
  if (!tableName) {
    throw new Error('DynamoDB table not configured for tenant');
  }

  // Generate tenant-aware partition key
  const pk = generatePartitionKey(tenantContext, playerId);
  const sk = `STATS#${date}`;

  try {
    // Try to get existing stats for the day
    const existingStats = await getItem(tenantContext, pk, sk);

    if (existingStats) {
      // Update existing stats using atomic operations
      const newGamesPlayed = existingStats.gamesPlayed + 1;
      const newWins = existingStats.wins + (won ? 1 : 0);
      const newTotalScore = existingStats.totalScore + score;
      const newTotalGuesses = existingStats.totalGuesses + guesses;
      const newWinRate = (newWins / newGamesPlayed) * 100;
      const newAverageScore = newTotalScore / newGamesPlayed;
      const newAverageGuesses = newTotalGuesses / newGamesPlayed;

      await updateItem(tenantContext, pk, sk, {
        gamesPlayed: newGamesPlayed,
        wins: newWins,
        totalScore: newTotalScore,
        totalGuesses: newTotalGuesses,
        winRate: newWinRate,
        averageScore: newAverageScore,
        averageGuesses: newAverageGuesses,
        updatedAt: Date.now()
      });
    } else {
      // Create new daily stats
      const newStats = {
        PK: pk,
        SK: sk,
        date,
        gamesPlayed: 1,
        wins: won ? 1 : 0,
        totalScore: score,
        totalGuesses: guesses,
        winRate: won ? 100 : 0,
        averageScore: score,
        averageGuesses: guesses,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await putItem(tenantContext, newStats);
    }
  } catch (error) {
    console.error('Error updating daily stats:', error);
    throw new Error(`Failed to update daily stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Export key generation functions for use in other services
 */
export {
  generatePartitionKey,
  generateLeaderboardKey,
  generateLeaderboardSortKey,
  generatePlayerGamesKey,
  getTableName
};

export { dynamoClient, docClient };

