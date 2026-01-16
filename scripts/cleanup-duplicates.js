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

function httpsRequest(method, hostname, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('DATABASE DUPLICATE CLEANUP');
  console.log('='.repeat(60));
  console.log('');

  // Fetch all history
  console.log('Fetching all history from database...');
  const history = await httpsGet(`https://${API_HOST}/api/history`);
  console.log(`Found ${history.length} total entries\n`);

  // Group by player
  const playerGroups = new Map();
  history.forEach((entry) => {
    const key = `${entry.game_name}#${entry.tag_line}`;
    if (!playerGroups.has(key)) {
      playerGroups.set(key, []);
    }
    playerGroups.get(key).push(entry);
  });

  console.log(`Found ${playerGroups.size} players\n`);

  // Find duplicates for each player
  let totalDuplicates = 0;
  const toDelete = [];

  for (const [playerKey, entries] of playerGroups) {
    // Group by timestamp + total_lp (duplicate key)
    const dedupGroups = new Map();

    entries.forEach((entry) => {
      const dedupKey = `${entry.created_at}_${entry.total_lp}`;
      if (!dedupGroups.has(dedupKey)) {
        dedupGroups.set(dedupKey, []);
      }
      dedupGroups.get(dedupKey).push(entry);
    });

    // Find groups with more than one entry (duplicates)
    let playerDupes = 0;
    for (const [dedupKey, group] of dedupGroups) {
      if (group.length > 1) {
        // Sort: entries WITH match_id first
        group.sort((a, b) => {
          if (a.match_id && !b.match_id) return -1;
          if (!a.match_id && b.match_id) return 1;
          return 0;
        });

        // Keep the first one (has match data if any do), delete the rest
        const keep = group[0];
        const deleteThese = group.slice(1);

        deleteThese.forEach((entry) => {
          toDelete.push(entry);
          playerDupes++;
        });
      }
    }

    if (playerDupes > 0) {
      console.log(`${playerKey}: ${playerDupes} duplicates found`);
      totalDuplicates += playerDupes;
    }
  }

  console.log(`\nTotal duplicates to delete: ${totalDuplicates}`);

  if (totalDuplicates === 0) {
    console.log('\nNo duplicates found! Database is clean.');
    return;
  }

  // Group deletions by ID for efficient deletion
  console.log('\nDuplicate entries to delete:');
  toDelete.forEach((entry, i) => {
    if (i < 10) {
      console.log(
        `  [${entry.id}] ${entry.game_name} @ ${entry.created_at} - ${entry.total_lp} LP ${entry.match_id ? '(has match)' : '(no match)'}`
      );
    }
  });
  if (toDelete.length > 10) {
    console.log(`  ... and ${toDelete.length - 10} more`);
  }

  // Confirm deletion
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question('\nProceed with deletion? (yes/no): ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('Aborted.');
    return;
  }

  // Delete duplicates
  // Note: We need to delete by ID, but the current API only supports delete by player_id + before_date
  // We'll need to use Supabase directly or modify the API

  console.log('\nTo delete these entries, run this SQL in Supabase:');
  console.log('');
  console.log('DELETE FROM lp_history WHERE id IN (');

  const ids = toDelete.map((e) => `  '${e.id}'`);
  // Print in batches to avoid too long output
  const batchSize = 50;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    if (i + batchSize < ids.length) {
      console.log(batch.join(',\n') + ',');
    } else {
      console.log(batch.join(',\n'));
    }
  }
  console.log(');');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Copy the SQL above and run it in Supabase SQL Editor`);
  console.log('='.repeat(60));
}

main().catch(console.error);
