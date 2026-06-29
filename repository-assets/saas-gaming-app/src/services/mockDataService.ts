/**
 * Mock Data Service
 * Provides in-memory mock data when DynamoDB is not configured
 * Automatically switches to real DynamoDB when configured
 */

interface MockPlayer {
  tenantId: string;
  playerId: string;
  playerName: string;
  totalGames: number;
  totalWins: number;
  highScore: number;
  createdAt: number;
  updatedAt: number;
}

interface MockGameSession {
  tenantId: string;
  sessionId: string;
  playerId: string;
  playerName: string;
  targetNumber: number;
  guesses: number[];
  status: 'active' | 'won' | 'lost';
  score: number;
  guessesRemaining: number;
  createdAt: number;
  updatedAt: number;
}

interface MockTenant {
  tenantId: string;
  tenantName: string;
  tier: 'basic' | 'pro';
  tableName?: string;
  createdAt: number;
  updatedAt: number;
}

// In-memory storage - keyed by tenantId#playerId or tenantId#sessionId
const mockTenants: Map<string, MockTenant> = new Map();
const mockPlayers: Map<string, MockPlayer> = new Map();
const mockSessions: Map<string, MockGameSession> = new Map();
const mockAvatars: Map<string, string> = new Map(); // tenantId#playerId -> base64 data URL

/**
 * Check if we should use mock data
 */
export function shouldUseMockData(): boolean {
  return !process.env.DYNAMODB_TABLE;
}

/**
 * Create or update mock tenant
 */
export function createMockTenant(tenantId: string, tenantName: string, tier: 'basic' | 'pro'): MockTenant {
  const existingTenant = mockTenants.get(tenantId);
  
  if (existingTenant) {
    // Update existing tenant
    existingTenant.tenantName = tenantName;
    existingTenant.tier = tier;
    existingTenant.updatedAt = Date.now();
    mockTenants.set(tenantId, existingTenant);
    return existingTenant;
  }
  
  // Create new tenant
  const tenant: MockTenant = {
    tenantId,
    tenantName,
    tier,
    tableName: tier === 'pro' ? `gaming-app-tenant-${tenantId}` : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  mockTenants.set(tenantId, tenant);
  return tenant;
}

/**
 * Get mock tenant
 */
export function getMockTenant(tenantId: string): MockTenant | null {
  return mockTenants.get(tenantId) || null;
}

/**
 * List all mock tenants
 */
export function listMockTenants(): MockTenant[] {
  return Array.from(mockTenants.values());
}

/**
 * Delete mock tenant and all associated data
 */
export function deleteMockTenant(tenantId: string): boolean {
  const tenant = mockTenants.get(tenantId);
  if (!tenant) return false;
  
  // Delete all players for this tenant
  for (const [key, player] of mockPlayers.entries()) {
    if (player.tenantId === tenantId) {
      mockPlayers.delete(key);
    }
  }
  
  // Delete all sessions for this tenant
  for (const [key, session] of mockSessions.entries()) {
    if (session.tenantId === tenantId) {
      mockSessions.delete(key);
    }
  }
  
  // Delete all avatars for this tenant
  for (const [key] of mockAvatars.entries()) {
    if (key.startsWith(`${tenantId}#`)) {
      mockAvatars.delete(key);
    }
  }
  
  // Delete the tenant
  mockTenants.delete(tenantId);
  return true;
}

/**
 * Get or create mock player
 */
export function getMockPlayer(tenantId: string, playerId: string, playerName?: string): MockPlayer {
  const key = `${tenantId}#${playerId}`;
  let player = mockPlayers.get(key);
  
  if (!player) {
    player = {
      tenantId,
      playerId,
      playerName: playerName || playerId,
      totalGames: 0,
      totalWins: 0,
      highScore: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    mockPlayers.set(key, player);
  }
  
  return player;
}

/**
 * Update mock player
 */
export function updateMockPlayer(tenantId: string, playerId: string, updates: Partial<MockPlayer>): MockPlayer {
  const player = getMockPlayer(tenantId, playerId);
  Object.assign(player, updates, { updatedAt: Date.now() });
  const key = `${tenantId}#${playerId}`;
  mockPlayers.set(key, player);
  return player;
}

/**
 * List all players for a tenant
 */
export function listMockPlayersByTenant(tenantId: string): MockPlayer[] {
  return Array.from(mockPlayers.values()).filter(p => p.tenantId === tenantId);
}

/**
 * Create mock game session
 */
export function createMockSession(tenantId: string, playerId: string, playerName: string): MockGameSession {
  const sessionId = `mock-session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const targetNumber = Math.floor(Math.random() * 100) + 1;
  
  const session: MockGameSession = {
    tenantId,
    sessionId,
    playerId,
    playerName,
    targetNumber,
    guesses: [],
    status: 'active',
    score: 1000,
    guessesRemaining: 10,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  mockSessions.set(sessionId, session);
  return session;
}

/**
 * Get mock session
 */
export function getMockSession(sessionId: string): MockGameSession | null {
  return mockSessions.get(sessionId) || null;
}

/**
 * Update mock session
 */
export function updateMockSession(sessionId: string, updates: Partial<MockGameSession>): MockGameSession | null {
  const session = mockSessions.get(sessionId);
  if (!session) return null;
  
  Object.assign(session, updates, { updatedAt: Date.now() });
  mockSessions.set(sessionId, session);
  return session;
}

/**
 * List all sessions for a tenant
 */
export function listMockSessionsByTenant(tenantId: string): MockGameSession[] {
  return Array.from(mockSessions.values()).filter(s => s.tenantId === tenantId);
}

/**
 * Get mock leaderboard (tenant-scoped)
 */
export function getMockLeaderboard(tenantId: string, limit: number = 10): Array<MockPlayer & { currentStreak: number; bestStreak: number }> {
  // Filter players by tenantId
  const tenantPlayers = Array.from(mockPlayers.values()).filter(p => p.tenantId === tenantId);
  
  // Sort by high score descending
  tenantPlayers.sort((a, b) => b.highScore - a.highScore);
  
  // Add streak fields to match PlayerProfile interface
  return tenantPlayers.slice(0, limit).map(player => ({
    ...player,
    currentStreak: 0,
    bestStreak: 0
  }));
}

/**
 * Store mock avatar
 */
export function storeMockAvatar(tenantId: string, playerId: string, dataUrl: string): void {
  const key = `${tenantId}#${playerId}`;
  mockAvatars.set(key, dataUrl);
}

/**
 * Get mock avatar
 */
export function getMockAvatar(tenantId: string, playerId: string): string | null {
  const key = `${tenantId}#${playerId}`;
  return mockAvatars.get(key) || null;
}

/**
 * Check if mock avatar exists
 */
export function mockAvatarExists(tenantId: string, playerId: string): boolean {
  const key = `${tenantId}#${playerId}`;
  return mockAvatars.has(key);
}

/**
 * Get mock data statistics (for debugging)
 */
export function getMockDataStats() {
  return {
    tenants: mockTenants.size,
    players: mockPlayers.size,
    sessions: mockSessions.size,
    avatars: mockAvatars.size,
    usingMockData: shouldUseMockData()
  };
}

/**
 * Clear all mock data (for testing)
 */
export function clearMockData(): void {
  mockTenants.clear();
  mockPlayers.clear();
  mockSessions.clear();
  mockAvatars.clear();
}

/**
 * Initialize default mock tenants for testing
 */
export function initializeDefaultMockTenants(): void {
  // Only initialize if no tenants exist
  if (mockTenants.size > 0) {
    return;
  }
  
  // Create default Basic tier tenant
  createMockTenant('acme-corp', 'Acme Corporation', 'basic');
  
  // Create default Pro tier tenant
  createMockTenant('tech-startup', 'Tech Startup Inc', 'pro');
  
  // Create some mock players for Acme Corp
  getMockPlayer('acme-corp', 'alice', 'Alice Johnson');
  updateMockPlayer('acme-corp', 'alice', {
    totalGames: 20,
    totalWins: 15,
    highScore: 950
  });
  
  getMockPlayer('acme-corp', 'bob', 'Bob Smith');
  updateMockPlayer('acme-corp', 'bob', {
    totalGames: 15,
    totalWins: 8,
    highScore: 800
  });
  
  // Create some mock players for Tech Startup
  getMockPlayer('tech-startup', 'charlie', 'Charlie Brown');
  updateMockPlayer('tech-startup', 'charlie', {
    totalGames: 30,
    totalWins: 22,
    highScore: 980
  });
  
  getMockPlayer('tech-startup', 'diana', 'Diana Prince');
  updateMockPlayer('tech-startup', 'diana', {
    totalGames: 25,
    totalWins: 18,
    highScore: 920
  });
  
  console.log('Initialized default mock tenants and players');
}

/**
 * Generate mock analytics overview (tenant-scoped)
 */
export function getMockAnalyticsOverview(tenantId: string, playerId: string) {
  const player = getMockPlayer(tenantId, playerId);
  
  return {
    playerId: player.playerId,
    playerName: player.playerName,
    totalGames: player.totalGames || 15,
    totalWins: player.totalWins || 9,
    winRate: player.totalGames > 0 ? ((player.totalWins || 9) / (player.totalGames || 15)) * 100 : 60,
    averageGuesses: 5.8,
    averageScore: 650,
    currentStreak: 3,
    bestStreak: 5,
    highScore: player.highScore || 950,
    lastPlayed: Date.now() - 3600000 // 1 hour ago
  };
}

/**
 * Generate mock win rate trends (tenant-scoped)
 */
export function getMockWinRateTrends(_tenantId: string, days: number) {
  const trends = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Generate random but realistic data
    const gamesPlayed = Math.floor(Math.random() * 5) + 1;
    const wins = Math.floor(Math.random() * (gamesPlayed + 1));
    
    trends.push({
      date: dateStr,
      gamesPlayed,
      wins,
      winRate: gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0
    });
  }
  
  return trends;
}

/**
 * Generate mock game history (tenant-scoped)
 */
export function getMockGameHistory(tenantId: string, playerId: string, limit: number, offset: number): { games: Array<{ sessionId: string; playedAt: number; status: 'won' | 'lost'; score: number; guesses: number; targetNumber: number }>; total: number } {
  const totalGames = 25;
  const games: Array<{ sessionId: string; playedAt: number; status: 'won' | 'lost'; score: number; guesses: number; targetNumber: number }> = [];
  
  for (let i = 0; i < totalGames; i++) {
    const won = Math.random() > 0.4; // 60% win rate
    const guesses = Math.floor(Math.random() * 8) + 2; // 2-10 guesses
    const score = won ? Math.floor(Math.random() * 500) + 500 : Math.floor(Math.random() * 300);
    
    games.push({
      sessionId: `mock-session-${tenantId}-${playerId}-${i}`,
      playedAt: Date.now() - (i * 3600000), // Each game 1 hour apart
      status: won ? 'won' : 'lost',
      score,
      guesses,
      targetNumber: Math.floor(Math.random() * 100) + 1
    });
  }
  
  // Apply pagination
  const paginatedGames = games.slice(offset, offset + limit);
  
  return {
    games: paginatedGames,
    total: totalGames
  };
}

/**
 * Generate mock player data export (tenant-scoped)
 */
export function getMockPlayerDataExport(tenantId: string, playerId: string) {
  const player = getMockPlayer(tenantId, playerId);
  const overview = getMockAnalyticsOverview(tenantId, playerId);
  const history = getMockGameHistory(tenantId, playerId, 100, 0);
  
  // Get tenant info from mock tenants
  const tenant = mockTenants.get(tenantId);
  
  return {
    exportedAt: new Date().toISOString(),
    tenantId: tenantId,
    tenantName: tenant?.tenantName || 'Mock Tenant',
    tier: tenant?.tier || 'basic',
    profile: player,
    analytics: overview,
    gameHistory: history.games,
    totalRecords: history.total
  };
}
