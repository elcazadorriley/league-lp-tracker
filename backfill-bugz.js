const https = require('https');
require('dotenv').config();

const RIOT_API_KEY = process.env.RIOT_API_KEY;

if (!RIOT_API_KEY) {
  console.error('RIOT_API_KEY not found. Set RIOT_API_KEY environment variable.');
  process.exit(1);
}

const PLAYER = { gameName: 'Bugz', tagLine: '0627', region: 'NA' };

// Current known state (just fetched)
const CURRENT_LP = 1691; // Platinum IV 91 LP

const RANK_VALUES = {
  'IRON': 0, 'BRONZE': 400, 'SILVER': 800, 'GOLD': 1200,
  'PLATINUM': 1600, 'EMERALD': 2000, 'DIAMOND': 2400,
  'MASTER': 2800, 'GRANDMASTER': 3200, 'CHALLENGER': 3600
};

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
        console.log('  Rate limited, waiting 10s...');
        await sleep(10000);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

function totalLPToRank(totalLP) {
  if (totalLP >= 2800) return { tier: 'MASTER', rank: '', lp: totalLP - 2800 };
  if (totalLP >= 2400) return { tier: 'DIAMOND', rank: ['IV', 'III', 'II', 'I'][Math.floor((totalLP - 2400) / 100)], lp: totalLP % 100 };
  if (totalLP >= 2000) return { tier: 'EMERALD', rank: ['IV', 'III', 'II', 'I'][Math.floor((totalLP - 2000) / 100)], lp: totalLP % 100 };
  if (totalLP >= 1600) return { tier: 'PLATINUM', rank: ['IV', 'III', 'II', 'I'][Math.floor((totalLP - 1600) / 100)], lp: totalLP % 100 };
  if (totalLP >= 1200) return { tier: 'GOLD', rank: ['IV', 'III', 'II', 'I'][Math.floor((totalLP - 1200) / 100)], lp: totalLP % 100 };
  if (totalLP >= 800) return { tier: 'SILVER', rank: ['IV', 'III', 'II', 'I'][Math.floor((totalLP - 800) / 100)], lp: totalLP % 100 };
  if (totalLP >= 400) return { tier: 'BRONZE', rank: ['IV', 'III', 'II', 'I'][Math.floor((totalLP - 400) / 100)], lp: totalLP % 100 };
  return { tier: 'IRON', rank: ['IV', 'III', 'II', 'I'][Math.floor(totalLP / 100)], lp: totalLP % 100 };
}

async function backfill() {
  try {
    console.log(`Backfilling match history for ${PLAYER.gameName}#${PLAYER.tagLine}...`);

    // Get PUUID
    const accountUrl = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(PLAYER.gameName)}/${encodeURIComponent(PLAYER.tagLine)}`;
    const account = await fetchWithRetry(accountUrl);
    const puuid = account.puuid;
    console.log('PUUID:', puuid);

    await sleep(500);

    // Get ranked match history (last 50 games)
    const matchListUrl = `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&count=50`;
    const matchIds = await fetchWithRetry(matchListUrl);
    console.log(`Found ${matchIds.length} ranked matches`);

    // Fetch match details
    const matches = [];
    for (const matchId of matchIds) {
      await sleep(150);
      try {
        const matchUrl = `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`;
        const match = await fetchWithRetry(matchUrl);

        // Only Solo/Duo (queue 420)
        if (match.info.queueId === 420) {
          const participant = match.info.participants.find(p => p.puuid === puuid);
          if (participant) {
            matches.push({
              timestamp: new Date(match.info.gameEndTimestamp).toISOString(),
              win: participant.win
            });
            console.log(`  ${new Date(match.info.gameEndTimestamp).toISOString()} - ${participant.win ? 'WIN' : 'LOSS'}`);
          }
        }
      } catch (err) {
        console.log(`  Error fetching match ${matchId}: ${err.message}`);
      }
    }

    if (matches.length === 0) {
      console.log('No Solo/Duo matches found');
      return;
    }

    // Sort oldest to newest
    matches.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    console.log(`\nFound ${matches.length} Solo/Duo matches`);

    // Work backwards from current LP to estimate history
    // Assume avg +22 for wins, -18 for losses
    const lpPerWin = 22;
    const lpPerLoss = 18;

    // Calculate starting LP by working backwards
    let startingLP = CURRENT_LP;
    for (let i = matches.length - 1; i >= 0; i--) {
      if (matches[i].win) {
        startingLP -= lpPerWin;
      } else {
        startingLP += lpPerLoss;
      }
    }

    console.log(`Estimated starting LP: ${startingLP}`);

    // Now work forward to generate data points
    let currentLP = startingLP;
    const dataPoints = [];

    for (const match of matches) {
      if (match.win) {
        currentLP += lpPerWin;
      } else {
        currentLP -= lpPerLoss;
      }

      // Ensure LP doesn't go negative
      if (currentLP < 0) currentLP = 0;

      dataPoints.push({
        timestamp: match.timestamp,
        totalLP: currentLP
      });
    }

    // Adjust final point to match known current LP
    if (dataPoints.length > 0) {
      dataPoints[dataPoints.length - 1].totalLP = CURRENT_LP;
    }

    console.log('\nGenerated data points:');
    dataPoints.forEach(dp => {
      const rank = totalLPToRank(dp.totalLP);
      console.log(`  ${dp.timestamp}: ${dp.totalLP} LP (${rank.tier} ${rank.rank})`);
    });

    // Save to database
    console.log('\nSaving to database...');
    for (const dp of dataPoints) {
      const rank = totalLPToRank(dp.totalLP);

      const body = {
        player_id: `${PLAYER.gameName}#${PLAYER.tagLine}`,
        game_name: PLAYER.gameName,
        tag_line: PLAYER.tagLine,
        region: PLAYER.region,
        total_lp: dp.totalLP,
        tier: rank.tier,
        rank: rank.rank || 'I',
        lp: rank.lp,
        wins: 0,
        losses: 0,
        created_at: dp.timestamp
      };

      await httpsPost('www.liftedf250.lol', '/api/history', body);
      process.stdout.write('.');
    }

    console.log(`\nDone! Added ${dataPoints.length} data points for ${PLAYER.gameName}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

backfill();
