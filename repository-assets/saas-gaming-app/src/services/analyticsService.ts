import * as dynamoService from './dynamoService';
import * as mockDataService from './mockDataService';
import { PlayerProfile } from './gameLogic';
import { TenantContext } from '../types/tenant';

/**
 * Analytics overview interface
 */
export interface AnalyticsOverview {
  playerId: string;
  playerName: string;
  totalGames: number;
  totalWins: number;
  winRate: number;
  averageGuesses: number;
  averageScore: number;
  currentStreak: number;
  bestStreak: number;
  highScore: number;
  lastPlayed: number;
}

/**
 * Win rate trend interface
 */
export interface WinRateTrend {
  date: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
}

/**
 * Game history entry interface
 */
export interface GameHistoryEntry {
  sessionId: string;
  playedAt: number;
  status: 'won' | 'lost';
  score: number;
  guesses: number;
  targetNumber: number;
}

/**
 * Game history response interface
 */
export interface GameHistoryResponse {
  games: GameHistoryEntry[];
  total: number;
}

/**
 * Score distribution interface
 */
export interface ScoreDistribution {
  range: string;
  count: number;
}

/**
 * Get analytics overview for a player
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @returns Promise<AnalyticsOverview> - Analytics overview data
 */
export async function getAnalyticsOverview(tenantContext: TenantContext, playerId: string): Promise<AnalyticsOverview> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    console.log('Using mock data for analytics overview');
    return mockDataService.getMockAnalyticsOverview(tenantContext.tenantId, playerId);
  }

  // Query player profile
  const pk = dynamoService.generatePartitionKey(tenantContext, playerId);
  const profile = await dynamoService.getItem(tenantContext, pk, 'PROFILE');
  
  if (!profile) {
    throw new Error('Player profile not found');
  }

  const playerProfile = profile as PlayerProfile;
  
  // Query recent games for additional metrics
  const recentGames = await queryRecentGames(tenantContext, playerId, 100);
  
  // Calculate metrics
  const averageGuesses = calculateAverageGuesses(recentGames);
  const averageScore = calculateAverageScore(recentGames);
  const currentStreak = calculateCurrentStreak(recentGames);
  const bestStreak = calculateBestStreak(recentGames);
  
  return {
    playerId: playerProfile.playerId,
    playerName: playerProfile.playerName,
    totalGames: playerProfile.totalGames,
    totalWins: playerProfile.totalWins,
    winRate: playerProfile.totalGames > 0 
      ? (playerProfile.totalWins / playerProfile.totalGames) * 100 
      : 0,
    averageGuesses,
    averageScore,
    currentStreak,
    bestStreak,
    highScore: playerProfile.highScore,
    lastPlayed: playerProfile.updatedAt
  };
}

/**
 * Get win rate trends over time
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @param days - Number of days to look back
 * @returns Promise<WinRateTrend[]> - Array of win rate trends by day
 */
export async function getWinRateTrends(tenantContext: TenantContext, playerId: string, days: number): Promise<WinRateTrend[]> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    console.log('Using mock data for win rate trends');
    return mockDataService.getMockWinRateTrends(tenantContext.tenantId, days);
  }

  const endDate = Date.now();
  const startDate = endDate - (days * 24 * 60 * 60 * 1000);
  
  // Query games within date range
  const games = await queryGamesByDateRange(tenantContext, playerId, startDate, endDate);
  
  // Group by day and calculate win rate
  const trendsByDay = groupGamesByDay(games);
  
  return trendsByDay.map(day => ({
    date: day.date,
    gamesPlayed: day.games.length,
    wins: day.games.filter(g => g.status === 'won').length,
    winRate: day.games.length > 0 
      ? (day.games.filter(g => g.status === 'won').length / day.games.length) * 100 
      : 0
  }));
}

/**
 * Get complete game history with pagination
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @param limit - Maximum number of games to return
 * @param offset - Number of games to skip
 * @returns Promise<GameHistoryResponse> - Paginated game history
 */
export async function getGameHistory(
  tenantContext: TenantContext,
  playerId: string,
  limit: number,
  offset: number
): Promise<GameHistoryResponse> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    console.log('Using mock data for game history');
    return mockDataService.getMockGameHistory(tenantContext.tenantId, playerId, limit, offset);
  }

  const allGames = await queryAllPlayerGames(tenantContext, playerId);
  
  const total = allGames.length;
  const games = allGames
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(offset, offset + limit);
  
  return { games, total };
}

/**
 * Export all player data
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @returns Promise<any> - Complete player data export
 */
export async function exportPlayerData(tenantContext: TenantContext, playerId: string): Promise<any> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    console.log('Using mock data for player data export');
    return mockDataService.getMockPlayerDataExport(tenantContext.tenantId, playerId);
  }

  const pk = dynamoService.generatePartitionKey(tenantContext, playerId);
  const profile = await dynamoService.getItem(tenantContext, pk, 'PROFILE');
  
  if (!profile) {
    throw new Error('Player profile not found');
  }

  const overview = await getAnalyticsOverview(tenantContext, playerId);
  const allGames = await queryAllPlayerGames(tenantContext, playerId);
  
  return {
    exportedAt: new Date().toISOString(),
    tenantId: tenantContext.tenantId,
    tenantName: tenantContext.tenantName,
    tier: tenantContext.tier,
    profile,
    analytics: overview,
    gameHistory: allGames,
    totalRecords: allGames.length
  };
}

/**
 * Query recent games for a player
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @param limit - Maximum number of games to return
 * @returns Promise<any[]> - Array of game records
 */
async function queryRecentGames(tenantContext: TenantContext, playerId: string, limit: number): Promise<any[]> {
  // Query all games for the player
  const allGames = await queryAllPlayerGames(tenantContext, playerId);
  
  // Sort by timestamp descending and limit
  return allGames
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, limit);
}

/**
 * Query games by date range (to be implemented in dynamoService extension)
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @param startDate - Start timestamp
 * @param endDate - End timestamp
 * @returns Promise<any[]> - Array of game records
 */
async function queryGamesByDateRange(
  tenantContext: TenantContext,
  playerId: string,
  startDate: number,
  endDate: number
): Promise<any[]> {
  // This will use the extended dynamoService function
  return dynamoService.queryGamesByDateRange(tenantContext, playerId, startDate, endDate);
}

/**
 * Query all games for a player (to be implemented in dynamoService extension)
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @returns Promise<GameHistoryEntry[]> - Array of all game records
 */
async function queryAllPlayerGames(tenantContext: TenantContext, playerId: string): Promise<GameHistoryEntry[]> {
  // This will use the extended dynamoService function
  const games = await dynamoService.queryAllPlayerGames(tenantContext, playerId);
  
  // Transform to GameHistoryEntry format
  return games.map(game => ({
    sessionId: game.sessionId,
    playedAt: game.playedAt,
    status: game.status,
    score: game.score,
    guesses: game.guesses,
    targetNumber: game.targetNumber
  }));
}

/**
 * Calculate average guesses from game records
 * @param games - Array of game records
 * @returns number - Average guesses per game
 */
function calculateAverageGuesses(games: any[]): number {
  if (games.length === 0) return 0;
  
  const totalGuesses = games.reduce((sum, game) => {
    const guessesUsed = game.guessesUsed || (10 - (game.guessesRemaining || 0));
    return sum + guessesUsed;
  }, 0);
  
  return totalGuesses / games.length;
}

/**
 * Calculate average score from game records
 * @param games - Array of game records
 * @returns number - Average score per game
 */
function calculateAverageScore(games: any[]): number {
  if (games.length === 0) return 0;
  
  const totalScore = games.reduce((sum, game) => sum + (game.score || 0), 0);
  return totalScore / games.length;
}

/**
 * Calculate current streak (consecutive wins)
 * @param games - Array of game records (should be sorted by date descending)
 * @returns number - Current streak count
 */
function calculateCurrentStreak(games: any[]): number {
  if (games.length === 0) return 0;
  
  // Sort by timestamp descending to get most recent first
  const sortedGames = [...games].sort((a, b) => b.playedAt - a.playedAt);
  
  let streak = 0;
  for (const game of sortedGames) {
    if (game.status === 'won') {
      streak++;
    } else {
      break;
    }
  }
  
  return streak;
}

/**
 * Calculate best streak (longest consecutive wins)
 * @param games - Array of game records
 * @returns number - Best streak count
 */
function calculateBestStreak(games: any[]): number {
  if (games.length === 0) return 0;
  
  // Sort by timestamp ascending to process chronologically
  const sortedGames = [...games].sort((a, b) => a.playedAt - b.playedAt);
  
  let currentStreak = 0;
  let bestStreak = 0;
  
  for (const game of sortedGames) {
    if (game.status === 'won') {
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  return bestStreak;
}

/**
 * Group games by day
 * @param games - Array of game records
 * @returns Array of grouped games by date
 */
function groupGamesByDay(games: any[]): Array<{ date: string; games: any[] }> {
  const gamesByDay = new Map<string, any[]>();
  
  for (const game of games) {
    const date = new Date(game.playedAt).toISOString().split('T')[0];
    
    if (!gamesByDay.has(date)) {
      gamesByDay.set(date, []);
    }
    
    gamesByDay.get(date)!.push(game);
  }
  
  // Convert to array and sort by date
  return Array.from(gamesByDay.entries())
    .map(([date, games]) => ({ date, games }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
