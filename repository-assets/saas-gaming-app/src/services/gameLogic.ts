import { v4 as uuidv4 } from 'uuid';
import * as dynamoService from './dynamoService';
import * as mockDataService from './mockDataService';
import { TenantContext } from '../types/tenant';

/**
 * Game state interface
 */
export interface GameState {
  sessionId: string;
  playerId: string;
  playerName: string;
  score: number;
  guessesRemaining: number;
  guesses: number[];         // Array of previous guesses
  targetNumber: number;
  status: 'active' | 'won' | 'lost';
  createdAt: number;
  updatedAt: number;
}

/**
 * Player profile interface
 */
export interface PlayerProfile {
  tenantId: string;          // Tenant association
  playerId: string;
  playerName: string;
  totalGames: number;
  totalWins: number;
  highScore: number;
  currentStreak: number;
  bestStreak: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Game move result interface
 */
export interface MoveResult {
  sessionId: string;
  guess: number;
  result: 'correct' | 'too_high' | 'too_low' | 'game_over';
  guessesRemaining: number;
  score: number;
  status: 'active' | 'won' | 'lost';
}

/**
 * Start a new game session
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @param playerName - Player name
 * @returns Promise<GameState> - New game state
 */
export async function startGame(tenantContext: TenantContext, playerId: string, playerName: string): Promise<GameState> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    console.log('Using mock data for game session');
    const session = mockDataService.createMockSession(tenantContext.tenantId, playerId, playerName);
    return {
      ...session,
      targetNumber: 0 // Don't reveal target to client
    };
  }

  const sessionId = uuidv4();
  const targetNumber = Math.floor(Math.random() * 100) + 1; // Random number between 1-100
  const timestamp = Date.now();

  const gameState: GameState = {
    sessionId,
    playerId,
    playerName,
    score: 1000, // Starting score
    guessesRemaining: 10, // 10 guesses allowed
    guesses: [], // Initialize empty guesses array
    targetNumber,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  // Generate tenant-aware partition key for session
  // Sessions are stored with SESSION# prefix so they can be retrieved by sessionId
  const sessionPK = tenantContext.tier === 'pro' 
    ? `SESSION#${sessionId}`
    : `TENANT#${tenantContext.tenantId}#SESSION#${sessionId}`;

  // Save game state to DynamoDB
  await dynamoService.putItem(tenantContext, {
    PK: sessionPK,
    SK: `GAME#${timestamp}`,
    GSI2PK: dynamoService.generatePlayerGamesKey(tenantContext, playerId),
    GSI2SK: `GAME#${timestamp}`,
    ...gameState
  });

  // Update or create player profile
  await updatePlayerProfile(tenantContext, playerId, playerName, false);

  // Return game state without revealing target number
  return {
    ...gameState,
    targetNumber: 0 // Don't reveal target to client
  };
}

/**
 * Process a game move (guess)
 * @param tenantContext - Tenant context
 * @param sessionId - Game session ID
 * @param guess - Player's guess
 * @returns Promise<MoveResult> - Result of the move
 */
export async function processMove(tenantContext: TenantContext, sessionId: string, guess: number): Promise<MoveResult> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    const gameState = mockDataService.getMockSession(sessionId);
    
    if (!gameState) {
      throw new Error('Game session not found');
    }

    if (gameState.status !== 'active') {
      throw new Error('Game is not active, please start a new game');
    }

    if (guess < 1 || guess > 100) {
      throw new Error('Guess must be between 1 and 100');
    }

    // Check if this number has already been guessed
    if (gameState.guesses.includes(guess)) {
      throw new Error(`You already guessed ${guess}! Try a different number.`);
    }

    // Process the guess
    let result: 'correct' | 'too_high' | 'too_low' | 'game_over';
    let newStatus: 'active' | 'won' | 'lost' = gameState.status;
    let newScore = gameState.score;
    let newGuessesRemaining = gameState.guessesRemaining - 1;

    gameState.guesses.push(guess);

    if (guess === gameState.targetNumber) {
      result = 'correct';
      newStatus = 'won';
      newScore += newGuessesRemaining * 100;
    } else if (newGuessesRemaining <= 0) {
      result = 'game_over';
      newStatus = 'lost';
      newScore = 0;
    } else {
      result = guess > gameState.targetNumber ? 'too_high' : 'too_low';
      newScore -= 50;
    }

    // Update mock session
    mockDataService.updateMockSession(sessionId, {
      guessesRemaining: newGuessesRemaining,
      score: newScore,
      status: newStatus
    });

    // Update mock player profile
    if (newStatus === 'won') {
      const player = mockDataService.getMockPlayer(tenantContext.tenantId, gameState.playerId, gameState.playerName);
      mockDataService.updateMockPlayer(tenantContext.tenantId, gameState.playerId, {
        totalGames: player.totalGames + 1,
        totalWins: player.totalWins + 1,
        highScore: Math.max(player.highScore, newScore)
      });
    } else if (newStatus === 'lost') {
      const player = mockDataService.getMockPlayer(tenantContext.tenantId, gameState.playerId, gameState.playerName);
      mockDataService.updateMockPlayer(tenantContext.tenantId, gameState.playerId, {
        totalGames: player.totalGames + 1
      });
    }

    return {
      sessionId,
      guess,
      result,
      guessesRemaining: newGuessesRemaining,
      score: newScore,
      status: newStatus
    };
  }

  // Get current game state from DynamoDB using sessionId
  // Generate tenant-aware session key
  const sessionPK = tenantContext.tier === 'pro'
    ? `SESSION#${sessionId}`
    : `TENANT#${tenantContext.tenantId}#SESSION#${sessionId}`;
  
  const items = await dynamoService.queryItems(tenantContext, sessionPK);
  
  if (items.length === 0) {
    throw new Error('Game session not found');
  }

  const gameState = items[0] as GameState & { SK: string };

  if (gameState.status !== 'active') {
    throw new Error('Game is not active, please start a new game');
  }

  if (guess < 1 || guess > 100) {
    throw new Error('Guess must be between 1 and 100');
  }

  // Check if this number has already been guessed
  const previousGuesses = gameState.guesses || [];
  if (previousGuesses.includes(guess)) {
    throw new Error(`You already guessed ${guess}! Try a different number.`);
  }

  // Add current guess to the array
  const updatedGuesses = [...previousGuesses, guess];

  // Process the guess
  let result: 'correct' | 'too_high' | 'too_low' | 'game_over';
  let newStatus: 'active' | 'won' | 'lost' = gameState.status;
  let newScore = gameState.score;
  let newGuessesRemaining = gameState.guessesRemaining - 1;

  if (guess === gameState.targetNumber) {
    result = 'correct';
    newStatus = 'won';
    // Bonus points for guesses remaining
    newScore += newGuessesRemaining * 100;
  } else if (newGuessesRemaining <= 0) {
    result = 'game_over';
    newStatus = 'lost';
    newScore = 0;
  } else {
    result = guess > gameState.targetNumber ? 'too_high' : 'too_low';
    newScore -= 50; // Penalty for wrong guess
  }

  const now = Date.now();
  const guessesUsed = 10 - newGuessesRemaining;

  // Prepare update object
  const updates: Record<string, any> = {
    guesses: updatedGuesses,
    guessesRemaining: newGuessesRemaining,
    score: newScore,
    status: newStatus,
    updatedAt: now
  };

  // If game ended, add completion tracking fields
  if (newStatus === 'won' || newStatus === 'lost') {
    updates.completedAt = now;
    updates.duration = now - gameState.createdAt;
    updates.guessesUsed = guessesUsed;
    
    // Add GSI attributes for analytics queries
    updates.GSI2PK = dynamoService.generatePlayerGamesKey(tenantContext, gameState.playerId);
    updates.GSI2SK = `GAME#${now}`;
  }

  // Update game state
  await dynamoService.updateItem(
    tenantContext,
    sessionPK,
    gameState.SK,
    updates
  );

  // If game ended, update player profile and daily stats
  if (newStatus === 'won') {
    await updatePlayerProfile(tenantContext, gameState.playerId, gameState.playerName, true, newScore);
    await updateDailyStats(tenantContext, gameState.playerId, true, newScore, guessesUsed);
  } else if (newStatus === 'lost') {
    await updatePlayerProfile(tenantContext, gameState.playerId, gameState.playerName, false);
    await updateDailyStats(tenantContext, gameState.playerId, false, newScore, guessesUsed);
  }

  return {
    sessionId,
    guess,
    result,
    guessesRemaining: newGuessesRemaining,
    score: newScore,
    status: newStatus
  };
}

/**
 * Get game state
 * @param tenantContext - Tenant context
 * @param sessionId - Game session ID
 * @returns Promise<GameState | null> - Game state or null if not found
 */
export async function getGameState(tenantContext: TenantContext, sessionId: string): Promise<GameState | null> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    const session = mockDataService.getMockSession(sessionId);
    if (!session) {
      return null;
    }
    
    // Don't reveal target number if game is still active
    if (session.status === 'active') {
      return {
        ...session,
        targetNumber: 0
      };
    }
    
    return session;
  }

  // Generate tenant-aware session key
  const sessionPK = tenantContext.tier === 'pro'
    ? `SESSION#${sessionId}`
    : `TENANT#${tenantContext.tenantId}#SESSION#${sessionId}`;

  const items = await dynamoService.queryItems(tenantContext, sessionPK);
  
  if (items.length === 0) {
    return null;
  }

  const gameState = items[0] as GameState;
  
  // Don't reveal target number if game is still active
  if (gameState.status === 'active') {
    return {
      ...gameState,
      targetNumber: 0
    };
  }

  return gameState;
}

/**
 * Get leaderboard
 * @param tenantContext - Tenant context
 * @param limit - Maximum number of entries to return
 * @returns Promise<PlayerProfile[]> - Array of player profiles sorted by high score
 */
export async function getLeaderboard(tenantContext: TenantContext, limit: number = 10): Promise<PlayerProfile[]> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    console.log('Using mock data for leaderboard');
    return mockDataService.getMockLeaderboard(tenantContext.tenantId, limit);
  }

  const items = await dynamoService.queryLeaderboard(tenantContext, limit);
  return items as PlayerProfile[];
}

/**
 * Calculate current streak for a player
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @returns Promise<number> - Current streak count
 */
async function calculateCurrentStreak(tenantContext: TenantContext, playerId: string): Promise<number> {
  // Get all games for the player, sorted by most recent first
  const games = await dynamoService.queryAllPlayerGames(tenantContext, playerId);
  
  if (games.length === 0) {
    return 0;
  }

  // Sort by playedAt descending (most recent first)
  const sortedGames = games.sort((a, b) => b.playedAt - a.playedAt);
  
  let streak = 0;
  
  // Count consecutive wins from the most recent game
  for (const game of sortedGames) {
    if (game.status === 'won') {
      streak++;
    } else {
      // Streak broken by a loss
      break;
    }
  }
  
  return streak;
}

/**
 * Calculate best streak for a player
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @returns Promise<number> - Best streak count
 */
async function calculateBestStreak(tenantContext: TenantContext, playerId: string): Promise<number> {
  // Get all games for the player
  const games = await dynamoService.queryAllPlayerGames(tenantContext, playerId);
  
  if (games.length === 0) {
    return 0;
  }

  // Sort by playedAt ascending (oldest first)
  const sortedGames = games.sort((a, b) => a.playedAt - b.playedAt);
  
  let currentStreak = 0;
  let bestStreak = 0;
  
  // Find the longest consecutive win streak
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
 * Update player profile
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @param playerName - Player name
 * @param won - Whether the player won the game
 * @param score - Final score (optional)
 * @returns Promise<void>
 */
async function updatePlayerProfile(
  tenantContext: TenantContext,
  playerId: string,
  playerName: string,
  won: boolean,
  score?: number
): Promise<void> {
  const pk = dynamoService.generatePartitionKey(tenantContext, playerId);
  const sk = 'PROFILE';

  // Try to get existing profile
  const existingProfile = await dynamoService.getItem(tenantContext, pk, sk);

  // Calculate streaks
  const currentStreak = await calculateCurrentStreak(tenantContext, playerId);
  const bestStreak = await calculateBestStreak(tenantContext, playerId);

  if (existingProfile) {
    // Update existing profile
    const updates: Record<string, any> = {
      totalGames: existingProfile.totalGames + 1,
      currentStreak,
      bestStreak,
      updatedAt: Date.now()
    };

    if (won) {
      updates.totalWins = existingProfile.totalWins + 1;
    }

    if (score !== undefined && score > existingProfile.highScore) {
      updates.highScore = score;
      updates.GSI1PK = dynamoService.generateLeaderboardKey(tenantContext); // For leaderboard GSI
      updates.GSI1SK = dynamoService.generateLeaderboardSortKey(score, playerId);
      updates.score = score; // For sorting in GSI
    }

    await dynamoService.updateItem(tenantContext, pk, sk, updates);
  } else {
    // Create new profile
    const timestamp = Date.now();
    const newProfile: PlayerProfile = {
      tenantId: tenantContext.tenantId,
      playerId,
      playerName,
      totalGames: 1,
      totalWins: won ? 1 : 0,
      highScore: score || 0,
      currentStreak,
      bestStreak,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await dynamoService.putItem(tenantContext, {
      PK: pk,
      SK: sk,
      GSI1PK: dynamoService.generateLeaderboardKey(tenantContext), // For leaderboard GSI
      GSI1SK: dynamoService.generateLeaderboardSortKey(score || 0, playerId),
      score: score || 0, // For sorting in GSI
      ...newProfile
    });
  }
}

/**
 * Get player profile
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @returns Promise<PlayerProfile | null> - Player profile or null if not found
 */
export async function getPlayerProfile(tenantContext: TenantContext, playerId: string): Promise<PlayerProfile | null> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    const player = mockDataService.getMockPlayer(tenantContext.tenantId, playerId);
    return player ? {
      ...player,
      tenantId: tenantContext.tenantId,
      currentStreak: 0,
      bestStreak: 0
    } : null;
  }

  const pk = dynamoService.generatePartitionKey(tenantContext, playerId);
  const profile = await dynamoService.getItem(tenantContext, pk, 'PROFILE');
  return profile as PlayerProfile | null;
}

/**
 * Update daily statistics for a player
 * @param tenantContext - Tenant context
 * @param playerId - Player identifier
 * @param won - Whether the game was won
 * @param score - Game score
 * @param guessesUsed - Number of guesses used
 * @returns Promise<void>
 */
async function updateDailyStats(
  tenantContext: TenantContext,
  playerId: string,
  won: boolean,
  score: number,
  guessesUsed: number
): Promise<void> {
  // Get current date in ISO format (YYYY-MM-DD)
  const date = new Date().toISOString().split('T')[0];
  
  // Call DynamoDB service to update daily stats
  await dynamoService.updateDailyStats(tenantContext, playerId, date, won, score, guessesUsed);
}

/**
 * Check if a nickname (player name) already exists
 * @param tenantContext - Tenant context
 * @param nickname - Nickname to check
 * @returns Promise<PlayerProfile | null> - Player profile if found, null otherwise
 */
export async function checkNicknameExists(tenantContext: TenantContext, nickname: string): Promise<PlayerProfile | null> {
  // Use mock data if DynamoDB is not configured
  if (mockDataService.shouldUseMockData()) {
    const players = mockDataService.getMockLeaderboard(tenantContext.tenantId, 100);
    const found = players.find(p => p.playerName.toLowerCase() === nickname.toLowerCase());
    return found || null;
  }

  // Get leaderboard (all players) and check if nickname exists
  const players = await dynamoService.queryLeaderboard(tenantContext, 100);
  const found = players.find((p: any) => p.playerName.toLowerCase() === nickname.toLowerCase());
  return found ? (found as PlayerProfile) : null;
}

