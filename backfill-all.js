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
  { gameName: 'Humble White Boy', tagLine: '666', region: 'NA' }
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'X-Riot-Token': RIOT_API_KEY } }, (res) => {
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
      res.on('end', () => resolve(data));
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
  const response = await new Promise((resolve, reject) => {
    https.get('https://www.liftedf250.lol/api/history', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
  return response;
}

async function backfillPlayer(player, existingHistory) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Processing: ${player.gameName}#${player.tagLine}`);
  console.log('='.repeat(50));

  // Get player's existing data points
  const playerHistory = existingHistory
    .filter(h => h.game_name === player.gameName && h.tag_line === player.tagLine)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (playerHistory.length < 2) {
    console.log('Not enough history points to detect gaps');
    return 0;
  }

  console.log(`Found ${playerHistory.length} existing data points`);

  // Get PUUID
  console.log('Fetching PUUID...');
  const accountUrl = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`;
  const account = await fetchWithRetry(accountUrl);
  const puuid = account.puuid;
  console.log('PUUID:', puuid);

  await sleep(500);

  // Get match history
  console.log('Fetching match history...');
  const matchListUrl = `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&count=100`;
  const matchIds = await fetchWithRetry(matchListUrl);
  console.log(`Found ${matchIds.length} ranked matches`);

  // Find gaps in history (where LP change > 30 indicates multiple games)
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
    console.log(`  From: ${gap.start.timestamp}`);
    console.log(`  To:   ${gap.end.timestamp}`);

    const startTime = new Date(gap.start.timestamp).getTime();
    const endTime = new Date(gap.end.timestamp).getTime();

    // Find matches in this gap
    const matchesInGap = [];

    for (const matchId of matchIds) {
      await sleep(150); // Rate limit protection

      try {
        const matchUrl = `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`;
        const match = await fetchWithRetry(matchUrl);

        const gameEnd = match.info.gameEndTimestamp;

        if (gameEnd > startTime && gameEnd < endTime && match.info.queueId === 420) {
          const participant = match.info.participants.find(p => p.puuid === puuid);
          if (participant) {
            matchesInGap.push({
              timestamp: new Date(gameEnd).toISOString(),
              win: participant.win
            });
            console.log(`  Found: ${new Date(gameEnd).toISOString()} - ${participant.win ? 'WIN' : 'LOSS'}`);
          }
        }

        // If match is older than our gap start, stop searching
        if (match.info.gameEndTimestamp < startTime) {
          break;
        }
      } catch (err) {
        console.log(`  Error fetching match: ${err.message}`);
      }
    }

    if (matchesInGap.length === 0) {
      console.log('  No matches found in gap');
      continue;
    }

    // Sort matches by time
    matchesInGap.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Calculate LP per game to match the known endpoints
    const totalLPChange = gap.end.totalLP - gap.start.totalLP;
    const wins = matchesInGap.filter(m => m.win).length;
    const losses = matchesInGap.filter(m => !m.win).length;

    console.log(`  Matches: ${wins}W ${losses}L, Net LP: ${totalLPChange}`);

    // Estimate LP values
    // If wins*avgWin - losses*avgLoss = totalLPChange
    // Assume avgLoss = 17, solve for avgWin
    let lpPerWin = 23;
    let lpPerLoss = 17;

    if (wins > 0 && losses > 0) {
      // Solve: wins * lpPerWin - losses * lpPerLoss = totalLPChange
      lpPerWin = Math.round((totalLPChange + losses * lpPerLoss) / wins);
      if (lpPerWin < 15) lpPerWin = 15;
      if (lpPerWin > 30) lpPerWin = 30;
    } else if (wins > 0) {
      lpPerWin = Math.round(totalLPChange / wins);
    } else if (losses > 0) {
      lpPerLoss = Math.round(-totalLPChange / losses);
    }

    // Generate intermediate points
    let currentLP = gap.start.totalLP;
    const newPoints = [];

    for (let i = 0; i < matchesInGap.length; i++) {
      const match = matchesInGap[i];

      if (match.win) {
        currentLP += lpPerWin;
      } else {
        currentLP -= lpPerLoss;
      }

      // Last point should match known end
      if (i === matchesInGap.length - 1) {
        currentLP = gap.end.totalLP;
      }

      newPoints.push({
        timestamp: match.timestamp,
        totalLP: currentLP
      });
    }

    // Save to database
    console.log(`  Saving ${newPoints.length} new data points...`);
    for (const point of newPoints) {
      const tier = point.totalLP >= 2000 ? 'EMERALD' :
                   point.totalLP >= 1600 ? 'PLATINUM' :
                   point.totalLP >= 1200 ? 'GOLD' :
                   point.totalLP >= 800 ? 'SILVER' : 'BRONZE';

      const tierBase = point.totalLP >= 2000 ? 2000 :
                       point.totalLP >= 1600 ? 1600 :
                       point.totalLP >= 1200 ? 1200 :
                       point.totalLP >= 800 ? 800 : 400;

      const lpInTier = point.totalLP - tierBase;
      const division = lpInTier >= 300 ? 'I' : lpInTier >= 200 ? 'II' : lpInTier >= 100 ? 'III' : 'IV';
      const lp = lpInTier % 100;

      const body = {
        player_id: `${player.gameName}#${player.tagLine}`,
        game_name: player.gameName,
        tag_line: player.tagLine,
        region: player.region,
        total_lp: point.totalLP,
        tier: tier,
        rank: division,
        lp: lp,
        wins: 0,
        losses: 0,
        created_at: point.timestamp
      };

      await httpsPost('www.liftedf250.lol', '/api/history', body);
      process.stdout.write('.');
      totalAdded++;
    }
    console.log(' Done');
  }

  return totalAdded;
}

async function main() {
  console.log('Fetching current database history...');
  const existingHistory = await getCurrentHistory();
  console.log(`Found ${existingHistory.length} total entries in database`);

  let grandTotal = 0;

  for (const player of PLAYERS) {
    try {
      const added = await backfillPlayer(player, existingHistory);
      grandTotal += added;
    } catch (err) {
      console.error(`Error processing ${player.gameName}: ${err.message}`);
    }

    await sleep(1000); // Pause between players
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`COMPLETE: Added ${grandTotal} total data points`);
  console.log('='.repeat(50));
}

main();
