// Generate LP history from match data
const https = require('https');

const API_KEY = 'RGAPI-d3d06f48-1718-4e9f-a172-43a1b13fbc7c';

const PLAYERS = [
  { gameName: 'i am sad haha', tagLine: 'NA1', region: 'NA' },
  { gameName: 'xty', tagLine: '001', region: 'NA' },
  { gameName: 'TwoWeekTimeout', tagLine: 'NA1', region: 'NA' },
  { gameName: 'Tortle', tagLine: 'Druid', region: 'NA' },
  { gameName: 'Keebles', tagLine: '6969', region: 'NA' },
  { gameName: 'Cedric Dube', tagLine: '420', region: 'NA' },
  { gameName: 'Humble White Boy', tagLine: '666', region: 'NA' }
];

const RANK_VALUES = {
  'IRON': 0, 'BRONZE': 400, 'SILVER': 800, 'GOLD': 1200,
  'PLATINUM': 1600, 'EMERALD': 2000, 'DIAMOND': 2400,
  'MASTER': 2800, 'GRANDMASTER': 3200, 'CHALLENGER': 3600
};
const DIV_VALUES = { 'IV': 0, 'III': 100, 'II': 200, 'I': 300 };

function rankToLP(tier, rank, lp) {
  const base = RANK_VALUES[tier] || 0;
  const div = ['MASTER','GRANDMASTER','CHALLENGER'].includes(tier) ? 0 : (DIV_VALUES[rank] || 0);
  return base + div + lp;
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'X-Riot-Token': API_KEY } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0,100))); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getPlayerData(player) {
  console.log(`\n=== ${player.gameName}#${player.tagLine} ===`);

  // Get PUUID
  const account = await fetch(`https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`);
  if (!account.puuid) {
    console.log('Could not find player');
    return null;
  }
  const puuid = account.puuid;
  await sleep(50);

  // Get current rank
  const rankData = await fetch(`https://na1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
  const soloQ = rankData.find(q => q.queueType === 'RANKED_SOLO_5x5');
  if (!soloQ) {
    console.log('No ranked data');
    return null;
  }

  const currentLP = rankToLP(soloQ.tier, soloQ.rank, soloQ.leaguePoints);
  console.log(`Current: ${soloQ.tier} ${soloQ.rank} ${soloQ.leaguePoints} LP (total: ${currentLP})`);
  console.log(`Record: ${soloQ.wins}W ${soloQ.losses}L`);
  await sleep(50);

  // Get match history (queue 420 = ranked solo)
  // Start time: Jan 8, 2026 = 1767830400 (epoch seconds)
  const startTime = Math.floor(new Date('2026-01-08T00:00:00Z').getTime() / 1000);
  const matchIds = await fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&startTime=${startTime}&count=100`);

  if (!Array.isArray(matchIds)) {
    console.log('Could not get matches:', matchIds);
    return null;
  }
  console.log(`Found ${matchIds.length} ranked games since 1/8`);

  // Get match details (in reverse order - oldest first)
  const matches = [];
  for (let i = matchIds.length - 1; i >= 0; i--) {
    await sleep(120); // Rate limiting
    try {
      const match = await fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchIds[i]}`);
      if (match.info) {
        const participant = match.info.participants.find(p => p.puuid === puuid);
        matches.push({
          date: new Date(match.info.gameCreation).toISOString(),
          win: participant.win,
          champion: participant.championName
        });
      }
    } catch(e) {
      console.log('Error fetching match:', e.message);
    }
  }

  // Calculate LP history (work backwards from current)
  // Average LP gain: +25, Average LP loss: -18
  let lp = currentLP;
  const history = [{ timestamp: new Date().toISOString(), totalLP: currentLP }];

  // Go through matches in reverse chronological order
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    // Undo the LP change to get previous LP
    if (m.win) {
      lp -= 25; // Undo win
    } else {
      lp += 18; // Undo loss
    }
    history.unshift({ timestamp: m.date, totalLP: Math.max(0, lp) });
  }

  console.log(`History: ${history.length} data points`);
  console.log(`Starting LP (1/8): ${history[0].totalLP} -> Current: ${currentLP}`);

  return {
    gameName: account.gameName,
    tagLine: account.tagLine,
    region: player.region,
    soloQueue: soloQ,
    history: history
  };
}

async function main() {
  const results = [];

  for (let i = 0; i < PLAYERS.length; i++) {
    const data = await getPlayerData(PLAYERS[i]);
    if (data) {
      data.colorIndex = i;
      results.push(data);
    }
    await sleep(500); // Extra delay between players
  }

  // Output as JSON for the app
  console.log('\n\n=== PLAYER DATA FOR APP ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
