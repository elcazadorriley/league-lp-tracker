// Load environment variables from .env file
require('dotenv').config();

// Import dependencies
const express = require('express');
const path = require('path');
const axios = require('axios');

// Create the app
const app = express();
app.use(express.json());

// Tell express where to find our static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '../public')));

// Riot API configuration
const RIOT_API_KEY = process.env.RIOT_API_KEY;
console.log('API Key loaded:', RIOT_API_KEY ? `${RIOT_API_KEY.substring(0, 15)}...` : 'NOT FOUND');

// Map user-friendly region names to Riot's API endpoints
const REGIONS = {
  // Americas
  NA: { platform: 'na1', regional: 'americas' },
  BR: { platform: 'br1', regional: 'americas' },
  LAN: { platform: 'la1', regional: 'americas' },
  LAS: { platform: 'la2', regional: 'americas' },
  // Europe
  EUW: { platform: 'euw1', regional: 'europe' },
  EUNE: { platform: 'eun1', regional: 'europe' },
  TR: { platform: 'tr1', regional: 'europe' },
  RU: { platform: 'ru', regional: 'europe' },
  // Asia
  KR: { platform: 'kr', regional: 'asia' },
  JP: { platform: 'jp1', regional: 'asia' },
  // SEA
  OCE: { platform: 'oc1', regional: 'sea' },
  PH: { platform: 'ph2', regional: 'sea' },
  SG: { platform: 'sg2', regional: 'sea' },
  TH: { platform: 'th2', regional: 'sea' },
  TW: { platform: 'tw2', regional: 'sea' },
  VN: { platform: 'vn2', regional: 'sea' },
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running!' });
});

// Get player rank by Riot ID
// Example: /api/rank/NA/PlayerName/TAG
app.get('/api/rank/:region/:gameName/:tagLine', async (req, res) => {
  try {
    const { region, gameName, tagLine } = req.params;
    const regionConfig = REGIONS[region.toUpperCase()];

    if (!regionConfig) {
      return res.status(400).json({ error: `Invalid region: ${region}` });
    }

    // Step 1: Get PUUID from Riot ID
    const accountUrl = `https://${regionConfig.regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const accountResponse = await axios.get(accountUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });
    const { puuid } = accountResponse.data;

    // Step 2: Get Ranked Stats (using PUUID directly)
    const rankUrl = `https://${regionConfig.platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    const rankResponse = await axios.get(rankUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

    // Find Solo/Duo queue rank (most common)
    const soloQueue = rankResponse.data.find(q => q.queueType === 'RANKED_SOLO_5x5');
    const flexQueue = rankResponse.data.find(q => q.queueType === 'RANKED_FLEX_SR');

    res.json({
      gameName: accountResponse.data.gameName,
      tagLine: accountResponse.data.tagLine,
      region: region.toUpperCase(),
      soloQueue: soloQueue || null,
      flexQueue: flexQueue || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Player not found' });
    }
    if (error.response?.status === 403) {
      return res.status(403).json({ error: 'Invalid or expired API key' });
    }

    res.status(500).json({ error: 'Failed to fetch player data' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
