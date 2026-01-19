const axios = require('axios');
const {
  REGIONS,
  RANKED_SOLO_QUEUE_ID,
  RANKED_SOLO_QUEUE_TYPE,
  DEFAULT_MATCH_COUNT,
  MAX_MATCH_COUNT,
  MATCH_FETCH_DELAY_MS,
} = require('../shared/constants');

/**
 * Fetches recent ranked match history for a player from Riot API.
 *
 * @route GET /api/matches
 * @query {string} region - Region code (NA, EUW, KR, etc.)
 * @query {string} gameName - Player's Riot game name
 * @query {string} tagLine - Player's Riot tag line
 * @query {number} [count=20] - Number of matches to fetch (max 50)
 * @returns {Array<Object>} Array of match data objects
 * @returns {string} returns[].matchId - Unique match identifier
 * @returns {string} returns[].timestamp - ISO timestamp of match end
 * @returns {string} returns[].champion - Champion name played
 * @returns {number} returns[].kills - Kills in the match
 * @returns {number} returns[].deaths - Deaths in the match
 * @returns {number} returns[].assists - Assists in the match
 * @returns {boolean} returns[].win - Whether the player won
 */
module.exports = async (req, res) => {
  try {
    const { region, gameName, tagLine, count = DEFAULT_MATCH_COUNT } = req.query;

    if (!region || !gameName || !tagLine) {
      return res.status(400).json({
        error: 'Missing parameters. Use /api/matches?region=NA&gameName=xxx&tagLine=xxx',
      });
    }

    const regionConfig = REGIONS[region.toUpperCase()];
    if (!regionConfig) {
      return res.status(400).json({ error: `Invalid region: ${region}` });
    }

    const RIOT_API_KEY = process.env.RIOT_API_KEY;

    // Step 1: Get PUUID from Riot ID
    const accountUrl = `https://${regionConfig.regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const accountResponse = await axios.get(accountUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY },
    });
    const { puuid } = accountResponse.data;

    // Step 2: Get match IDs (ranked solo/duo only)
    const matchIdsUrl = `https://${regionConfig.regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`;
    const matchIdsResponse = await axios.get(matchIdsUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY },
      params: {
        queue: RANKED_SOLO_QUEUE_ID,
        count: Math.min(parseInt(count), MAX_MATCH_COUNT),
      },
    });
    const matchIds = matchIdsResponse.data;

    if (!matchIds || matchIds.length === 0) {
      return res.json([]);
    }

    // Step 3: Get details for each match
    const matches = [];
    for (const matchId of matchIds) {
      try {
        const matchUrl = `https://${regionConfig.regional}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
        const matchResponse = await axios.get(matchUrl, {
          headers: { 'X-Riot-Token': RIOT_API_KEY },
        });

        const matchData = matchResponse.data;
        const participant = matchData.info.participants.find((p) => p.puuid === puuid);

        // Skip remakes - they don't award/cost LP
        const isRemake = participant?.gameEndedInEarlySurrender || matchData.info.gameDuration < 300;

        if (participant && !isRemake) {
          matches.push({
            matchId: matchId,
            timestamp: new Date(matchData.info.gameEndTimestamp).toISOString(),
            gameStartTimestamp: matchData.info.gameStartTimestamp,
            gameEndTimestamp: matchData.info.gameEndTimestamp,
            champion: participant.championName,
            championId: participant.championId,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            win: participant.win,
            queueType: RANKED_SOLO_QUEUE_TYPE,
          });
        }

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, MATCH_FETCH_DELAY_MS));
      } catch (matchError) {
        console.error(`Failed to fetch match ${matchId}:`, matchError.message);
        // Continue with other matches
      }
    }

    res.json(matches);
  } catch (error) {
    console.error('Match API Error:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Player not found' });
    }
    if (error.response?.status === 403) {
      return res.status(403).json({ error: 'Invalid or expired API key' });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Please try again later.' });
    }
    res.status(500).json({ error: 'Failed to fetch match history' });
  }
};
