const https = require('https');

// Player to add
const PLAYER = { gameName: 'Bugz', tagLine: '0627', region: 'NA' };

const RANK_VALUES = {
  IRON: 0,
  BRONZE: 400,
  SILVER: 800,
  GOLD: 1200,
  PLATINUM: 1600,
  EMERALD: 2000,
  DIAMOND: 2400,
  MASTER: 2800,
  GRANDMASTER: 3200,
  CHALLENGER: 3600,
};
const DIVISION_VALUES = { IV: 0, III: 100, II: 200, I: 300 };

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      })
      .on('error', reject);
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
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function addPlayer() {
  try {
    console.log(`Fetching data for ${PLAYER.gameName}#${PLAYER.tagLine}...`);

    // Use the site's API proxy to fetch rank data
    const apiUrl = `https://www.liftedf250.lol/api/rank/${PLAYER.region}/${encodeURIComponent(PLAYER.gameName)}/${encodeURIComponent(PLAYER.tagLine)}`;
    console.log('Calling:', apiUrl);

    const data = await httpsGet(apiUrl);

    if (!data.soloQueue) {
      console.log('Player is not ranked in Solo/Duo queue');
      return;
    }

    const soloQueue = data.soloQueue;
    console.log(`Rank: ${soloQueue.tier} ${soloQueue.rank} ${soloQueue.leaguePoints} LP`);
    console.log(`Record: ${soloQueue.wins}W ${soloQueue.losses}L`);

    // Calculate total LP
    const tierBase = RANK_VALUES[soloQueue.tier] || 0;
    const divisionValue = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(soloQueue.tier)
      ? 0
      : DIVISION_VALUES[soloQueue.rank] || 0;
    const totalLP = tierBase + divisionValue + soloQueue.leaguePoints;

    console.log(`Total LP: ${totalLP}`);

    // Save to database
    const body = {
      player_id: `${PLAYER.gameName}#${PLAYER.tagLine}`,
      game_name: PLAYER.gameName,
      tag_line: PLAYER.tagLine,
      region: PLAYER.region,
      total_lp: totalLP,
      tier: soloQueue.tier,
      rank: soloQueue.rank,
      lp: soloQueue.leaguePoints,
      wins: soloQueue.wins,
      losses: soloQueue.losses,
    };

    console.log('\nSaving to database...');
    const result = await httpsPost('www.liftedf250.lol', '/api/history', body);
    console.log('Response:', result.status, result.data);

    console.log('\nDone! Player added successfully.');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

addPlayer();
