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

// Ranked Solo/Duo queue ID
const RANKED_SOLO_QUEUE_ID = 420;

module.exports = async (req, res) => {
  try {
    const { region, gameName, tagLine, count = 20 } = req.query;

    if (!region || !gameName || !tagLine) {
      return res.status(400).json({
        error: 'Missing parameters. Use /api/matches?region=NA&gameName=xxx&tagLine=xxx'
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
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });
    const { puuid } = accountResponse.data;

    // Step 2: Get match IDs (ranked solo/duo only)
    const matchIdsUrl = `https://${regionConfig.regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`;
    const matchIdsResponse = await axios.get(matchIdsUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY },
      params: {
        queue: RANKED_SOLO_QUEUE_ID,
        count: Math.min(parseInt(count), 50) // Cap at 50 matches
      }
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
          headers: { 'X-Riot-Token': RIOT_API_KEY }
        });

        const matchData = matchResponse.data;
        const participant = matchData.info.participants.find(p => p.puuid === puuid);

        if (participant) {
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
            queueType: 'RANKED_SOLO_5x5'
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 50));
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
