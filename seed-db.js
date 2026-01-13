const https = require('https');

const PRELOADED_PLAYERS = [
  {
    "gameName": "i am sad haha",
    "tagLine": "NA1",
    "region": "NA",
    "soloQueue": { "tier": "GOLD", "rank": "I", "leaguePoints": 85, "wins": 8, "losses": 4 },
    "history": [
      { "timestamp": "2026-01-09T23:01:29.375Z", "totalLP": 1457 },
      { "timestamp": "2026-01-10T21:08:35.162Z", "totalLP": 1439 },
      { "timestamp": "2026-01-10T21:45:05.730Z", "totalLP": 1421 },
      { "timestamp": "2026-01-10T22:31:34.973Z", "totalLP": 1446 },
      { "timestamp": "2026-01-11T19:33:51.496Z", "totalLP": 1471 },
      { "timestamp": "2026-01-11T20:23:06.645Z", "totalLP": 1496 },
      { "timestamp": "2026-01-11T22:10:28.380Z", "totalLP": 1521 },
      { "timestamp": "2026-01-11T23:21:06.481Z", "totalLP": 1503 },
      { "timestamp": "2026-01-12T20:34:28.049Z", "totalLP": 1528 },
      { "timestamp": "2026-01-12T21:04:11.014Z", "totalLP": 1553 },
      { "timestamp": "2026-01-12T21:38:29.350Z", "totalLP": 1535 },
      { "timestamp": "2026-01-12T22:11:19.593Z", "totalLP": 1560 },
      { "timestamp": "2026-01-13T07:10:40.549Z", "totalLP": 1585 }
    ]
  },
  {
    "gameName": "xty",
    "tagLine": "001",
    "region": "NA",
    "soloQueue": { "tier": "SILVER", "rank": "III", "leaguePoints": 95, "wins": 3, "losses": 8 },
    "history": [
      { "timestamp": "2026-01-09T21:30:40.645Z", "totalLP": 1064 },
      { "timestamp": "2026-01-09T22:07:54.635Z", "totalLP": 1046 },
      { "timestamp": "2026-01-09T22:46:03.349Z", "totalLP": 1071 },
      { "timestamp": "2026-01-10T00:54:30.345Z", "totalLP": 1053 },
      { "timestamp": "2026-01-10T19:28:31.318Z", "totalLP": 1078 },
      { "timestamp": "2026-01-11T14:38:53.840Z", "totalLP": 1060 },
      { "timestamp": "2026-01-11T16:38:02.677Z", "totalLP": 1085 },
      { "timestamp": "2026-01-11T17:17:47.652Z", "totalLP": 1067 },
      { "timestamp": "2026-01-13T01:38:30.021Z", "totalLP": 1049 },
      { "timestamp": "2026-01-13T02:12:30.502Z", "totalLP": 1031 },
      { "timestamp": "2026-01-13T02:51:26.138Z", "totalLP": 1013 },
      { "timestamp": "2026-01-13T07:10:45.146Z", "totalLP": 995 }
    ]
  },
  {
    "gameName": "TwoWeekTimeout",
    "tagLine": "NA1",
    "region": "NA",
    "soloQueue": { "tier": "PLATINUM", "rank": "III", "leaguePoints": 42, "wins": 21, "losses": 20 },
    "history": [
      { "timestamp": "2026-01-09T16:12:38.954Z", "totalLP": 1570 },
      { "timestamp": "2026-01-10T21:47:34.465Z", "totalLP": 1543 },
      { "timestamp": "2026-01-11T17:21:50.289Z", "totalLP": 1725 },
      { "timestamp": "2026-01-12T02:41:16.933Z", "totalLP": 1746 },
      { "timestamp": "2026-01-13T07:10:59.559Z", "totalLP": 1742 }
    ]
  },
  {
    "gameName": "Tortle",
    "tagLine": "Druid",
    "region": "NA",
    "soloQueue": { "tier": "GOLD", "rank": "III", "leaguePoints": 55, "wins": 15, "losses": 8 },
    "history": [
      { "timestamp": "2026-01-09T21:54:02.385Z", "totalLP": 1160 },
      { "timestamp": "2026-01-10T10:53:57.373Z", "totalLP": 1274 },
      { "timestamp": "2026-01-11T01:45:08.321Z", "totalLP": 1395 },
      { "timestamp": "2026-01-12T09:44:08.194Z", "totalLP": 1330 },
      { "timestamp": "2026-01-13T07:11:08.447Z", "totalLP": 1355 }
    ]
  },
  {
    "gameName": "Keebles",
    "tagLine": "6969",
    "region": "NA",
    "soloQueue": { "tier": "GOLD", "rank": "IV", "leaguePoints": 90, "wins": 9, "losses": 7 },
    "history": [
      { "timestamp": "2026-01-11T04:09:00.000Z", "totalLP": 1155 },
      { "timestamp": "2026-01-12T00:30:00.000Z", "totalLP": 1215 },
      { "timestamp": "2026-01-13T01:18:00.000Z", "totalLP": 1290 }
    ]
  },
  {
    "gameName": "Cedric Dube",
    "tagLine": "420",
    "region": "NA",
    "soloQueue": { "tier": "GOLD", "rank": "III", "leaguePoints": 70, "wins": 11, "losses": 5 },
    "history": [
      { "timestamp": "2026-01-12T09:15:08.000Z", "totalLP": 1185 },
      { "timestamp": "2026-01-12T15:30:59.000Z", "totalLP": 1210 },
      { "timestamp": "2026-01-13T02:00:00.000Z", "totalLP": 1285 },
      { "timestamp": "2026-01-13T07:00:00.000Z", "totalLP": 1370 }
    ]
  },
  {
    "gameName": "Humble White Boy",
    "tagLine": "666",
    "region": "NA",
    "soloQueue": { "tier": "PLATINUM", "rank": "III", "leaguePoints": 40, "wins": 9, "losses": 14 },
    "history": [
      { "timestamp": "2026-01-09T12:00:00.000Z", "totalLP": 1655 },
      { "timestamp": "2026-01-10T12:00:00.000Z", "totalLP": 1645 },
      { "timestamp": "2026-01-11T12:00:00.000Z", "totalLP": 1655 },
      { "timestamp": "2026-01-12T12:00:00.000Z", "totalLP": 1630 },
      { "timestamp": "2026-01-13T07:00:00.000Z", "totalLP": 1740 }
    ]
  }
];

async function postData(data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: 'www.liftedf250.lol',
      path: '/api/history',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function seed() {
  let count = 0;
  for (const player of PRELOADED_PLAYERS) {
    for (const entry of player.history) {
      const data = {
        player_id: player.gameName + '#' + player.tagLine,
        game_name: player.gameName,
        tag_line: player.tagLine,
        region: player.region,
        total_lp: entry.totalLP,
        tier: player.soloQueue.tier,
        rank: player.soloQueue.rank,
        lp: player.soloQueue.leaguePoints,
        wins: player.soloQueue.wins,
        losses: player.soloQueue.losses
      };
      try {
        await postData(data);
        count++;
        process.stdout.write('.');
      } catch (e) {
        console.error('Error:', e.message);
      }
    }
  }
  console.log('\nSeeded ' + count + ' entries');
}

seed();
