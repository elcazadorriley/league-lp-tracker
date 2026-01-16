const https = require('https');
require('dotenv').config();

const API_HOST = 'www.liftedf250.lol';

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

async function main() {
  console.log('VERIFYING DUPLICATE DETECTION\n');

  const history = await httpsGet(`https://${API_HOST}/api/history`);
  console.log(`Total entries: ${history.length}\n`);

  // Group by player
  const playerGroups = new Map();
  history.forEach((entry) => {
    const key = `${entry.game_name}#${entry.tag_line}`;
    if (!playerGroups.has(key)) playerGroups.set(key, []);
    playerGroups.get(key).push(entry);
  });

  // Check one player in detail
  const testPlayer = 'Humble White Boy#666';
  const entries = playerGroups.get(testPlayer);

  console.log(`=== ${testPlayer} ===`);
  console.log(`Total entries: ${entries.length}\n`);

  // Group by dedupKey
  const dedupGroups = new Map();
  entries.forEach((entry) => {
    const dedupKey = `${entry.created_at}_${entry.total_lp}`;
    if (!dedupGroups.has(dedupKey)) dedupGroups.set(dedupKey, []);
    dedupGroups.get(dedupKey).push(entry);
  });

  console.log(`Unique timestamp+LP combinations: ${dedupGroups.size}`);

  // Show duplicate groups (groups with >1 entry)
  let dupeCount = 0;
  console.log('\n--- DUPLICATE GROUPS (showing first 10) ---\n');

  for (const [dedupKey, group] of dedupGroups) {
    if (group.length > 1) {
      dupeCount++;
      if (dupeCount <= 10) {
        console.log(`Group: ${dedupKey}`);
        group.forEach((e) => {
          const hasMatch = e.match_id ? `YES (${e.champion_name})` : 'NO';
          console.log(`  [${e.id}] match_data: ${hasMatch}`);
        });
        console.log('');
      }
    }
  }

  console.log(`Total duplicate groups: ${dupeCount}`);
  console.log(
    `Total entries to delete: ${Array.from(dedupGroups.values())
      .filter((g) => g.length > 1)
      .reduce((sum, g) => sum + g.length - 1, 0)}`
  );
}

main().catch(console.error);
