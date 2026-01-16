/**
 * LP Tracker Frontend Application
 *
 * This file contains the main frontend logic for the LP Tracker app.
 * It handles player data management, chart rendering, and UI interactions.
 *
 * @fileoverview Main frontend application for League LP tracking
 */

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

/** @type {Array<Player>} All tracked players with their data */
let players = [];

/** @type {Chart|null} Main Chart.js instance */
let chart = null;

/** @type {Set<number>} Indices of currently selected/filtered players */
let selectedPlayers = new Set();

/** @type {Date|null} Last data refresh timestamp */
let lastUpdated = null;

/** @type {number|null} Auto-refresh interval ID */
let autoRefreshInterval = null;

/** @type {number} Auto-refresh interval in milliseconds (5 minutes) */
const AUTO_REFRESH_MS = 5 * 60 * 1000;

/** @type {number} Number of data points visible in timeline view */
const VISIBLE_POINTS = 20;

/** @type {Array<string>} All timestamps for timeline slider */
let allTimestamps = [];

/** @type {boolean} Whether showing overview (all data) vs timeline view */
let overviewMode = true;

// Detail View State
/** @type {Chart|null} Detail view Chart.js instance */
let detailChart = null;

/** @type {Player|null} Currently displayed player in detail view */
let currentDetailPlayer = null;

/** @type {Map<string, Array>} Cache of match data per player key */
let playerMatchCache = new Map();

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * List of tracked players.
 * Each player object contains their Riot ID and region.
 *
 * @type {Array<{gameName: string, tagLine: string, region: string}>}
 */
const TRACKED_PLAYERS = [
  { gameName: 'i am sad haha', tagLine: 'NA1', region: 'NA' },
  { gameName: 'xty', tagLine: '001', region: 'NA' },
  { gameName: 'TwoWeekTimeout', tagLine: 'NA1', region: 'NA' },
  { gameName: 'Tortle', tagLine: 'Druid', region: 'NA' },
  { gameName: 'Keebles', tagLine: '6969', region: 'NA' },
  { gameName: 'Cedric Dube', tagLine: '420', region: 'NA' },
  { gameName: 'Humble White Boy', tagLine: '666', region: 'NA' },
  { gameName: 'Bugz', tagLine: '0627', region: 'NA' },
];

/**
 * Rank tier values for LP calculation.
 * Base LP is the minimum LP for that tier (from Iron IV = 0).
 *
 * @type {Object.<string, {base: number, order: number}>}
 */
const RANK_VALUES = {
  IRON: { base: 0, order: 0 },
  BRONZE: { base: 400, order: 1 },
  SILVER: { base: 800, order: 2 },
  GOLD: { base: 1200, order: 3 },
  PLATINUM: { base: 1600, order: 4 },
  EMERALD: { base: 2000, order: 5 },
  DIAMOND: { base: 2400, order: 6 },
  MASTER: { base: 2800, order: 7 },
  GRANDMASTER: { base: 3200, order: 8 },
  CHALLENGER: { base: 3600, order: 9 },
};

/**
 * Division values for LP calculation within a tier.
 * @type {Object.<string, number>}
 */
const DIVISION_VALUES = { IV: 0, III: 100, II: 200, I: 300 };

// =============================================================================
// LP CALCULATION FUNCTIONS
// =============================================================================

/**
 * Converts a rank (tier, division, LP) to a single total LP value.
 * Used for graphing players on the same scale.
 *
 * @param {string} tier - Rank tier (e.g., 'GOLD', 'PLATINUM')
 * @param {string} rank - Division within tier (e.g., 'I', 'II', 'III', 'IV')
 * @param {number} lp - League points within the division (0-99)
 * @returns {number} Total LP from Iron IV (0)
 *
 * @example
 * rankToTotalLP('GOLD', 'IV', 50) // Returns 1250 (1200 base + 0 division + 50 LP)
 * rankToTotalLP('MASTER', '', 100) // Returns 2900 (2800 base + 100 LP)
 */
function rankToTotalLP(tier, rank, lp) {
  if (!tier || !RANK_VALUES[tier]) return 0;
  if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
    return RANK_VALUES[tier].base + lp;
  }
  return RANK_VALUES[tier].base + (DIVISION_VALUES[rank] || 0) + lp;
}

/**
 * Converts a total LP value back to a readable rank object.
 * Inverse of rankToTotalLP().
 *
 * @param {number} totalLP - Total LP from Iron IV (0)
 * @returns {{tier: string, division: string, lp: number}} Rank object
 *
 * @example
 * totalLPToRank(1250) // Returns { tier: 'Gold', division: 'IV', lp: 50 }
 * totalLPToRank(2900) // Returns { tier: 'Master', division: '', lp: 100 }
 */
function totalLPToRank(totalLP) {
  if (totalLP >= 3600) return { tier: 'Challenger', division: '', lp: totalLP - 3600 };
  if (totalLP >= 3200) return { tier: 'Grandmaster', division: '', lp: totalLP - 3200 };
  if (totalLP >= 2800) return { tier: 'Master', division: '', lp: totalLP - 2800 };

  const tiers = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond'];
  const divisions = ['IV', 'III', 'II', 'I'];

  const tierIndex = Math.floor(totalLP / 400);
  const tierLP = totalLP % 400;
  const divIndex = Math.floor(tierLP / 100);
  const lp = tierLP % 100;

  return {
    tier: tiers[tierIndex] || 'Iron',
    division: divisions[divIndex] || 'IV',
    lp: lp,
  };
}

/**
 * Colorblind-friendly color palette for player chart lines.
 * Based on Wong palette, distinguishable for deuteranopia, protanopia, and tritanopia.
 *
 * @type {Array<string>}
 */
const PLAYER_COLORS = [
  '#0077BB', // Strong Blue
  '#EE7733', // Orange
  '#009988', // Teal
  '#CC3311', // Vermillion Red
  '#EE3377', // Magenta
  '#AA3377', // Purple
  '#BBBB00', // Olive/Yellow
  '#332288', // Indigo
  '#66CC33', // Lime Green
  '#882255', // Wine
];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  loadLastUpdated();
  initChart();

  // Try to load from database first, then fallback to localStorage/preloaded
  await loadPlayersFromDatabase();

  if (players.length === 0) {
    loadPlayersFromStorage();
  }

  if (players.length === 0 && typeof PRELOADED_PLAYERS !== 'undefined') {
    players = JSON.parse(JSON.stringify(PRELOADED_PLAYERS));
    savePlayersToStorage();
  } else if (players.length === 0) {
    await initializePlayers();
  }

  // Merge any new players from PRELOADED_PLAYERS that aren't in the database yet
  if (typeof PRELOADED_PLAYERS !== 'undefined') {
    const existingKeys = new Set(players.map((p) => `${p.gameName}#${p.tagLine}`));
    PRELOADED_PLAYERS.forEach((preloaded) => {
      const key = `${preloaded.gameName}#${preloaded.tagLine}`;
      if (!existingKeys.has(key)) {
        players.push(JSON.parse(JSON.stringify(preloaded)));
        console.log('Added new player from config:', key);
      }
    });
  }

  renderPlayers();
  updateChart();
  updateLastUpdated();

  // Initialize timeline slider
  initTimelineSlider();

  // Start auto-refresh
  startAutoRefresh();
});

// Initialize players from hardcoded list
async function initializePlayers() {
  const container = document.getElementById('player-cards');
  container.innerHTML =
    '<div style="color: #00d4ff; font-size: 0.8rem; text-align: center; padding: 20px;">// INITIALIZING SURVEILLANCE...</div>';

  for (let i = 0; i < TRACKED_PLAYERS.length; i++) {
    const tracked = TRACKED_PLAYERS[i];
    try {
      const response = await fetch(
        `/api/rank/${tracked.region}/${encodeURIComponent(tracked.gameName)}/${encodeURIComponent(tracked.tagLine)}`
      );
      const data = await response.json();

      if (response.ok) {
        const player = {
          gameName: data.gameName,
          tagLine: data.tagLine,
          region: data.region,
          soloQueue: data.soloQueue,
          flexQueue: data.flexQueue,
          history: [
            {
              timestamp: data.timestamp,
              totalLP: data.soloQueue
                ? rankToTotalLP(
                    data.soloQueue.tier,
                    data.soloQueue.rank,
                    data.soloQueue.leaguePoints
                  )
                : 0,
            },
          ],
          colorIndex: i % PLAYER_COLORS.length,
        };
        players.push(player);
      }
    } catch (error) {
      console.error(`Failed to fetch ${tracked.gameName}:`, error);
    }
  }

  savePlayersToStorage();
  renderPlayers();
  updateChart();
  updateLastUpdated();
}

// Load players from localStorage
function loadPlayersFromStorage() {
  const stored = localStorage.getItem('lp-tracker-players');
  if (stored) {
    players = JSON.parse(stored);
  }
}

// Save players to localStorage
function savePlayersToStorage() {
  localStorage.setItem('lp-tracker-players', JSON.stringify(players));
}

// Load player history from database
async function loadPlayersFromDatabase() {
  try {
    const response = await fetch('/api/history');
    if (!response.ok) return;

    const history = await response.json();
    if (!history || history.length === 0) return;

    // Players to hide from frontend (data stays in DB)
    const HIDDEN_PLAYERS = ['RaciaI SIur#9999'];

    // Group history by player
    const playerMap = new Map();

    history.forEach((entry) => {
      const key = `${entry.game_name}#${entry.tag_line}`;

      // Skip hidden players
      if (HIDDEN_PLAYERS.includes(key)) return;

      if (!playerMap.has(key)) {
        playerMap.set(key, {
          gameName: entry.game_name,
          tagLine: entry.tag_line,
          region: entry.region,
          soloQueue: {
            tier: entry.tier,
            rank: entry.rank,
            leaguePoints: entry.lp,
            wins: entry.wins,
            losses: entry.losses,
          },
          history: [],
          historyMap: new Map(), // Track by timestamp+LP to dedupe
          colorIndex: playerMap.size % PLAYER_COLORS.length,
        });
      }
      // Skip unranked entries (don't plot 0 LP points from before placement)
      if (entry.tier !== 'UNRANKED' && entry.total_lp > 0) {
        const historyEntry = {
          timestamp: entry.created_at,
          totalLP: entry.total_lp,
        };

        // Include match data if available
        if (entry.match_id) {
          historyEntry.match = {
            matchId: entry.match_id,
            champion: entry.champion_name,
            championId: entry.champion_id,
            kills: entry.kills,
            deaths: entry.deaths,
            assists: entry.assists,
            win: entry.game_win,
          };
        }

        // Deduplicate: prefer entries with match data
        const dedupKey = `${entry.created_at}_${entry.total_lp}`;
        const player = playerMap.get(key);
        const existing = player.historyMap.get(dedupKey);

        if (!existing || (historyEntry.match && !existing.match)) {
          player.historyMap.set(dedupKey, historyEntry);
        }
      }
    });

    // Convert historyMap to history array for each player
    playerMap.forEach((player) => {
      player.history = Array.from(player.historyMap.values());
      delete player.historyMap; // Clean up temp map
    });

    // Update soloQueue with most recent data for each player
    playerMap.forEach((player) => {
      if (player.history.length > 0) {
        player.history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      }
    });

    players = Array.from(playerMap.values());
    console.log('Loaded', players.length, 'players from database');
  } catch (error) {
    console.error('Failed to load from database:', error);
  }
}

// Save LP data point to database (with optional match data)
async function saveToDatabase(player, totalLP, matchData = null) {
  try {
    const payload = {
      player_id: `${player.gameName}#${player.tagLine}`,
      game_name: player.gameName,
      tag_line: player.tagLine,
      region: player.region,
      total_lp: totalLP,
      tier: player.soloQueue?.tier || 'UNRANKED',
      rank: player.soloQueue?.rank || '',
      lp: player.soloQueue?.leaguePoints || 0,
      wins: player.soloQueue?.wins || 0,
      losses: player.soloQueue?.losses || 0,
    };

    // Add match data if provided
    if (matchData) {
      payload.match_id = matchData.matchId;
      payload.champion_name = matchData.champion;
      payload.champion_id = matchData.championId;
      payload.kills = matchData.kills;
      payload.deaths = matchData.deaths;
      payload.assists = matchData.assists;
      payload.game_win = matchData.win;
    }

    const response = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to save');
    console.log(
      'Saved to database:',
      player.gameName,
      totalLP,
      matchData ? `(${matchData.champion})` : ''
    );
  } catch (error) {
    console.error('Failed to save to database:', error);
  }
}

// Fetch most recent ranked match for a player
async function fetchMostRecentMatch(player) {
  try {
    const url = `/api/matches?region=${player.region}&gameName=${encodeURIComponent(player.gameName)}&tagLine=${encodeURIComponent(player.tagLine)}&count=1`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const matches = await response.json();
    return matches.length > 0 ? matches[0] : null;
  } catch (error) {
    console.error('Failed to fetch recent match:', error);
    return null;
  }
}

// Get current LP for sorting
function getCurrentLP(player) {
  if (!player.soloQueue) return 0;
  return rankToTotalLP(player.soloQueue.tier, player.soloQueue.rank, player.soloQueue.leaguePoints);
}

// Sort players by rank (highest first)
function getSortedPlayers() {
  return [...players].sort((a, b) => getCurrentLP(b) - getCurrentLP(a));
}

/**
 * Refreshes a single player's rank data from the Riot API.
 * Updates the player's soloQueue data and history, then re-renders the UI.
 *
 * @param {number} index - Index of the player in the sorted players array
 * @returns {Promise<void>}
 */
async function refreshPlayer(index) {
  const sorted = getSortedPlayers();
  const player = sorted[index];
  const card = document.querySelectorAll('.player-card')[index];
  card.classList.add('loading');

  try {
    const response = await fetch(
      `/api/rank/${player.region}/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to refresh');
    }

    // Find in original array
    const actualPlayer = players.find(
      (p) => p.gameName === player.gameName && p.tagLine === player.tagLine
    );

    actualPlayer.soloQueue = data.soloQueue;
    actualPlayer.flexQueue = data.flexQueue;

    const newTotalLP = data.soloQueue
      ? rankToTotalLP(data.soloQueue.tier, data.soloQueue.rank, data.soloQueue.leaguePoints)
      : 0;
    const lastEntry = actualPlayer.history[actualPlayer.history.length - 1];

    if (!lastEntry || lastEntry.totalLP !== newTotalLP) {
      actualPlayer.history.push({
        timestamp: data.timestamp,
        totalLP: newTotalLP,
      });
    }

    savePlayersToStorage();
    renderPlayers();
    updateChart();
  } catch (error) {
    console.error(`Failed to refresh ${player.gameName}:`, error.message);
  } finally {
    card.classList.remove('loading');
  }
}

/**
 * Refreshes all players sequentially.
 * Internal function used by auto-refresh.
 *
 * @returns {Promise<void>}
 */
async function refreshAll() {
  for (let i = 0; i < players.length; i++) {
    await refreshPlayer(i);
  }
}

// Refresh all players (UI button)
async function refreshAllPlayers() {
  const btn = document.getElementById('refresh-all-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = 'Refreshing...';

  let refreshedCount = 0;
  for (const player of players) {
    try {
      const response = await fetch(
        `/api/rank/${player.region}/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`
      );
      const data = await response.json();

      if (response.ok) {
        player.soloQueue = data.soloQueue;
        player.flexQueue = data.flexQueue;

        const newTotalLP = data.soloQueue
          ? rankToTotalLP(data.soloQueue.tier, data.soloQueue.rank, data.soloQueue.leaguePoints)
          : 0;
        const lastEntry = player.history[player.history.length - 1];

        if (!lastEntry || lastEntry.totalLP !== newTotalLP) {
          // Fetch the most recent match to get champion/KDA data
          const recentMatch = await fetchMostRecentMatch(player);

          player.history.push({
            timestamp: data.timestamp,
            totalLP: newTotalLP,
            match: recentMatch,
          });

          // Save to database with match data
          await saveToDatabase(player, newTotalLP, recentMatch);
        }
        refreshedCount++;
      }
    } catch (error) {
      console.error(`Failed to refresh ${player.gameName}:`, error);
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
    btn.textContent = `Refreshing ${refreshedCount}/${players.length}...`;
  }

  savePlayersToStorage();
  renderPlayers();
  updateChart();
  updateLastUpdated();

  btn.disabled = false;
  btn.classList.remove('loading');
  btn.textContent = originalText;
}

// Update last updated timestamp display
function updateLastUpdated() {
  lastUpdated = new Date();
  const el = document.getElementById('last-updated');
  if (el) {
    const timeStr = lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.textContent = `Last updated: ${timeStr}`;
  }
  localStorage.setItem('lp-tracker-lastUpdated', lastUpdated.toISOString());
}

// Load last updated from storage
function loadLastUpdated() {
  const stored = localStorage.getItem('lp-tracker-lastUpdated');
  if (stored) {
    lastUpdated = new Date(stored);
    const el = document.getElementById('last-updated');
    if (el) {
      const timeStr = lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      el.textContent = `Last updated: ${timeStr}`;
    }
  }
}

// Start auto-refresh timer
function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  autoRefreshInterval = setInterval(() => {
    console.log('Auto-refreshing player data...');
    refreshAllPlayers();
  }, AUTO_REFRESH_MS);
  console.log(`Auto-refresh started (every ${AUTO_REFRESH_MS / 60000} minutes)`);
}

// Stop auto-refresh timer
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    console.log('Auto-refresh stopped');
  }
}

// Get rank icon URL from CommunityDragon CDN
function getRankIconUrl(tier) {
  if (!tier || tier === 'UNRANKED') {
    return null;
  }
  // CommunityDragon hosts League rank emblems
  const tierLower = tier.toLowerCase();
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tierLower}.png`;
}

// Get LP change arrow for player (based on last 2 history entries)
function getLPChangeArrow(player) {
  if (!player.history || player.history.length < 2) {
    return { arrow: '', class: '' };
  }
  const lastLP = player.history[player.history.length - 1].totalLP;
  const prevLP = player.history[player.history.length - 2].totalLP;
  const diff = lastLP - prevLP;

  if (diff > 0) {
    return { arrow: '▲', class: 'lp-up', diff: `+${diff}` };
  } else if (diff < 0) {
    return { arrow: '▼', class: 'lp-down', diff: `${diff}` };
  }
  return { arrow: '', class: '', diff: '' };
}

// Render player cards (sorted by rank)
function renderPlayers() {
  const container = document.getElementById('player-cards');

  if (players.length === 0) {
    container.innerHTML =
      '<div style="color: #333; font-size: 0.8rem; text-align: center; padding: 20px;">// NO DATA</div>';
    return;
  }

  const sorted = getSortedPlayers();

  container.innerHTML = sorted
    .map((player, index) => {
      const rank = player.soloQueue;
      const tier = rank ? rank.tier : 'UNRANKED';
      const division = rank ? rank.rank : '';
      const lp = rank ? rank.leaguePoints : 0;
      const wins = rank ? rank.wins : 0;
      const losses = rank ? rank.losses : 0;
      const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
      const color = PLAYER_COLORS[player.colorIndex];
      const lpChange = getLPChangeArrow(player);

      const rankIconUrl = getRankIconUrl(tier);
      const rankBadge = rankIconUrl
        ? `<img src="${rankIconUrl}" alt="${tier}" class="rank-icon" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="rank-badge rank-${tier.toLowerCase()}" style="display:none">${tier.slice(0, 3)}${division ? '<br>' + division : ''}</div>`
        : `<div class="rank-badge rank-${tier.toLowerCase()}">${tier.slice(0, 3)}${division ? '<br>' + division : ''}</div>`;

      const opggUrl = `https://www.op.gg/summoners/na/${encodeURIComponent(player.gameName)}-${encodeURIComponent(player.tagLine)}`;

      return `
      <div class="player-card" onclick="showPlayerDetailView(${index})" style="border-left-color: ${color}">
        <a href="${opggUrl}" target="_blank" class="opgg-icon" onclick="event.stopPropagation()" title="View on OP.GG">OP.GG</a>
        <div class="player-header">
          <div class="player-name">${player.gameName}</div>
          ${lpChange.arrow ? `<span class="lp-change ${lpChange.class}">${lpChange.arrow} ${lpChange.diff}</span>` : ''}
        </div>
        <div class="player-region">${player.region} #${player.tagLine}</div>
        <div class="rank-info">
          ${rankBadge}
          <div class="rank-details">
            <div class="rank-tier">${tier} ${division}</div>
            <div class="rank-lp">${lp} LP</div>
            <div class="rank-record">${wins}W ${losses}L (${winRate}%)</div>
          </div>
        </div>
      </div>
    `;
    })
    .join('');
}

// Initialize Chart.js with Riot-style theming
function initChart() {
  const ctx = document.getElementById('lp-chart').getContext('2d');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1000,
        easing: 'easeOutQuart',
      },
      interaction: {
        intersect: false,
        mode: 'nearest',
        axis: 'xy',
      },
      onHover: (event, elements, chartInstance) => {
        // Check if mouse is within the chart area
        const chartArea = chartInstance.chartArea;
        const mouseX = event.x;
        const mouseY = event.y;
        const isInChartArea =
          mouseX >= chartArea.left &&
          mouseX <= chartArea.right &&
          mouseY >= chartArea.top &&
          mouseY <= chartArea.bottom;

        if (!isInChartArea) {
          // Mouse is outside chart area - reset dots
          chartInstance.data.datasets.forEach((dataset) => {
            dataset.pointRadius = 0;
          });
          if (selectedPlayers.size > 0) {
            applySelectedHighlight(chartInstance);
          } else {
            resetChartStyles(chartInstance);
          }
          chartInstance.canvas.style.cursor = 'default';
          return;
        }

        if (elements.length > 0) {
          const hoveredIndex = elements[0].datasetIndex;

          // If filtering is active, only allow hover on selected players
          if (selectedPlayers.size > 0 && !selectedPlayers.has(hoveredIndex)) {
            chartInstance.canvas.style.cursor = 'default';
            return;
          }

          applyChartHighlight(chartInstance, hoveredIndex);
          chartInstance.canvas.style.cursor = 'pointer';
        } else if (selectedPlayers.size === 0) {
          resetChartStyles(chartInstance);
          chartInstance.canvas.style.cursor = 'default';
        } else {
          applySelectedHighlight(chartInstance);
          chartInstance.canvas.style.cursor = 'default';
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#1a1a1a',
            font: {
              family: "'Inter', 'Segoe UI', sans-serif",
              size: 12,
              weight: '500',
            },
            padding: 16,
            usePointStyle: false,
            generateLabels: (chart) => {
              return chart.data.datasets.map((dataset, index) => {
                const isSelected = selectedPlayers.has(index);
                return {
                  text: (isSelected ? '☑ ' : '☐ ') + dataset.label,
                  fillStyle: dataset.borderColor,
                  strokeStyle: dataset.borderColor,
                  lineWidth: 2,
                  hidden: false,
                  datasetIndex: index,
                  fontColor: isSelected ? '#1a1a1a' : '#888',
                };
              });
            },
          },
          onClick: (event, legendItem, legend) => {
            const index = legendItem.datasetIndex;
            // Toggle selection
            if (selectedPlayers.has(index)) {
              selectedPlayers.delete(index);
            } else {
              selectedPlayers.add(index);
            }
            // Apply highlight based on selection
            if (selectedPlayers.size > 0) {
              applySelectedHighlight(legend.chart);
            } else {
              resetChartStyles(legend.chart);
            }
            // Update legend to show checkbox state
            legend.chart.update('none');
          },
        },
        tooltip: {
          backgroundColor: '#1a1a1a',
          borderColor: '#c8102e',
          borderWidth: 1,
          titleFont: {
            family: "'Inter', 'Segoe UI', sans-serif",
            size: 12,
            weight: '600',
          },
          bodyFont: {
            family: "'Inter', 'Segoe UI', sans-serif",
            size: 13,
          },
          padding: 12,
          filter: function (tooltipItem) {
            // If filtering is active, only show tooltip for selected players
            if (selectedPlayers.size > 0) {
              return selectedPlayers.has(tooltipItem.datasetIndex);
            }
            return true;
          },
          callbacks: {
            label: function (context) {
              if (context.raw === null) return '';
              const rankInfo = totalLPToRank(context.raw);
              const rankStr = rankInfo.division
                ? `${rankInfo.tier} ${rankInfo.division}`
                : rankInfo.tier;
              return `${context.dataset.label}: ${rankStr} ${rankInfo.lp} LP`;
            },
          },
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
            onPan: function ({ chart }) {
              updateSliderFromChart(chart);
            },
          },
          limits: {
            x: { minRange: 5 },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(0, 0, 0, 0.08)',
            lineWidth: 1,
          },
          ticks: {
            color: '#666',
            font: {
              family: "'Inter', 'Segoe UI', sans-serif",
              size: 11,
              weight: '500',
            },
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
        },
        y: {
          grid: {
            color: (context) => {
              const value = context.tick.value;
              if (value % 400 === 0) return 'rgba(200, 16, 46, 0.3)';
              if (value % 100 === 0) return 'rgba(0, 0, 0, 0.1)';
              return 'rgba(0, 0, 0, 0.04)';
            },
            lineWidth: (context) => {
              return context.tick.value % 400 === 0 ? 2 : 1;
            },
          },
          ticks: {
            color: '#1a1a1a',
            font: {
              family: "'Inter', 'Segoe UI', sans-serif",
              size: 11,
              weight: '600',
            },
            stepSize: 100,
            callback: function (value) {
              const rankInfo = totalLPToRank(value);
              if (value % 400 === 0) {
                return `${rankInfo.tier} ${rankInfo.division}`.toUpperCase();
              }
              if (value % 100 === 0) {
                return rankInfo.division;
              }
              return '';
            },
          },
        },
      },
    },
  });

  // Add mouseleave handler to reset chart when mouse exits
  chart.canvas.addEventListener('mouseleave', () => {
    // Force reset all point radii
    chart.data.datasets.forEach((dataset, index) => {
      dataset.pointRadius = 0;
      dataset.pointHoverRadius = 6;
    });

    if (selectedPlayers.size > 0) {
      applySelectedHighlight(chart);
    } else {
      resetChartStyles(chart);
    }
  });

  // Initialize button state (Overview is default/active)
  const btn = document.getElementById('view-toggle-btn');
  if (btn) btn.classList.add('active');
}

// Highlight a single line (for hover)
function applyChartHighlight(chartInstance, highlightIndex) {
  chartInstance.data.datasets.forEach((dataset, index) => {
    const baseColor = PLAYER_COLORS[players[index]?.colorIndex || index];

    if (index === highlightIndex) {
      // The hovered line - full highlight with dots
      dataset.borderWidth = 5;
      dataset.borderColor = baseColor;
      dataset.pointRadius = 8;
      dataset.pointBackgroundColor = baseColor;
      dataset.pointBorderColor = '#fff';
      dataset.pointBorderWidth = 3;
    } else if (selectedPlayers.size > 0 && selectedPlayers.has(index)) {
      // Other selected lines - visible but no dots
      dataset.borderWidth = 3;
      dataset.borderColor = baseColor;
      dataset.pointRadius = 0;
    } else {
      // Non-selected lines - faded
      dataset.borderWidth = 2;
      dataset.borderColor = baseColor + '30';
      dataset.pointRadius = 0;
    }
  });
  chartInstance.update('none');
}

// Highlight selected players only (no dots - dots only on hover)
function applySelectedHighlight(chartInstance) {
  chartInstance.data.datasets.forEach((dataset, index) => {
    const baseColor = PLAYER_COLORS[players[index]?.colorIndex || index];
    if (selectedPlayers.has(index)) {
      dataset.borderWidth = 4;
      dataset.borderColor = baseColor;
      dataset.pointRadius = 0;
    } else {
      dataset.borderWidth = 2;
      dataset.borderColor = baseColor + '30';
      dataset.pointRadius = 0;
    }
  });
  chartInstance.update('none');
}

// Reset all lines to normal state
function resetChartStyles(chartInstance) {
  chartInstance.data.datasets.forEach((dataset, index) => {
    const baseColor = PLAYER_COLORS[players[index]?.colorIndex || index];
    dataset.borderWidth = 3;
    dataset.borderColor = baseColor;
    dataset.pointRadius = 0;
  });
  chartInstance.update('none');
}

// Initialize timeline slider
function initTimelineSlider() {
  const slider = document.getElementById('timeline-slider');
  if (!slider) return;

  slider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    scrollChartToPosition(value);
  });
}

// Scroll chart to slider position (0-100)
function scrollChartToPosition(sliderValue) {
  if (!chart || allTimestamps.length <= VISIBLE_POINTS) return;

  const totalPoints = allTimestamps.length;
  const maxStartIndex = totalPoints - VISIBLE_POINTS;
  const startIndex = Math.round((sliderValue / 100) * maxStartIndex);
  const endIndex = Math.min(startIndex + VISIBLE_POINTS, totalPoints - 1);

  chart.options.scales.x.min = startIndex;
  chart.options.scales.x.max = endIndex;
  chart.update('none');

  updateTimelineLabels(startIndex, endIndex);
}

// Update slider position from chart pan
function updateSliderFromChart(chartInstance) {
  const slider = document.getElementById('timeline-slider');
  if (!slider || allTimestamps.length <= VISIBLE_POINTS) return;

  const min = chartInstance.options.scales.x.min || 0;
  const maxStartIndex = allTimestamps.length - VISIBLE_POINTS;
  const sliderValue = Math.round((min / maxStartIndex) * 100);

  slider.value = Math.max(0, Math.min(100, sliderValue));
  updateTimelineLabels(min, chartInstance.options.scales.x.max);
}

// Update timeline labels showing visible date range
function updateTimelineLabels(startIndex, endIndex) {
  const startLabel = document.getElementById('timeline-start');
  const endLabel = document.getElementById('timeline-end');

  if (startLabel && allTimestamps[startIndex]) {
    startLabel.textContent = formatTimestamp(allTimestamps[startIndex]);
  }
  if (endLabel && allTimestamps[endIndex]) {
    endLabel.textContent = formatTimestamp(allTimestamps[endIndex]);
  }
}

// Toggle between overview (all data) and daily (last 24 hours)
function toggleViewMode() {
  overviewMode = !overviewMode;
  const btn = document.getElementById('view-toggle-btn');
  const slider = document.getElementById('timeline-slider');

  if (overviewMode) {
    // Overview mode - show ALL data, button active (red)
    if (btn) {
      btn.textContent = 'Overview';
      btn.classList.add('active');
    }
    if (slider) slider.disabled = true;

    // Set chart to show full range
    chart.options.scales.x.min = 0;
    chart.options.scales.x.max = allTimestamps.length - 1;
    chart.update('none');

    updateTimelineLabels(0, allTimestamps.length - 1);
  } else {
    // Daily mode - show last 24 hours of data, button inactive (white)
    if (btn) {
      btn.textContent = 'Daily';
      btn.classList.remove('active');
    }
    if (slider) slider.disabled = true;

    // Find data points from last 24 hours
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let startIndex = 0;
    for (let i = 0; i < allTimestamps.length; i++) {
      if (new Date(allTimestamps[i]) >= oneDayAgo) {
        startIndex = i;
        break;
      }
    }

    chart.options.scales.x.min = startIndex;
    chart.options.scales.x.max = allTimestamps.length - 1;
    chart.update('none');

    updateTimelineLabels(startIndex, allTimestamps.length - 1);
  }
}

// Calculate dynamic Y-axis range based on player data
function calculateYAxisRange() {
  if (players.length === 0) {
    return { min: 800, max: 2000 };
  }

  let minLP = Infinity;
  let maxLP = -Infinity;

  players.forEach((p) => {
    // Skip unranked players (no soloQueue data)
    if (!p.soloQueue) return;

    p.history.forEach((h) => {
      // Skip entries with 0 LP (unranked)
      if (h.totalLP === 0) return;
      if (h.totalLP < minLP) minLP = h.totalLP;
      if (h.totalLP > maxLP) maxLP = h.totalLP;
    });
  });

  // If no valid LP data found, return defaults
  if (minLP === Infinity || maxLP === -Infinity) {
    return { min: 800, max: 2000 };
  }

  const minBoundary = Math.max(0, Math.floor((minLP - 100) / 400) * 400);
  const maxBoundary = Math.min(4000, Math.ceil((maxLP + 100) / 400) * 400);

  return { min: minBoundary, max: maxBoundary };
}

/**
 * Formats an ISO timestamp for display on the chart X-axis.
 *
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted string like "01/15 14:30"
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const mins = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
}

/**
 * Updates the main chart with current player data.
 * Recalculates timestamps, datasets, and Y-axis range.
 * Called after any data change (refresh, load, etc.).
 */
function updateChart() {
  if (!chart) return;

  // Collect all unique timestamps across all players
  const timestampSet = new Set();
  players.forEach((p) => {
    p.history.forEach((h) => {
      timestampSet.add(h.timestamp);
    });
  });

  // Sort timestamps chronologically and store globally
  allTimestamps = Array.from(timestampSet).sort((a, b) => new Date(a) - new Date(b));

  const yRange = calculateYAxisRange();
  chart.options.scales.y.min = yRange.min;
  chart.options.scales.y.max = yRange.max;

  // Format labels for display
  chart.data.labels = allTimestamps.map((ts) => formatTimestamp(ts));

  // Set initial view - Overview mode shows ALL data from the beginning
  const slider = document.getElementById('timeline-slider');
  if (slider) slider.disabled = true;

  // Always show full range (overview is default)
  chart.options.scales.x.min = 0;
  chart.options.scales.x.max = allTimestamps.length - 1;

  // Update timeline labels
  updateTimelineLabels(chart.options.scales.x.min, chart.options.scales.x.max);

  chart.data.datasets = players.map((player) => {
    const color = PLAYER_COLORS[player.colorIndex];

    // For each timestamp, find player's LP at that time or the most recent before it
    const data = allTimestamps.map((ts) => {
      // Find exact match first
      const exactMatch = player.history.find((h) => h.timestamp === ts);
      if (exactMatch) return exactMatch.totalLP;

      // Find most recent entry before this timestamp
      const before = player.history
        .filter((h) => new Date(h.timestamp) <= new Date(ts))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

      return before ? before.totalLP : null;
    });

    return {
      label: `${player.gameName}`,
      data: data,
      borderColor: color,
      backgroundColor: color + '20',
      borderWidth: 3, // Thicker lines for better visibility
      pointRadius: 0,
      pointHoverRadius: 8,
      pointBackgroundColor: color,
      pointBorderColor: '#fff',
      pointBorderWidth: 3,
      pointHoverBackgroundColor: color,
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 3,
      tension: 0.2, // Slightly less curve for cleaner lines
      fill: false,
      spanGaps: true,
      borderCapStyle: 'round',
      borderJoinStyle: 'round',
    };
  });

  chart.update();
}

// ==========================================
// PLAYER DETAIL VIEW FUNCTIONS
// ==========================================

// Get champion icon URL from CommunityDragon CDN
function getChampionIconUrl(championId) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;
}

// Fetch match history from API
async function fetchMatchHistory(player, count = 20) {
  const cacheKey = `${player.gameName}#${player.tagLine}`;

  // Check cache first (valid for 5 minutes)
  const cached = playerMatchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.matches;
  }

  try {
    const url = `/api/matches?region=${player.region}&gameName=${encodeURIComponent(player.gameName)}&tagLine=${encodeURIComponent(player.tagLine)}&count=${count}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error('Failed to fetch match history:', response.status);
      return [];
    }

    const matches = await response.json();

    // Cache the results
    playerMatchCache.set(cacheKey, {
      matches: matches,
      timestamp: Date.now(),
    });

    return matches;
  } catch (error) {
    console.error('Error fetching match history:', error);
    return [];
  }
}

// Correlate LP history entries with match data
function correlateMatchesWithHistory(player, matches) {
  if (!player.history || player.history.length === 0) return player.history;

  // Sort matches by timestamp (newest first)
  const sortedMatches = [...matches].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // For each history entry, try to find the matching game
  return player.history.map((entry, index) => {
    const entryTime = new Date(entry.timestamp);

    // Find the closest match that occurred before this LP entry
    // (LP update happens after game ends)
    const matchingMatch = sortedMatches.find((match) => {
      const matchTime = new Date(match.timestamp);
      const timeDiff = entryTime - matchTime;
      // Match should be within 30 minutes before the LP entry
      return timeDiff >= 0 && timeDiff < 30 * 60 * 1000;
    });

    // Calculate LP change from previous entry
    let lpChange = 0;
    if (index > 0) {
      lpChange = entry.totalLP - player.history[index - 1].totalLP;
    }

    return {
      ...entry,
      lpChange: lpChange,
      match: matchingMatch || null,
    };
  });
}

// Show player detail view
async function showPlayerDetailView(playerIndex) {
  const player = getSortedPlayers()[playerIndex];
  if (!player) return;

  currentDetailPlayer = player;

  // Update header info
  document.getElementById('detail-player-name').textContent =
    `${player.gameName} #${player.tagLine}`;

  const rank = player.soloQueue;
  if (rank) {
    const winRate =
      rank.wins + rank.losses > 0 ? Math.round((rank.wins / (rank.wins + rank.losses)) * 100) : 0;
    document.getElementById('detail-player-rank').textContent =
      `${rank.tier} ${rank.rank} · ${rank.leaguePoints} LP · ${winRate}% WR`;
  } else {
    document.getElementById('detail-player-rank').textContent = 'Unranked';
  }

  // Update OP.GG link
  const opggUrl = `https://www.op.gg/summoners/na/${encodeURIComponent(player.gameName)}-${encodeURIComponent(player.tagLine)}`;
  document.getElementById('detail-opgg-link').href = opggUrl;

  // Show overlay
  document.getElementById('detail-view-overlay').classList.remove('hidden');

  // Check if history already has match data from database
  const hasStoredMatchData = player.history.some((h) => h.match);

  let enrichedHistory;
  if (hasStoredMatchData) {
    // Use stored match data, just add LP change calculations
    enrichedHistory = player.history.map((entry, index) => {
      let lpChange = 0;
      if (index > 0) {
        lpChange = entry.totalLP - player.history[index - 1].totalLP;
      }
      return { ...entry, lpChange };
    });
    console.log('Using stored match data from database');
  } else {
    // Fetch match history from API and correlate
    const matches = await fetchMatchHistory(player);
    enrichedHistory = correlateMatchesWithHistory(player, matches);
    console.log('Fetched match data from API');
  }

  createDetailChart(player, enrichedHistory);
}

// Close player detail view
function closeDetailView() {
  document.getElementById('detail-view-overlay').classList.add('hidden');
  currentDetailPlayer = null;

  if (detailChart) {
    detailChart.destroy();
    detailChart = null;
  }

  // Remove custom tooltip if it exists
  const tooltipEl = document.getElementById('chartjs-tooltip');
  if (tooltipEl) {
    tooltipEl.remove();
  }
}

// Create detail chart for single player
function createDetailChart(player, enrichedHistory) {
  const ctx = document.getElementById('detail-chart').getContext('2d');

  // Destroy existing chart if any
  if (detailChart) {
    detailChart.destroy();
  }

  const color = PLAYER_COLORS[player.colorIndex];

  // Only show entries with actual match data (real games, not filler snapshots)
  const validHistory = enrichedHistory.filter((h) => h.totalLP > 0 && h.match && h.match.champion);

  console.log(
    `Detail chart: ${validHistory.length} real games (filtered from ${enrichedHistory.length} total entries)`
  );

  const labels = validHistory.map((h) => formatTimestamp(h.timestamp));
  const data = validHistory.map((h) => h.totalLP);

  // Calculate Y-axis range for this player
  const minLP = Math.min(...data);
  const maxLP = Math.max(...data);
  const yMin = Math.max(0, Math.floor((minLP - 100) / 400) * 400);
  const yMax = Math.min(4000, Math.ceil((maxLP + 100) / 400) * 400);

  // Store validHistory for tooltip access
  const chartData = validHistory;

  detailChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: player.gameName,
          data: data,
          borderColor: color + '80', // Semi-transparent line
          backgroundColor: color + '20',
          borderWidth: 2, // Thin line connecting games
          pointRadius: 6,
          pointHoverRadius: 10,
          pointBackgroundColor: validHistory.map((h) => {
            // All entries now have match data (filtered above)
            const isWin = h.match.win === true || h.match.win === 't';
            return isWin ? '#4caf50' : '#ef5350';
          }),
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.2,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 300,
      },
      interaction: {
        intersect: false,
        mode: 'nearest',
        axis: 'x',
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: false, // Disable default tooltip, use custom HTML
          external: function (context) {
            // Get or create tooltip element
            let tooltipEl = document.getElementById('chartjs-tooltip');
            if (!tooltipEl) {
              tooltipEl = document.createElement('div');
              tooltipEl.id = 'chartjs-tooltip';
              tooltipEl.className = 'match-tooltip';
              document.body.appendChild(tooltipEl);
            }

            const tooltipModel = context.tooltip;

            // Hide if no tooltip
            if (tooltipModel.opacity === 0) {
              tooltipEl.style.opacity = 0;
              return;
            }

            // Get data point
            if (tooltipModel.dataPoints && tooltipModel.dataPoints.length > 0) {
              const idx = tooltipModel.dataPoints[0].dataIndex;
              const entry = validHistory[idx];
              const rankInfo = totalLPToRank(entry.totalLP);
              const rankStr = rankInfo.division
                ? `${rankInfo.tier} ${rankInfo.division}`
                : rankInfo.tier;

              let html = '';

              // If match data available, show champion icon and stats
              if (entry.match && entry.match.champion) {
                const champIconUrl = getChampionIconUrl(entry.match.championId);
                // Handle postgres boolean (can be true/false or 't'/'f')
                const isWin = entry.match.win === true || entry.match.win === 't';
                const resultClass = isWin ? 'victory' : 'defeat';
                const resultText = isWin ? 'Victory' : 'Defeat';

                html = `
                  <div class="champion-row">
                    <img src="${champIconUrl}" class="champion-icon" alt="${entry.match.champion}" onerror="this.style.display='none'">
                    <div>
                      <div class="champion-name">${entry.match.champion}</div>
                      <div class="kda">${entry.match.kills} / ${entry.match.deaths} / ${entry.match.assists}</div>
                    </div>
                  </div>
                  <div class="result ${resultClass}">${resultText}</div>
                  <div class="rank-change">
                    <div>${rankStr} · ${rankInfo.lp} LP</div>
                    ${entry.lpChange !== 0 ? `<div class="lp-change ${entry.lpChange > 0 ? 'positive' : 'negative'}">${entry.lpChange > 0 ? '+' : ''}${entry.lpChange} LP</div>` : ''}
                  </div>
                `;
              } else {
                // No match data - show rank info only
                html = `
                  <div class="rank-change">
                    <div>${rankStr} · ${rankInfo.lp} LP</div>
                    ${entry.lpChange !== 0 ? `<div class="lp-change ${entry.lpChange > 0 ? 'positive' : 'negative'}">${entry.lpChange > 0 ? '+' : ''}${entry.lpChange} LP</div>` : ''}
                  </div>
                `;
              }

              tooltipEl.innerHTML = html;
            }

            // Position tooltip
            const position = context.chart.canvas.getBoundingClientRect();
            tooltipEl.style.opacity = 1;
            tooltipEl.style.position = 'absolute';
            tooltipEl.style.left = position.left + window.scrollX + tooltipModel.caretX + 'px';
            tooltipEl.style.top = position.top + window.scrollY + tooltipModel.caretY - 10 + 'px';
            tooltipEl.style.transform = 'translate(-50%, -100%)';
            tooltipEl.style.pointerEvents = 'none';
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(0, 0, 0, 0.08)',
          },
          ticks: {
            color: '#666',
            font: {
              family: "'Inter', sans-serif",
              size: 11,
            },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 15,
          },
        },
        y: {
          min: yMin,
          max: yMax,
          grid: {
            color: (context) => {
              const value = context.tick.value;
              if (value % 400 === 0) return 'rgba(200, 16, 46, 0.3)';
              if (value % 100 === 0) return 'rgba(0, 0, 0, 0.1)';
              return 'rgba(0, 0, 0, 0.04)';
            },
            lineWidth: (context) => {
              return context.tick.value % 400 === 0 ? 2 : 1;
            },
          },
          ticks: {
            color: '#1a1a1a',
            font: {
              family: "'Inter', sans-serif",
              size: 11,
              weight: '600',
            },
            stepSize: 100,
            callback: function (value) {
              const rankInfo = totalLPToRank(value);
              if (value % 400 === 0) {
                return `${rankInfo.tier} ${rankInfo.division}`.toUpperCase();
              }
              if (value % 100 === 0) {
                return rankInfo.division;
              }
              return '';
            },
          },
        },
      },
    },
  });
}

// Handle escape key to close detail view
document.addEventListener('keydown', (e) => {
  if (
    e.key === 'Escape' &&
    !document.getElementById('detail-view-overlay').classList.contains('hidden')
  ) {
    closeDetailView();
  }
});
