const https = require('https');
require('dotenv').config();

const RIOT_API_KEY = process.env.RIOT_API_KEY;

if (!RIOT_API_KEY) {
  console.error('RIOT_API_KEY not found. Create a .env file with RIOT_API_KEY=your_key');
  process.exit(1);
}

// All tracked players
const PLAYERS = [
  { gameName: 'i am sad haha', tagLine: 'NA1', region: 'NA' },
  { gameName: 'xty', tagLine: '001', region: 'NA' },
  { gameName: 'TwoWeekTimeout', tagLine: 'NA1', region: 'NA' },
  { gameName: 'Tortle', tagLine: 'Druid', region: 'NA' },
  { gameName: 'Keebles', tagLine: '6969', region: 'NA' },
  { gameName: 'Cedric Dube', tagLine: '420', region: 'NA' },
  { gameName: 'Humble White Boy', tagLine: '666', region: 'NA' },
  { gameName: 'Bugz', tagLine: '0627', region: 'NA' }
];

const API_HOST = 'www.liftedf250.lol';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'X-Riot-Token': RIOT_API_KEY, ...headers } };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else if (res.statusCode === 429) {
          reject(new Error('RATE_LIMITED'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await httpsGet(url);
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        console.log('    Rate limited, waiting 10s...');
        await sleep(10000);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

async function getCurrentHistory() {
  return new Promise((resolve, reject) => {
    https.get(`https://${API_HOST}/api/history`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function totalLPToRank(totalLP) {
  const tiers = [
    { name: 'IRON', base: 0 },
    { name: 'BRONZE', base: 400 },
    { name: 'SILVER', base: 800 },
    { name: 'GOLD', base: 1200 },
    { name: 'PLATINUM', base: 1600 },
    { name: 'EMERALD', base: 2000 },
    { name: 'DIAMOND', base: 2400 },
    { name: 'MASTER', base: 2800 },
    { name: 'GRANDMASTER', base: 3200 },
    { name: 'CHALLENGER', base: 3600 }
  ];

  for (let i = tiers.length - 1; i >= 0; i--) {
    if (totalLP >= tiers[i].base) {
      const lpInTier = totalLP - tiers[i].base;
      if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tiers[i].name)) {
        return { tier: tiers[i].name, rank: '', lp: lpInTier };
      }
      const divisions = ['IV', 'III', 'II', 'I'];
      const divIndex = Math.min(Math.floor(lpInTier / 100), 3);
      return {
        tier: tiers[i].name,
        rank: divisions[divIndex],
        lp: lpInTier % 100
      };
    }
  }
  return { tier: 'IRON', rank: 'IV', lp: 0 };
}

// Get PUUID for a player
async function getPuuid(player) {
  const url = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`;
  const account = await fetchWithRetry(url);
  return account.puuid;
}

// Fetch all ranked matches for a player
async function fetchAllRankedMatches(puuid, count = 100) {
  const url = `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&count=${count}`;
  return await fetchWithRetry(url);
}

// Fetch match details
async function fetchMatchDetails(matchId, puuid) {
  const url = `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const match = await fetchWithRetry(url);

  if (match.info.queueId !== 420) return null; // Solo/Duo only

  const participant = match.info.participants.find(p => p.puuid === puuid);
  if (!participant) return null;

  return {
    matchId: matchId,
    timestamp: new Date(match.info.gameEndTimestamp).toISOString(),
    gameEndTimestamp: match.info.gameEndTimestamp,
    champion: participant.championName,
    championId: participant.championId,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    win: participant.win
  };
}

// Backfill match data for existing history entries
async function backfillMatchData(player, existingHistory, puuid, allMatches) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Backfilling match data: ${player.gameName}#${player.tagLine}`);
  console.log('='.repeat(50));

  // Get player's existing entries without match data
  const playerHistory = existingHistory
    .filter(h => h.game_name === player.gameName && h.tag_line === player.tagLine)
    .filter(h => !h.match_id) // Only entries missing match data
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (playerHistory.length === 0) {
    console.log('No entries need match data backfill');
    return 0;
  }

  console.log(`Found ${playerHistory.length} entries needing match data`);

  let updated = 0;

  for (const entry of playerHistory) {
    const entryTime = new Date(entry.created_at).getTime();

    // Find a match that ended within 30 minutes before this entry
    const matchingMatch = allMatches.find(m => {
      const timeDiff = entryTime - m.gameEndTimestamp;
      return timeDiff >= 0 && timeDiff < 30 * 60 * 1000;
    });

    if (matchingMatch) {
      // Update this entry with match data via POST (creates new entry)
      // Note: Ideally we'd use PATCH/PUT, but we're creating enriched entries
      console.log(`  ${entry.created_at}: ${matchingMatch.champion} ${matchingMatch.kills}/${matchingMatch.deaths}/${matchingMatch.assists}`);

      const body = {
        player_id: `${player.gameName}#${player.tagLine}`,
        game_name: player.gameName,
        tag_line: player.tagLine,
        region: player.region,
        total_lp: entry.total_lp,
        tier: entry.tier,
        rank: entry.rank,
        lp: entry.lp,
        wins: entry.wins || 0,
        losses: entry.losses || 0,
        created_at: entry.created_at,
        // Match data
        match_id: matchingMatch.matchId,
        champion_name: matchingMatch.champion,
        champion_id: matchingMatch.championId,
        kills: matchingMatch.kills,
        deaths: matchingMatch.deaths,
        assists: matchingMatch.assists,
        game_win: matchingMatch.win
      };

      await httpsPost(API_HOST, '/api/history', body);
      updated++;
    }

    await sleep(100);
  }

  console.log(`Updated ${updated} entries with match data`);
  return updated;
}

// Fill gaps in history with new entries (includes match data)
async function fillHistoryGaps(player, existingHistory, puuid, allMatches) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Filling gaps: ${player.gameName}#${player.tagLine}`);
  console.log('='.repeat(50));

  const playerHistory = existingHistory
    .filter(h => h.game_name === player.gameName && h.tag_line === player.tagLine)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (playerHistory.length < 2) {
    console.log('Not enough history points to detect gaps');
    return 0;
  }

  console.log(`Found ${playerHistory.length} existing data points`);

  // Find gaps (LP change > 30 indicates multiple games)
  const gaps = [];
  for (let i = 0; i < playerHistory.length - 1; i++) {
    const current = playerHistory[i];
    const next = playerHistory[i + 1];
    const lpDiff = Math.abs(next.total_lp - current.total_lp);

    if (lpDiff > 30) {
      gaps.push({
        start: { timestamp: current.created_at, totalLP: current.total_lp },
        end: { timestamp: next.created_at, totalLP: next.total_lp },
        lpDiff
      });
    }
  }

  if (gaps.length === 0) {
    console.log('No significant gaps found');
    return 0;
  }

  console.log(`Found ${gaps.length} gaps to fill`);

  let totalAdded = 0;

  for (const gap of gaps) {
    console.log(`\nGap: ${gap.start.totalLP} LP -> ${gap.end.totalLP} LP (${gap.lpDiff} LP diff)`);

    const startTime = new Date(gap.start.timestamp).getTime();
    const endTime = new Date(gap.end.timestamp).getTime();

    // Find matches in this gap
    const matchesInGap = allMatches.filter(m =>
      m.gameEndTimestamp > startTime && m.gameEndTimestamp < endTime
    );

    if (matchesInGap.length === 0) {
      console.log('  No matches found in gap');
      continue;
    }

    // Sort by time
    matchesInGap.sort((a, b) => a.gameEndTimestamp - b.gameEndTimestamp);

    const wins = matchesInGap.filter(m => m.win).length;
    const losses = matchesInGap.filter(m => !m.win).length;
    const totalLPChange = gap.end.totalLP - gap.start.totalLP;

    console.log(`  Found ${matchesInGap.length} matches (${wins}W ${losses}L), Net LP: ${totalLPChange}`);

    // Estimate LP per game
    let lpPerWin = 22, lpPerLoss = 17;
    if (wins > 0 && losses > 0) {
      lpPerWin = Math.round((totalLPChange + losses * lpPerLoss) / wins);
      lpPerWin = Math.max(15, Math.min(30, lpPerWin));
    } else if (wins > 0) {
      lpPerWin = Math.round(totalLPChange / wins);
    } else if (losses > 0) {
      lpPerLoss = Math.round(-totalLPChange / losses);
    }

    // Generate data points
    let currentLP = gap.start.totalLP;

    for (let i = 0; i < matchesInGap.length; i++) {
      const match = matchesInGap[i];

      currentLP += match.win ? lpPerWin : -lpPerLoss;
      if (i === matchesInGap.length - 1) currentLP = gap.end.totalLP;

      const rankInfo = totalLPToRank(currentLP);

      const body = {
        player_id: `${player.gameName}#${player.tagLine}`,
        game_name: player.gameName,
        tag_line: player.tagLine,
        region: player.region,
        total_lp: currentLP,
        tier: rankInfo.tier,
        rank: rankInfo.rank,
        lp: rankInfo.lp,
        wins: 0,
        losses: 0,
        created_at: match.timestamp,
        // Match data
        match_id: match.matchId,
        champion_name: match.champion,
        champion_id: match.championId,
        kills: match.kills,
        deaths: match.deaths,
        assists: match.assists,
        game_win: match.win
      };

      await httpsPost(API_HOST, '/api/history', body);
      process.stdout.write('.');
      totalAdded++;
    }
    console.log(' Done');
  }

  return totalAdded;
}

async function processPlayer(player, existingHistory) {
  try {
    console.log(`\nFetching data for ${player.gameName}...`);

    // Get PUUID
    const puuid = await getPuuid(player);
    console.log('PUUID:', puuid);
    await sleep(500);

    // Fetch all ranked matches
    const matchIds = await fetchAllRankedMatches(puuid, 100);
    console.log(`Found ${matchIds.length} ranked match IDs`);

    // Fetch details for all matches
    const allMatches = [];
    for (const matchId of matchIds) {
      await sleep(150);
      try {
        const match = await fetchMatchDetails(matchId, puuid);
        if (match) allMatches.push(match);
      } catch (err) {
        console.log(`  Error fetching ${matchId}: ${err.message}`);
      }
    }
    console.log(`Fetched ${allMatches.length} Solo/Duo match details`);

    // Sort by timestamp
    allMatches.sort((a, b) => a.gameEndTimestamp - b.gameEndTimestamp);

    // Run backfill operations
    const gapsFilled = await fillHistoryGaps(player, existingHistory, puuid, allMatches);
    const matchDataAdded = await backfillMatchData(player, existingHistory, puuid, allMatches);

    return { gapsFilled, matchDataAdded };
  } catch (err) {
    console.error(`Error processing ${player.gameName}: ${err.message}`);
    return { gapsFilled: 0, matchDataAdded: 0 };
  }
}

async function main() {
  const mode = process.argv[2] || 'all';

  console.log('='.repeat(60));
  console.log('LP TRACKER BACKFILL SCRIPT');
  console.log('='.repeat(60));
  console.log(`Mode: ${mode}`);
  console.log('');

  console.log('Fetching current database history...');
  const existingHistory = await getCurrentHistory();
  console.log(`Found ${existingHistory.length} total entries in database`);

  let totalGaps = 0, totalMatchData = 0;

  for (const player of PLAYERS) {
    const result = await processPlayer(player, existingHistory);
    totalGaps += result.gapsFilled;
    totalMatchData += result.matchDataAdded;
    await sleep(1000);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('COMPLETE');
  console.log(`  Gaps filled: ${totalGaps} new data points`);
  console.log(`  Match data added: ${totalMatchData} entries updated`);
  console.log('='.repeat(60));
}

main();
