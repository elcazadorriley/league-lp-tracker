const axios = require('axios');

const REGIONS = {
  NA: { platform: 'na1', regional: 'americas' },
  BR: { platform: 'br1', regional: 'americas' },
  LAN: { platform: 'la1', regional: 'americas' },
  LAS: { platform: 'la2', regional: 'americas' },
  EUW: { platform: 'euw1', regional: 'europe' },
  EUNE: { platform: 'eun1', regional: 'europe' },
  TR: { platform: 'tr1', regional: 'europe' },
  RU: { platform: 'ru', regional: 'europe' },
  KR: { platform: 'kr', regional: 'asia' },
  JP: { platform: 'jp1', regional: 'asia' },
  OCE: { platform: 'oc1', regional: 'sea' },
  PH: { platform: 'ph2', regional: 'sea' },
  SG: { platform: 'sg2', regional: 'sea' },
  TH: { platform: 'th2', regional: 'sea' },
  TW: { platform: 'tw2', regional: 'sea' },
  VN: { platform: 'vn2', regional: 'sea' },
};

module.exports = async (req, res) => {
  try {
    const { params } = req.query;
    const [region, gameName, tagLine] = params;

    const regionConfig = REGIONS[region.toUpperCase()];
    if (!regionConfig) {
      return res.status(400).json({ error: `Invalid region: ${region}` });
    }

    const RIOT_API_KEY = process.env.RIOT_API_KEY;

    const accountUrl = `https://${regionConfig.regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const accountResponse = await axios.get(accountUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });
    const { puuid } = accountResponse.data;

    const rankUrl = `https://${regionConfig.platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    const rankResponse = await axios.get(rankUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

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
};
