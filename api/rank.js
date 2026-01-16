const axios = require('axios');
const { REGIONS, RANKED_SOLO_QUEUE_TYPE } = require('../shared/constants');

/**
 * Fetches current ranked data for a player from Riot API.
 *
 * @route GET /api/rank
 * @query {string} region - Region code (NA, EUW, KR, etc.)
 * @query {string} gameName - Player's Riot game name
 * @query {string} tagLine - Player's Riot tag line
 * @returns {Object} Player rank data including soloQueue and flexQueue info
 * @returns {string} returns.gameName - Player's game name
 * @returns {string} returns.tagLine - Player's tag line
 * @returns {string} returns.region - Region code
 * @returns {Object|null} returns.soloQueue - Solo/Duo queue rank data
 * @returns {Object|null} returns.flexQueue - Flex queue rank data
 * @returns {string} returns.timestamp - ISO timestamp of the request
 */
module.exports = async (req, res) => {
  try {
    const { region, gameName, tagLine } = req.query;

    if (!region || !gameName || !tagLine) {
      return res
        .status(400)
        .json({ error: 'Missing parameters. Use /api/rank/REGION/GAMENAME/TAGLINE' });
    }

    const regionConfig = REGIONS[region.toUpperCase()];
    if (!regionConfig) {
      return res.status(400).json({ error: `Invalid region: ${region}` });
    }

    const RIOT_API_KEY = process.env.RIOT_API_KEY;

    const accountUrl = `https://${regionConfig.regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const accountResponse = await axios.get(accountUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY },
    });
    const { puuid } = accountResponse.data;

    const rankUrl = `https://${regionConfig.platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    const rankResponse = await axios.get(rankUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY },
    });

    const soloQueue = rankResponse.data.find((q) => q.queueType === RANKED_SOLO_QUEUE_TYPE);
    const flexQueue = rankResponse.data.find((q) => q.queueType === 'RANKED_FLEX_SR');

    res.json({
      gameName: accountResponse.data.gameName,
      tagLine: accountResponse.data.tagLine,
      region: region.toUpperCase(),
      soloQueue: soloQueue || null,
      flexQueue: flexQueue || null,
      timestamp: new Date().toISOString(),
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
};
