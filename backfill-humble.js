const https = require('https');

// Humble White Boy's info
const PLAYER = {
  gameName: 'Humble White Boy',
  tagLine: '666',
  region: 'NA'
};

// Known data points
const KNOWN_START = { timestamp: '2026-01-12T12:00:00.000Z', totalLP: 1630 };
const KNOWN_END = { timestamp: '2026-01-13T07:00:00.000Z', totalLP: 1740 };

const RIOT_API_KEY = process.env.RIOT_API_KEY;

if (!RIOT_API_KEY) {
  console.error('RIOT_API_KEY environment variable not set');
  console.log('Run: set RIOT_API_KEY=your_key_here');
  process.exit(1);
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'X-Riot-Token': RIOT_API_KEY } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
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

async function backfill() {
  try {
    console.log('Fetching PUUID for', PLAYER.gameName);

    // Get PUUID
    const accountUrl = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(PLAYER.gameName)}/${encodeURIComponent(PLAYER.tagLine)}`;
    const account = await httpsGet(accountUrl);
    const puuid = account.puuid;
    console.log('PUUID:', puuid);

    // Get match history (last 100 ranked games)
    const matchListUrl = `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&count=100`;
    const matchIds = await httpsGet(matchListUrl);
    console.log('Found', matchIds.length, 'ranked matches');

    // Filter matches in our time window
    const startTime = new Date(KNOWN_START.timestamp).getTime();
    const endTime = new Date(KNOWN_END.timestamp).getTime();

    const relevantMatches = [];

    for (const matchId of matchIds) {
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));

      const matchUrl = `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`;
      const match = await httpsGet(matchUrl);

      const gameEnd = match.info.gameEndTimestamp;

      if (gameEnd > startTime && gameEnd < endTime) {
        // Find the player in participants
        const participant = match.info.participants.find(p => p.puuid === puuid);
        if (participant && match.info.queueId === 420) { // 420 = Solo/Duo ranked
          relevantMatches.push({
            matchId,
            timestamp: new Date(gameEnd).toISOString(),
            win: participant.win,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists
          });
          console.log(`  ${new Date(gameEnd).toISOString()} - ${participant.win ? 'WIN' : 'LOSS'}`);
        }
      }
    }

    // Sort by timestamp
    relevantMatches.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log('\nFound', relevantMatches.length, 'games in time window');

    if (relevantMatches.length === 0) {
      console.log('No matches found in the time window');
      return;
    }

    // Calculate LP progression
    // Total LP change: 1740 - 1630 = 110 LP
    // We need to distribute this across the matches
    const totalLPChange = KNOWN_END.totalLP - KNOWN_START.totalLP; // 110
    const wins = relevantMatches.filter(m => m.win).length;
    const losses = relevantMatches.filter(m => !m.win).length;

    console.log(`Wins: ${wins}, Losses: ${losses}, Net LP: ${totalLPChange}`);

    // Estimate: wins give ~22 LP, losses lose ~18 LP on average
    // Solve: 22*wins - 18*losses = 110
    // If that doesn't work, adjust
    let lpPerWin = 22;
    let lpPerLoss = 18;

    // Calculate what LP changes would give us the right total
    // wins * lpPerWin - losses * lpPerLoss = totalLPChange
    // We can adjust lpPerWin to make it work
    if (wins > 0) {
      lpPerWin = Math.round((totalLPChange + losses * lpPerLoss) / wins);
    }

    console.log(`Estimated LP per win: ${lpPerWin}, LP per loss: ${lpPerLoss}`);

    // Generate data points
    let currentLP = KNOWN_START.totalLP;
    const dataPoints = [];

    for (const match of relevantMatches) {
      if (match.win) {
        currentLP += lpPerWin;
      } else {
        currentLP -= lpPerLoss;
      }

      dataPoints.push({
        timestamp: match.timestamp,
        totalLP: currentLP
      });
    }

    // Adjust last point to match known end
    if (dataPoints.length > 0) {
      dataPoints[dataPoints.length - 1].totalLP = KNOWN_END.totalLP;
    }

    console.log('\nGenerated data points:');
    dataPoints.forEach(dp => {
      console.log(`  ${dp.timestamp}: ${dp.totalLP} LP`);
    });

    // Save to database
    console.log('\nSaving to database...');
    for (const dp of dataPoints) {
      const body = {
        player_id: `${PLAYER.gameName}#${PLAYER.tagLine}`,
        game_name: PLAYER.gameName,
        tag_line: PLAYER.tagLine,
        region: PLAYER.region,
        total_lp: dp.totalLP,
        tier: 'PLATINUM',
        rank: dp.totalLP >= 1700 ? 'III' : 'IV',
        lp: dp.totalLP >= 1700 ? dp.totalLP - 1700 : dp.totalLP - 1600,
        wins: 9,
        losses: 14,
        created_at: dp.timestamp
      };

      await httpsPost('www.liftedf250.lol', '/api/history', body);
      process.stdout.write('.');
    }

    console.log('\nDone! Added', dataPoints.length, 'data points');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

backfill();
