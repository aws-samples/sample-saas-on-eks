/**
 * SaaS Gaming Platform - Number Guessing Game Client
 * Handles game state rendering, player moves, API calls, and leaderboard updates
 */

// Game state
let currentSessionId = null;
let currentPlayerId = null;
let currentPlayerName = null;
let guessHistory = [];
let tenantTier = 'basic'; // Default tier
let tierConfig = null; // Tier configuration
let tenantContext = null; // Tenant context (tenantId, tenantName, tier)

// DOM Elements
const onboardingSection = document.getElementById('onboarding-section');
const gamePlaySection = document.getElementById('game-play');
const leaderboardSection = document.getElementById('leaderboard-section');

const playerNameInput = document.getElementById('player-name');
const nextToAvatarBtn = document.getElementById('next-to-avatar-btn');
const startGameBtn = document.getElementById('start-game-btn');

const currentPlayerSpan = document.getElementById('current-player');
const currentScoreSpan = document.getElementById('current-score');
const guessesRemainingSpan = document.getElementById('guesses-remaining');

const guessInput = document.getElementById('guess-input');
const submitGuessBtn = document.getElementById('submit-guess-btn');
const feedbackMessage = document.getElementById('feedback-message');
const guessList = document.getElementById('guess-list');
const newGameBtn = document.getElementById('new-game-btn');
const switchPlayerBtn = document.getElementById('switch-player-btn');

const refreshLeaderboardBtn = document.getElementById('refresh-leaderboard-btn');
const leaderboardContainer = document.getElementById('leaderboard-container');

// Analytics elements
const exportDataBtn = document.getElementById('export-data-btn');
const loadMoreHistoryBtn = document.getElementById('load-more-history');

// Analytics state
let currentHistoryOffset = 0;
let winRateChart = null;
let scoreDistributionChart = null;

/**
 * Display tenant context in UI
 */
function displayTenantContext() {
    if (!tenantContext) {
        console.warn('No tenant context available to display');
        return;
    }
    
    // Update tenant name in header
    const tenantNameEl = document.getElementById('tenant-name');
    if (tenantNameEl) {
        tenantNameEl.textContent = tenantContext.tenantName;
    }
    
    // Update tier badge
    const tierBadge = document.getElementById('tier-badge');
    if (tierBadge) {
        tierBadge.textContent = tenantContext.tier.toUpperCase();
        tierBadge.className = `tier-badge tier-${tenantContext.tier}`;
    }
    
    // Update current player display if available
    updateCurrentPlayerDisplay();
    
    console.log('Tenant context displayed in UI');
}

/**
 * Update current player display in tenant header
 */
function updateCurrentPlayerDisplay() {
    const currentPlayerDisplayEl = document.getElementById('current-player-display');
    if (currentPlayerDisplayEl) {
        const playerName = currentPlayerName || localStorage.getItem('playerName');
        if (playerName) {
            currentPlayerDisplayEl.textContent = playerName;
        } else {
            currentPlayerDisplayEl.textContent = 'Not logged in';
        }
    }
    
    // Update avatar display in header
    updateHeaderAvatar();
}

/**
 * Update avatar display in header
 */
function updateHeaderAvatar() {
    const avatarContainer = document.getElementById('player-avatar-container');
    const avatarImg = document.getElementById('player-avatar-img');
    const playerId = currentPlayerId || localStorage.getItem('playerId');
    
    if (!avatarContainer || !avatarImg) return;
    
    if (playerId) {
        // Try to get avatar from localStorage first
        const savedAvatar = localStorage.getItem(`avatar_${playerId}`);
        
        if (savedAvatar) {
            try {
                const avatarData = JSON.parse(savedAvatar);
                avatarImg.src = avatarData.avatarImageUrl;
                avatarContainer.classList.remove('hidden');
            } catch (e) {
                console.error('Error parsing saved avatar:', e);
                avatarContainer.classList.add('hidden');
            }
        } else {
            // Try to load from server
            loadHeaderAvatar(playerId);
        }
    } else {
        avatarContainer.classList.add('hidden');
    }
}

/**
 * Fetch tenant context from API
 */
async function fetchTenantContext() {
    try {
        const response = await fetch('/api/config/tenant');
        const data = await response.json();
        
        if (response.ok && data.success) {
            tenantContext = data.data;
            console.log('Tenant context loaded:', tenantContext);
            return tenantContext;
        } else {
            console.warn('Could not fetch tenant context:', data.message);
            return null;
        }
    } catch (error) {
        console.warn('Error fetching tenant context:', error);
        return null;
    }
}

/**
 * Detect tenant tier from API response
 */
async function detectTenantTier() {
    try {
        const response = await fetch('/api/config/tier');
        const data = await response.json();
        
        if (response.ok && data.success) {
            tenantTier = data.data.tier || 'basic';
            tierConfig = data.data.config || null;
            console.log('Detected tenant tier:', tenantTier);
            updateUIForTier();
        } else {
            console.warn('Could not detect tier, defaulting to basic');
            tenantTier = 'basic';
            updateUIForTier();
        }
    } catch (error) {
        console.warn('Error detecting tier, defaulting to basic:', error);
        tenantTier = 'basic';
        updateUIForTier();
    }
}

/**
 * Update UI based on detected tier
 */
function updateUIForTier() {
    // Show tier badge
    const tierBadge = document.getElementById('tier-badge');
    if (tierBadge) {
        tierBadge.textContent = tenantTier.toUpperCase();
        tierBadge.className = `tier-badge tier-${tenantTier}`;
    }
    
    // Show/hide analytics section
    const analyticsSection = document.getElementById('analytics-section');
    if (analyticsSection) {
        if (tenantTier === 'pro') {
            analyticsSection.classList.remove('hidden');
        } else {
            analyticsSection.classList.add('hidden');
        }
    }
    
    // Show upgrade banner for basic tier
    const upgradeBanner = document.getElementById('upgrade-banner');
    if (upgradeBanner) {
        if (tenantTier === 'basic') {
            upgradeBanner.classList.remove('hidden');
        } else {
            upgradeBanner.classList.add('hidden');
        }
    }
    
    // Update avatar size limit display
    if (tierConfig) {
        const avatarHelpText = document.querySelector('.avatar-upload .help-text');
        if (avatarHelpText) {
            const sizeLimit = tierConfig.avatarSizeLimitMB || (tenantTier === 'pro' ? '5' : '1');
            const formats = tierConfig.allowAnimatedAvatars ? 'JPG, PNG, GIF' : 'JPG, PNG';
            avatarHelpText.textContent = `Max size: ${sizeLimit}MB. Supported: ${formats}`;
        }
    }
    
    // Load analytics dashboard for Pro tier
    if (tenantTier === 'pro') {
        loadAnalyticsDashboard();
    }
    
    console.log('UI updated for tier:', tenantTier);
}

/**
 * Check configuration status and show warnings if using mock data
 */
async function checkConfigurationStatus() {
    try {
        const response = await fetch('/api/config/status');
        const data = await response.json();
        
        if (response.ok && data.success) {
            const warnings = data.data.warnings || [];
            
            if (warnings.length > 0) {
                // Show warnings in the UI
                const warningContainer = document.getElementById('config-warnings');
                if (warningContainer) {
                    warningContainer.innerHTML = '';
                    warnings.forEach(warning => {
                        const warningDiv = document.createElement('div');
                        warningDiv.className = 'warning-message';
                        warningDiv.innerHTML = `⚠️ ${warning}`;
                        warningContainer.appendChild(warningDiv);
                    });
                    warningContainer.classList.remove('hidden');
                }
                
                console.warn('Configuration warnings:', warnings);
            }
        }
    } catch (error) {
        console.warn('Could not check configuration status:', error);
    }
}

/**
 * Initialize the application
 */
async function init() {
    console.log('SaaS Gaming Platform - Client loaded');
    
    // Fetch tenant context first
    await fetchTenantContext();
    
    // Detect tenant tier
    await detectTenantTier();
    
    // Display tenant context in UI
    displayTenantContext();
    
    // Check configuration status
    await checkConfigurationStatus();
    
    // Event listeners for stepper navigation
    nextToAvatarBtn.addEventListener('click', handleNextToAvatar);
    startGameBtn.addEventListener('click', handleStartGame);
    
    // Game play event listeners
    submitGuessBtn.addEventListener('click', handleSubmitGuess);
    guessInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSubmitGuess();
        }
    });
    newGameBtn.addEventListener('click', handleNewGame);
    
    // Switch Player button event listener
    if (switchPlayerBtn) {
        switchPlayerBtn.addEventListener('click', handleSwitchPlayer);
    }
    
    // Initialize avatar selection
    console.log('About to initialize avatar selection...');
    initAvatarSelection();
    console.log('Avatar selection initialized');
    
    // Initialize modal avatar selection
    initModalAvatarSelection();
    
    // Add click handler to avatar in header
    const avatarContainer = document.getElementById('player-avatar-container');
    if (avatarContainer) {
        avatarContainer.addEventListener('click', openChangeAvatarModal);
    }
    
    refreshLeaderboardBtn.addEventListener('click', loadLeaderboard);
    
    // Analytics event listeners
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', exportPlayerData);
    }
    if (loadMoreHistoryBtn) {
        loadMoreHistoryBtn.addEventListener('click', loadMoreGameHistory);
    }
    
    // Load leaderboard on page load
    loadLeaderboard();
    
    // Load player info if available
    const savedPlayerId = localStorage.getItem('playerId');
    const savedPlayerName = localStorage.getItem('playerName');
    
    if (savedPlayerId && savedPlayerName) {
        // User has played before - skip onboarding
        currentPlayerId = savedPlayerId;
        currentPlayerName = savedPlayerName;
        showGamePlay();
        updateHeaderAvatar();
    }
}

/**
 * Generate a random hash with max 4 characters
 */
function generateRandomHash(length = 4) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let hash = '';
    for (let i = 0; i < length; i++) {
        hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return hash;
}

/**
 * Generate Player ID from player name
 */
function generatePlayerId(playerName) {
    const sanitizedName = playerName.trim().replace(/\s+/g, '').toLowerCase();
    const hash = generateRandomHash(4);
    return `${sanitizedName}-${hash}`;
}

/**
 * Handle next to avatar button click (Step 1 -> Step 2)
 */
async function handleNextToAvatar() {
    const playerName = playerNameInput.value.trim();
    
    if (!playerName) {
        showSectionFeedback('onboarding-section', 'Please enter your nickname', 'error');
        return;
    }
    
    // Disable button while checking
    nextToAvatarBtn.disabled = true;
    nextToAvatarBtn.textContent = 'Checking...';
    
    try {
        // Check if nickname already exists
        const checkResponse = await fetch(`/api/player/check-nickname?nickname=${encodeURIComponent(playerName)}`);
        const checkData = await checkResponse.json();
        
        if (!checkResponse.ok) {
            throw new Error(checkData.message || 'Failed to check nickname');
        }
        
        if (checkData.data.exists) {
            showSectionFeedback('onboarding-section', 'This nickname is already taken. Please choose another one.', 'error');
            nextToAvatarBtn.disabled = false;
            nextToAvatarBtn.textContent = 'Next: Choose Avatar';
            return;
        }
        
        // Generate Player ID automatically
        const playerId = generatePlayerId(playerName);
        
        // Save temporarily (not to localStorage yet)
        currentPlayerName = playerName;
        currentPlayerId = playerId;
        
        // Move to step 2
        goToStep(2);
        
    } catch (error) {
        console.error('Error checking nickname:', error);
        showSectionFeedback('onboarding-section', `Error: ${error.message}`, 'error');
    } finally {
        nextToAvatarBtn.disabled = false;
        nextToAvatarBtn.textContent = 'Next: Choose Avatar';
    }
}

/**
 * Navigate to a specific step in the stepper
 */
function goToStep(stepNumber) {
    const steps = document.querySelectorAll('.stepper-step');
    
    steps.forEach((step, index) => {
        const stepNum = index + 1;
        
        if (stepNum < stepNumber) {
            // Previous steps - mark as completed
            step.classList.remove('active');
            step.classList.add('completed');
        } else if (stepNum === stepNumber) {
            // Current step - mark as active
            step.classList.add('active');
            step.classList.remove('completed');
            
            // If step 3, update summary
            if (stepNumber === 3) {
                updateReadySummary();
            }
        } else {
            // Future steps - inactive
            step.classList.remove('active', 'completed');
        }
    });
    
    // Scroll to active step
    const activeStep = document.querySelector('.stepper-step.active');
    if (activeStep) {
        activeStep.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Update the ready summary in step 3
 */
function updateReadySummary() {
    const summaryPlayerName = document.getElementById('summary-player-name');
    const summaryAvatar = document.getElementById('summary-avatar');
    
    if (summaryPlayerName) {
        summaryPlayerName.textContent = currentPlayerName || '-';
    }
    
    if (summaryAvatar) {
        const selectedCard = document.querySelector('.avatar-card.selected');
        if (selectedCard) {
            const avatarLabel = selectedCard.getAttribute('data-label');
            summaryAvatar.textContent = avatarLabel;
        } else {
            summaryAvatar.textContent = 'Not selected';
        }
    }
}

/**
 * Handle start game button click (Step 3 -> Game)
 */
async function handleStartGame() {
    if (!currentPlayerId || !currentPlayerName) {
        showSectionFeedback('onboarding-section', 'Please complete all steps', 'error');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('playerName', currentPlayerName);
    localStorage.setItem('playerId', currentPlayerId);
    
    // Start new game
    await startNewGame(currentPlayerId, currentPlayerName);
}

/**
 * Start a new game via API
 */
async function startNewGame(playerId, playerName) {
    try {
        startGameBtn.disabled = true;
        startGameBtn.textContent = 'Starting...';
        
        const response = await fetch('/api/game/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ playerId, playerName })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to start game');
        }
        
        // Update game state
        currentSessionId = data.data.sessionId;
        guessHistory = [];
        
        // Clear input field
        playerNameInput.value = '';
        
        // Update UI
        renderGameState(data.data);
        showGamePlay();
        showFeedback('Game started! Guess a number between 1 and 100', 'info');
        
        // Update current player display in tenant header
        updateCurrentPlayerDisplay();
        
        // Focus on guess input
        guessInput.focus();
        
        // Load player avatar in header
        updateHeaderAvatar();
        
    } catch (error) {
        console.error('Error starting game:', error);
        showFeedback(`Error: ${error.message}`, 'error');
    } finally {
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Start New Game';
    }
}

/**
 * Handle submit guess button click
 */
async function handleSubmitGuess() {
    const guess = parseInt(guessInput.value);
    
    if (isNaN(guess) || guess < 1 || guess > 100) {
        showFeedback('Please enter a valid number between 1 and 100', 'error');
        return;
    }
    
    if (!currentSessionId) {
        showFeedback('Error: Game is not active, please start a new game', 'error');
        // Highlight the new game button to draw attention
        newGameBtn.classList.add('btn-highlight');
        setTimeout(() => {
            newGameBtn.classList.remove('btn-highlight');
        }, 3000);
        return;
    }
    
    await submitGuess(currentSessionId, guess);
}

/**
 * Submit a guess via API
 */
async function submitGuess(sessionId, guess) {
    try {
        submitGuessBtn.disabled = true;
        guessInput.disabled = true;
        
        const response = await fetch('/api/game/move', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId, guess })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            // Check if it's a duplicate guess error
            if (data.message && data.message.includes('already guessed')) {
                showFeedback(`⚠️ ${data.message}`, 'warning');
                guessInput.value = '';
                submitGuessBtn.disabled = false;
                guessInput.disabled = false;
                guessInput.focus();
                return;
            }
            throw new Error(data.message || 'Failed to submit guess');
        }
        
        const result = data.data;
        
        // Add to guess history
        guessHistory.push({
            guess,
            result: result.result
        });
        
        // Update UI
        updateGameInfo(result.score, result.guessesRemaining);
        renderGuessHistory();
        
        // Show feedback based on result
        if (result.result === 'correct') {
            showFeedback(`🎉 Correct! You won with a score of ${result.score}!`, 'success');
            endGame(true);
        } else if (result.result === 'game_over') {
            showFeedback('😢 Game Over! You ran out of guesses.', 'error');
            endGame(false);
        } else if (result.result === 'too_high') {
            showFeedback(`📉 Too high! Try a lower number. (${result.guessesRemaining} guesses left)`, 'warning');
        } else if (result.result === 'too_low') {
            showFeedback(`📈 Too low! Try a higher number. (${result.guessesRemaining} guesses left)`, 'warning');
        }
        
        // Clear input
        guessInput.value = '';
        
    } catch (error) {
        console.error('Error submitting guess:', error);
        showFeedback(`Error: ${error.message}`, 'error');
    } finally {
        submitGuessBtn.disabled = false;
        guessInput.disabled = false;
        guessInput.focus();
    }
}

/**
 * Handle new game button click
 */
function handleNewGame() {
    if (currentPlayerId && currentPlayerName) {
        startNewGame(currentPlayerId, currentPlayerName);
    } else {
        showOnboarding();
    }
}

/**
 * Handle switch player button click
 */
function handleSwitchPlayer() {
    console.log('Switch player clicked');
    
    // Clear current session
    currentSessionId = null;
    currentPlayerId = null;
    currentPlayerName = null;
    guessHistory = [];
    
    // Clear localStorage
    localStorage.removeItem('playerId');
    localStorage.removeItem('playerName');
    
    // Reset avatar selection UI - show all avatars again
    const container = document.querySelector('.avatar-selection-container');
    if (container) {
        container.classList.remove('confirmed');
    }
    
    document.querySelectorAll('.avatar-card').forEach(card => {
        card.classList.remove('selected');
        card.classList.remove('unselected');
    });
    
    // Reset confirm button
    const confirmBtn = document.getElementById('confirm-avatar-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.remove('loading', 'success');
        confirmBtn.querySelector('.btn-text').textContent = 'Confirm Avatar';
        confirmBtn.querySelector('.btn-text').style.display = 'inline';
        confirmBtn.querySelector('.btn-spinner').classList.add('hidden');
        confirmBtn.querySelector('.btn-success').classList.add('hidden');
    }
    
    // Hide avatar status message
    const statusDiv = document.getElementById('avatar-status');
    if (statusDiv) {
        statusDiv.classList.add('hidden');
    }
    
    // Clear player input field to allow new player entry
    playerNameInput.value = '';
    
    // Show onboarding stepper
    showOnboarding();
    
    // Update current player display in tenant header
    updateCurrentPlayerDisplay();
    
    // Show feedback
    showFeedback('Player session cleared. Please enter your details to continue.', 'info');
    
    console.log('Player switched - session cleared, avatar reset, tenant context preserved');
}

/**
 * End the game
 */
function endGame(won) {
    submitGuessBtn.disabled = true;
    guessInput.disabled = true;
    
    // Reload leaderboard
    setTimeout(() => {
        loadLeaderboard();
    }, 1000);
}

/**
 * Render game state
 */
function renderGameState(gameState) {
    currentPlayerSpan.textContent = gameState.playerName;
    currentScoreSpan.textContent = gameState.score;
    guessesRemainingSpan.textContent = gameState.guessesRemaining;
    
    // Enable/disable inputs based on game status
    if (gameState.status === 'active') {
        submitGuessBtn.disabled = false;
        guessInput.disabled = false;
    } else {
        submitGuessBtn.disabled = true;
        guessInput.disabled = true;
    }
}

/**
 * Update game info display
 */
function updateGameInfo(score, guessesRemaining) {
    currentScoreSpan.textContent = score;
    guessesRemainingSpan.textContent = guessesRemaining;
}

/**
 * Render guess history
 */
function renderGuessHistory() {
    guessList.innerHTML = '';
    
    guessHistory.forEach(item => {
        const guessItem = document.createElement('div');
        guessItem.className = `guess-item ${item.result.replace('_', '-')}`;
        guessItem.textContent = item.guess;
        guessList.appendChild(guessItem);
    });
}

/**
 * Show feedback message in a specific section
 * @param {string} sectionId - ID of the section to show feedback in
 * @param {string} message - Feedback message
 * @param {string} type - Type of feedback (success, error, warning, info)
 * @param {number} duration - Auto-hide duration in ms (0 = don't auto-hide)
 */
function showSectionFeedback(sectionId, message, type = 'info', duration = 5000) {
    const section = document.getElementById(sectionId);
    if (!section) {
        console.warn(`Section ${sectionId} not found`);
        return;
    }
    
    // Remove any existing feedback in this section
    const existingFeedback = section.querySelector('.section-feedback');
    if (existingFeedback) {
        existingFeedback.remove();
    }
    
    // Create new feedback element
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = `section-feedback feedback-${type}`;
    feedbackDiv.innerHTML = `
        <span class="feedback-icon">${getIconForType(type)}</span>
        <span class="feedback-text">${message}</span>
        <button class="feedback-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    // Insert at the top of the section
    section.insertBefore(feedbackDiv, section.firstChild);
    
    // Auto-hide after duration
    if (duration > 0) {
        setTimeout(() => {
            if (feedbackDiv.parentElement) {
                feedbackDiv.classList.add('fade-out');
                setTimeout(() => feedbackDiv.remove(), 300);
            }
        }, duration);
    }
}

/**
 * Get icon for feedback type
 */
function getIconForType(type) {
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    return icons[type] || icons.info;
}

/**
 * Show feedback message (legacy - for game play section)
 */
function showFeedback(message, type = 'info') {
    feedbackMessage.textContent = message;
    feedbackMessage.className = `feedback-message ${type}`;
}

/**
 * Show game play section
 */
function showGamePlay() {
    onboardingSection.classList.add('hidden');
    gamePlaySection.classList.remove('hidden');
}

/**
 * Show onboarding section (stepper)
 */
function showOnboarding() {
    onboardingSection.classList.remove('hidden');
    gamePlaySection.classList.add('hidden');
    guessHistory = [];
    guessList.innerHTML = '';
    feedbackMessage.textContent = '';
    guessInput.value = '';
    
    // Reset to step 1
    goToStep(1);
}

/**
 * Load and display player's selected avatar in header
 */
async function loadHeaderAvatar(playerId) {
    try {
        const response = await fetch(`/api/player/avatar/${playerId}`);
        
        if (response.ok) {
            const data = await response.json();
            const avatarContainer = document.getElementById('player-avatar-container');
            const avatarImg = document.getElementById('player-avatar-img');
            
            if (avatarContainer && avatarImg && data.data && data.data.avatarId) {
                // Get the avatar image URL based on avatarId
                const avatarUrls = {
                    'avatar1': 'https://api.dicebear.com/9.x/adventurer/svg?seed=warrior',
                    'avatar2': 'https://api.dicebear.com/9.x/adventurer/svg?seed=shadow',
                    'avatar3': 'https://api.dicebear.com/9.x/adventurer/svg?seed=phoenix',
                    'avatar4': 'https://api.dicebear.com/9.x/adventurer/svg?seed=dragon'
                };
                
                avatarImg.src = avatarUrls[data.data.avatarId] || avatarUrls['avatar1'];
                avatarContainer.classList.remove('hidden');
            }
        } else if (response.status === 404) {
            // No avatar selected yet
            console.log('No avatar selected yet for player:', playerId);
        }
    } catch (error) {
        console.error('Error loading header avatar:', error);
    }
}

/**
 * Show avatar status message
 */
function showAvatarStatus(message, type = 'info') {
    const statusDiv = document.getElementById('avatar-status');
    if (!statusDiv) return;
    
    // Add icon based on type
    let icon = '';
    if (type === 'success') icon = '✓ ';
    if (type === 'error') icon = '✗ ';
    if (type === 'info') icon = 'ℹ️ ';
    
    statusDiv.textContent = icon + message;
    statusDiv.className = `avatar-status ${type}`;
    statusDiv.classList.remove('hidden');
    
    // Scroll to status message
    statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 5000);
    }
}

/**
 * Initialize avatar selection event listeners
 */
function initAvatarSelection() {
    const avatarCards = document.querySelectorAll('.avatar-card');
    const confirmBtn = document.getElementById('confirm-avatar-btn');
    let selectedAvatarId = null;
    
    console.log('Initializing avatar selection, found cards:', avatarCards.length);
    
    // Add click handlers to avatar cards
    avatarCards.forEach(card => {
        card.addEventListener('click', () => {
            const avatarId = card.getAttribute('data-avatar');
            console.log('Avatar card clicked:', avatarId);
            
            // Update selected state
            selectedAvatarId = avatarId;
            
            // Update UI - remove all selections first
            avatarCards.forEach(c => {
                c.classList.remove('selected');
                c.classList.add('unselected');
            });
            
            // Mark clicked card as selected
            card.classList.remove('unselected');
            card.classList.add('selected');
            
            // Enable confirm button
            if (confirmBtn) {
                confirmBtn.disabled = false;
            }
        });
    });
    
    // Add click handler to confirm button
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!selectedAvatarId) {
                showAvatarStatus('Please select an avatar first', 'error');
                return;
            }
            
            await confirmAvatarSelection(selectedAvatarId, confirmBtn);
        });
    }
}

/**
 * Confirm and upload avatar selection to S3
 */
async function confirmAvatarSelection(avatarId, button) {
    const playerId = currentPlayerId;
    
    if (!playerId) {
        showAvatarStatus('Please enter your name first (Step 1)', 'error');
        return;
    }
    
    // Check if this is a "Change Avatar" action
    const isChanging = button.querySelector('.btn-text').textContent === 'Change Avatar';
    
    if (isChanging) {
        // Show all avatars again for selection
        const container = document.querySelector('.avatar-selection-container');
        if (container) {
            container.classList.remove('confirmed');
        }
        
        // Reset button text
        button.querySelector('.btn-text').textContent = 'Confirm Avatar';
        button.disabled = true;
        
        // Clear selection
        document.querySelectorAll('.avatar-card').forEach(card => {
            card.classList.remove('selected', 'unselected');
        });
        
        return;
    }
    
    try {
        // Hide unselected avatars when confirm is clicked
        const container = document.querySelector('.avatar-selection-container');
        if (container) {
            container.classList.add('confirmed');
        }
        
        // Update button to loading state
        button.disabled = true;
        button.classList.add('loading');
        button.querySelector('.btn-text').style.display = 'none';
        button.querySelector('.btn-spinner').classList.remove('hidden');
        
        // Get the selected avatar image URL
        const selectedCard = document.querySelector(`[data-avatar="${avatarId}"]`);
        const avatarLabel = selectedCard.getAttribute('data-label');
        const avatarImageUrl = selectedCard.querySelector('.avatar-card-image').src;
        
        console.log('Uploading avatar:', { avatarId, avatarLabel, playerId });
        
        // Prepare avatar data for backend
        const avatarData = {
            playerId: playerId,
            avatarId: avatarId
        };
        
        // Upload to S3 via backend API
        const response = await fetch('/api/player/avatar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(avatarData)
        });
        
        const data = await response.json();
        console.log('Avatar upload response:', data);
        
        if (!response.ok) {
            // Remove confirmed class on error
            if (container) {
                container.classList.remove('confirmed');
            }
            throw new Error(data.message || 'Failed to save avatar');
        }
        
        // Always store avatar selection in localStorage for display
        localStorage.setItem(`avatar_${playerId}`, JSON.stringify({
            avatarId: avatarId,
            avatarLabel: avatarLabel,
            avatarImageUrl: avatarImageUrl,
            timestamp: Date.now()
        }));
        console.log('Avatar saved to localStorage');
        
        // Success state
        button.classList.remove('loading');
        button.classList.add('success');
        button.querySelector('.btn-spinner').classList.add('hidden');
        button.querySelector('.btn-success').classList.remove('hidden');
        
        // Show success message
        showAvatarStatus('Avatar saved successfully! 🎉', 'success');
        
        // Update header avatar
        updateHeaderAvatar();
        
        // Move to step 3 after 1 second (don't show "Change Avatar" button)
        setTimeout(() => {
            goToStep(3);
        }, 1000);
        
    } catch (error) {
        console.error('Error uploading avatar:', error);
        
        // Error state
        button.classList.remove('loading');
        button.querySelector('.btn-spinner').classList.add('hidden');
        button.querySelector('.btn-text').style.display = 'inline';
        button.disabled = false;
        
        // Show error with retry option
        showAvatarStatus(
            `Failed to save avatar: ${error.message}. Please try again.`,
            'error'
        );
    }
}

/**
 * Load leaderboard
 */
async function loadLeaderboard() {
    try {
        leaderboardContainer.innerHTML = '<div class="loading">Loading leaderboard...</div>';
        
        // Use tier-specific limit
        const limit = tierConfig ? tierConfig.leaderboardLimit : 10;
        const response = await fetch(`/api/game/leaderboard?limit=${limit}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to load leaderboard');
        }
        
        renderLeaderboard(data.data, data.meta);
        
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        leaderboardContainer.innerHTML = `<div class="error-message">Error loading leaderboard: ${error.message}</div>`;
    }
}

/**
 * Render leaderboard
 */
function renderLeaderboard(players, meta) {
    // Update leaderboard title with tenant name
    const leaderboardTitle = document.getElementById('leaderboard-title');
    if (leaderboardTitle && tenantContext) {
        const limit = meta ? meta.limit : (tierConfig ? tierConfig.leaderboardLimit : 10);
        leaderboardTitle.textContent = `🏆 Top ${limit} Players - ${tenantContext.tenantName}`;
    }
    
    if (players.length === 0) {
        leaderboardContainer.innerHTML = '<div class="loading">No players yet. Be the first!</div>';
        return;
    }
    
    const container = document.createElement('div');
    
    // Show tier-specific limit info
    if (meta) {
        const limitInfo = document.createElement('div');
        limitInfo.className = 'leaderboard-info';
        limitInfo.innerHTML = `
            <p>Showing top ${meta.limit} players${meta.tier === 'basic' ? ' (Basic tier)' : ' (Pro tier)'}</p>
        `;
        container.appendChild(limitInfo);
        
        // Show upgrade message for Basic tier
        if (meta.tier === 'basic') {
            const upgradeMessage = document.createElement('div');
            upgradeMessage.className = 'upgrade-message';
            upgradeMessage.innerHTML = `
                <p>🌟 Want to see more? <strong>Upgrade to Pro</strong> to view the top 10 players!</p>
            `;
            container.appendChild(upgradeMessage);
        }
    }
    
    const table = document.createElement('table');
    table.className = 'leaderboard-table';
    
    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>High Score</th>
            <th>Games</th>
            <th>Wins</th>
            <th>Win Rate</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Body
    const tbody = document.createElement('tbody');
    players.forEach((player, index) => {
        const rank = index + 1;
        const winRate = player.totalGames > 0 
            ? Math.round((player.totalWins / player.totalGames) * 100) 
            : 0;
        
        let rankClass = 'leaderboard-rank';
        if (rank === 1) rankClass += ' gold';
        else if (rank === 2) rankClass += ' silver';
        else if (rank === 3) rankClass += ' bronze';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="${rankClass}">${rank}</span></td>
            <td>${escapeHtml(player.playerName)}</td>
            <td>${player.highScore}</td>
            <td>${player.totalGames}</td>
            <td>${player.totalWins}</td>
            <td>${winRate}%</td>
        `;
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    container.appendChild(table);
    leaderboardContainer.innerHTML = '';
    leaderboardContainer.appendChild(container);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Load analytics dashboard data
 */
async function loadAnalyticsDashboard() {
    if (tenantTier !== 'pro') {
        return;
    }
    
    // Update analytics title with tenant name
    const analyticsTitle = document.getElementById('analytics-title');
    if (analyticsTitle && tenantContext) {
        analyticsTitle.textContent = `📊 Analytics Dashboard - ${tenantContext.tenantName}`;
    }
    
    const playerId = currentPlayerId || localStorage.getItem('playerId');
    if (!playerId) {
        console.log('No player ID available for analytics');
        return;
    }
    
    try {
        // Load overview
        const overviewResponse = await fetch(`/api/analytics/overview?playerId=${playerId}`);
        
        if (overviewResponse.ok) {
            const overviewData = await overviewResponse.json();
            renderAnalyticsOverview(overviewData.data);
        } else if (overviewResponse.status === 403) {
            console.log('Analytics not available for this tier');
            return;
        }
        
        // Load trends
        const trendsResponse = await fetch(`/api/analytics/trends?playerId=${playerId}&days=30`);
        
        if (trendsResponse.ok) {
            const trendsData = await trendsResponse.json();
            renderWinRateTrend(trendsData.data);
        }
        
        // Load history
        currentHistoryOffset = 0;
        const historyResponse = await fetch(`/api/analytics/history?playerId=${playerId}&limit=10&offset=0`);
        
        if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            renderGameHistory(historyData.data);
        }
        
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

/**
 * Render analytics overview
 */
function renderAnalyticsOverview(data) {
    const winRateEl = document.getElementById('win-rate');
    const avgGuessesEl = document.getElementById('avg-guesses');
    const currentStreakEl = document.getElementById('current-streak');
    const bestStreakEl = document.getElementById('best-streak');
    
    if (winRateEl) winRateEl.textContent = `${data.winRate.toFixed(1)}%`;
    if (avgGuessesEl) avgGuessesEl.textContent = data.averageGuesses.toFixed(1);
    if (currentStreakEl) currentStreakEl.textContent = data.currentStreak;
    if (bestStreakEl) bestStreakEl.textContent = data.bestStreak;
}

/**
 * Render win rate trend chart using Chart.js
 */
function renderWinRateTrend(trends) {
    const ctx = document.getElementById('win-rate-chart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (winRateChart) {
        winRateChart.destroy();
    }
    
    // Handle empty data
    if (!trends || trends.length === 0) {
        ctx.parentElement.innerHTML = '<p class="no-data-message">Not enough data yet. Play more games to see trends!</p>';
        return;
    }
    
    winRateChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trends.map(t => t.date),
            datasets: [{
                label: 'Win Rate (%)',
                data: trends.map(t => t.winRate),
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Win Rate: ' + context.parsed.y.toFixed(1) + '%';
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render score distribution chart
 */
function renderScoreDistribution(games) {
    const ctx = document.getElementById('score-distribution-chart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (scoreDistributionChart) {
        scoreDistributionChart.destroy();
    }
    
    // Handle empty data
    if (!games || games.length === 0) {
        ctx.parentElement.innerHTML = '<p class="no-data-message">Not enough data yet. Play more games to see distribution!</p>';
        return;
    }
    
    // Calculate score distribution
    const scoreBuckets = {
        '0-20': 0,
        '21-40': 0,
        '41-60': 0,
        '61-80': 0,
        '81-100': 0
    };
    
    games.forEach(game => {
        const score = game.score;
        if (score <= 20) scoreBuckets['0-20']++;
        else if (score <= 40) scoreBuckets['21-40']++;
        else if (score <= 60) scoreBuckets['41-60']++;
        else if (score <= 80) scoreBuckets['61-80']++;
        else scoreBuckets['81-100']++;
    });
    
    scoreDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(scoreBuckets),
            datasets: [{
                label: 'Number of Games',
                data: Object.values(scoreBuckets),
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(255, 159, 64, 0.7)',
                    'rgba(255, 205, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(54, 162, 235, 0.7)'
                ],
                borderColor: [
                    'rgb(255, 99, 132)',
                    'rgb(255, 159, 64)',
                    'rgb(255, 205, 86)',
                    'rgb(75, 192, 192)',
                    'rgb(54, 162, 235)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Games: ' + context.parsed.y;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render game history
 */
function renderGameHistory(data) {
    const container = document.getElementById('game-history-table');
    if (!container) return;
    
    const { games, total } = data;
    
    if (!games || games.length === 0) {
        container.innerHTML = '<p class="no-data-message">No game history yet. Start playing to see your history!</p>';
        if (loadMoreHistoryBtn) loadMoreHistoryBtn.classList.add('hidden');
        return;
    }
    
    // Render score distribution chart with all games
    renderScoreDistribution(games);
    
    const table = document.createElement('table');
    table.className = 'history-table';
    
    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Date</th>
            <th>Result</th>
            <th>Score</th>
            <th>Guesses</th>
            <th>Target</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Body
    const tbody = document.createElement('tbody');
    games.forEach(game => {
        const date = new Date(game.playedAt).toLocaleDateString();
        const time = new Date(game.playedAt).toLocaleTimeString();
        const statusClass = game.status === 'won' ? 'status-won' : 'status-lost';
        const statusText = game.status === 'won' ? '✓ Won' : '✗ Lost';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="date-time">
                    <div>${date}</div>
                    <div class="time">${time}</div>
                </div>
            </td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${game.score}</td>
            <td>${game.guesses}</td>
            <td>${game.targetNumber}</td>
        `;
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    container.innerHTML = '';
    container.appendChild(table);
    
    // Show/hide load more button
    if (loadMoreHistoryBtn) {
        if (currentHistoryOffset + games.length < total) {
            loadMoreHistoryBtn.classList.remove('hidden');
        } else {
            loadMoreHistoryBtn.classList.add('hidden');
        }
    }
}

/**
 * Load more game history
 */
async function loadMoreGameHistory() {
    const playerId = currentPlayerId || localStorage.getItem('playerId');
    if (!playerId) return;
    
    try {
        currentHistoryOffset += 10;
        
        const response = await fetch(`/api/analytics/history?playerId=${playerId}&limit=10&offset=${currentHistoryOffset}`);
        
        if (response.ok) {
            const data = await response.json();
            appendGameHistory(data.data);
        }
    } catch (error) {
        console.error('Error loading more history:', error);
    }
}

/**
 * Append more games to history table
 */
function appendGameHistory(data) {
    const container = document.getElementById('game-history-table');
    if (!container) return;
    
    const { games, total } = data;
    if (!games || games.length === 0) return;
    
    const table = container.querySelector('.history-table');
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    
    games.forEach(game => {
        const date = new Date(game.playedAt).toLocaleDateString();
        const time = new Date(game.playedAt).toLocaleTimeString();
        const statusClass = game.status === 'won' ? 'status-won' : 'status-lost';
        const statusText = game.status === 'won' ? '✓ Won' : '✗ Lost';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="date-time">
                    <div>${date}</div>
                    <div class="time">${time}</div>
                </div>
            </td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${game.score}</td>
            <td>${game.guesses}</td>
            <td>${game.targetNumber}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Update load more button visibility
    if (loadMoreHistoryBtn) {
        if (currentHistoryOffset + games.length < total) {
            loadMoreHistoryBtn.classList.remove('hidden');
        } else {
            loadMoreHistoryBtn.classList.add('hidden');
        }
    }
}

/**
 * Export player data
 */
async function exportPlayerData() {
    const playerId = currentPlayerId || localStorage.getItem('playerId');
    if (!playerId) {
        showFeedback('Please log in first', 'error');
        return;
    }
    
    try {
        exportDataBtn.disabled = true;
        exportDataBtn.textContent = '📥 Exporting...';
        
        const response = await fetch(`/api/analytics/export?playerId=${playerId}`);
        
        if (!response.ok) {
            if (response.status === 403) {
                showFeedback('Export feature is only available for Pro tier', 'error');
                return;
            }
            throw new Error('Export failed');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `player-${playerId}-data.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showFeedback('Data exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        showFeedback('Failed to export data', 'error');
    } finally {
        exportDataBtn.disabled = false;
        exportDataBtn.textContent = '📥 Export My Data (JSON)';
    }
}

/**
 * Show upgrade modal (placeholder for task 9)
 */
function showUpgradeModal() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
        
        // Log upgrade interest event
        console.log('Upgrade modal shown', {
            timestamp: new Date().toISOString(),
            currentTier: tenantTier,
            playerId: currentPlayerId || localStorage.getItem('playerId')
        });
    }
}

/**
 * Close upgrade modal
 */
function closeUpgradeModal() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.add('hidden');
        
        // Log modal close event
        console.log('Upgrade modal closed', {
            timestamp: new Date().toISOString(),
            currentTier: tenantTier
        });
    }
}

/**
 * Open change avatar modal
 */
function openChangeAvatarModal() {
    const modal = document.getElementById('change-avatar-modal');
    if (!modal) return;
    
    // Reset modal state
    const container = modal.querySelector('.avatar-selection-container');
    if (container) {
        container.classList.remove('confirmed');
    }
    
    // Clear all selections
    modal.querySelectorAll('.modal-avatar-card').forEach(card => {
        card.classList.remove('selected', 'unselected');
    });
    
    // Reset confirm button
    const confirmBtn = document.getElementById('modal-confirm-avatar-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.remove('loading', 'success');
        confirmBtn.querySelector('.btn-text').textContent = 'Confirm Avatar';
        confirmBtn.querySelector('.btn-text').style.display = 'inline';
        confirmBtn.querySelector('.btn-spinner').classList.add('hidden');
        confirmBtn.querySelector('.btn-success').classList.add('hidden');
    }
    
    // Hide status message
    const statusDiv = document.getElementById('modal-avatar-status');
    if (statusDiv) {
        statusDiv.classList.add('hidden');
    }
    
    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

/**
 * Close change avatar modal
 */
function closeChangeAvatarModal() {
    const modal = document.getElementById('change-avatar-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.add('hidden');
    }
}

/**
 * Initialize modal avatar selection
 */
function initModalAvatarSelection() {
    const avatarCards = document.querySelectorAll('.modal-avatar-card');
    const confirmBtn = document.getElementById('modal-confirm-avatar-btn');
    let selectedAvatarId = null;
    
    console.log('Initializing modal avatar selection, found cards:', avatarCards.length);
    
    // Add click handlers to avatar cards
    avatarCards.forEach(card => {
        card.addEventListener('click', () => {
            const avatarId = card.getAttribute('data-avatar');
            console.log('Modal avatar card clicked:', avatarId);
            
            // Update selected state
            selectedAvatarId = avatarId;
            
            // Update UI - remove all selections first
            avatarCards.forEach(c => {
                c.classList.remove('selected');
                c.classList.add('unselected');
            });
            
            // Mark clicked card as selected
            card.classList.remove('unselected');
            card.classList.add('selected');
            
            // Enable confirm button
            if (confirmBtn) {
                confirmBtn.disabled = false;
            }
        });
    });
    
    // Add click handler to confirm button
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!selectedAvatarId) {
                showModalAvatarStatus('Please select an avatar first', 'error');
                return;
            }
            
            await confirmModalAvatarSelection(selectedAvatarId, confirmBtn);
        });
    }
}

/**
 * Confirm avatar selection from modal
 */
async function confirmModalAvatarSelection(avatarId, button) {
    const playerId = currentPlayerId || localStorage.getItem('playerId');
    
    if (!playerId) {
        showModalAvatarStatus('Player not found', 'error');
        return;
    }
    
    try {
        // Hide unselected avatars when confirm is clicked
        const container = document.querySelector('#change-avatar-modal .avatar-selection-container');
        if (container) {
            container.classList.add('confirmed');
        }
        
        // Update button to loading state
        button.disabled = true;
        button.classList.add('loading');
        button.querySelector('.btn-text').style.display = 'none';
        button.querySelector('.btn-spinner').classList.remove('hidden');
        
        // Get the selected avatar image URL
        const selectedCard = document.querySelector(`#change-avatar-modal [data-avatar="${avatarId}"]`);
        const avatarLabel = selectedCard.getAttribute('data-label');
        const avatarImageUrl = selectedCard.querySelector('.avatar-card-image').src;
        
        console.log('Uploading avatar from modal:', { avatarId, avatarLabel, playerId });
        
        // Prepare avatar data for backend
        const avatarData = {
            playerId: playerId,
            avatarId: avatarId
        };
        
        // Upload to S3 via backend API
        const response = await fetch('/api/player/avatar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(avatarData)
        });
        
        const data = await response.json();
        console.log('Avatar upload response from modal:', data);
        
        if (!response.ok) {
            // Remove confirmed class on error
            if (container) {
                container.classList.remove('confirmed');
            }
            throw new Error(data.message || 'Failed to save avatar');
        }
        
        // Always store avatar selection in localStorage for display
        localStorage.setItem(`avatar_${playerId}`, JSON.stringify({
            avatarId: avatarId,
            avatarLabel: avatarLabel,
            avatarImageUrl: avatarImageUrl,
            timestamp: Date.now()
        }));
        console.log('Avatar saved to localStorage');
        
        // Success state
        button.classList.remove('loading');
        button.classList.add('success');
        button.querySelector('.btn-spinner').classList.add('hidden');
        button.querySelector('.btn-success').classList.remove('hidden');
        
        // Show success message
        showModalAvatarStatus('Avatar changed successfully! 🎉', 'success');
        
        // Update header avatar
        updateHeaderAvatar();
        
        // Close modal after 1.5 seconds
        setTimeout(() => {
            closeChangeAvatarModal();
        }, 1500);
        
    } catch (error) {
        console.error('Error uploading avatar from modal:', error);
        
        // Error state
        button.classList.remove('loading');
        button.querySelector('.btn-spinner').classList.add('hidden');
        button.querySelector('.btn-text').style.display = 'inline';
        button.disabled = false;
        
        // Show error with retry option
        showModalAvatarStatus(
            `Failed to save avatar: ${error.message}. Please try again.`,
            'error'
        );
    }
}

/**
 * Show avatar status message in modal
 */
function showModalAvatarStatus(message, type = 'info') {
    const statusDiv = document.getElementById('modal-avatar-status');
    if (!statusDiv) return;
    
    // Add icon based on type
    let icon = '';
    if (type === 'success') icon = '✓ ';
    if (type === 'error') icon = '✗ ';
    if (type === 'info') icon = 'ℹ️ ';
    
    statusDiv.textContent = icon + message;
    statusDiv.className = `avatar-status ${type}`;
    statusDiv.classList.remove('hidden');
    
    // Scroll to status message
    statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 5000);
    }
}

/**
 * Handle upgrade interest (Contact Sales button)
 */
function handleUpgradeInterest() {
    const playerId = currentPlayerId || localStorage.getItem('playerId');
    const playerName = currentPlayerName || localStorage.getItem('playerName');
    
    // Log upgrade interest event
    console.log('Upgrade interest logged', {
        timestamp: new Date().toISOString(),
        currentTier: tenantTier,
        playerId: playerId,
        playerName: playerName,
        action: 'contact_sales_clicked'
    });
    
    // Show feedback to user
    showFeedback('Thank you for your interest! Our sales team will contact you soon.', 'success');
    
    // Close modal
    closeUpgradeModal();
    
    // In a real application, this would send data to a backend endpoint
    // to track upgrade interest and trigger sales team notification
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);

// Close modal when clicking outside of it
document.addEventListener('click', (event) => {
    const modal = document.getElementById('upgrade-modal');
    if (modal && event.target === modal) {
        closeUpgradeModal();
    }
});
