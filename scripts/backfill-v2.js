/**
 * Backfill v2 - Updates existing entries with match data
 * Uses Supabase directly to UPDATE (not INSERT)
 */
const https = require('https');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!RIOT_API_KEY) {
  console.error('RIOT_API_KEY not found');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL or SUPABASE_KEY not found');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// All tracked players
const PLAYERS = [
  { gameName: 'i am sad haha', tagLine: 'NA1', region: 'NA' },
  { gameName: 'xty', tagLine: '001', region: 'NA' },
  { gameName: 'TwoWeekTimeout', tagLine: 'NA1', region: 'NA' },
  { gameName: 'Tortle', tagLine: 'Druid', region: 'NA' },
  { gameName: 'Keebles', tagLine: '6969', region: 'NA' },
  { gameName: 'Cedric Dube', tagLine: '420', region: 'NA' },
  { gameName: 'Humble White Boy', tagLine: '666', region: 'NA' },
  { gameName: 'Bugz', tagLine: '0627', region: 'NA' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'X-Riot-Token': RIOT_API_KEY, ...headers } };
    https
      .get(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else if (res.statusCode === 429) {
            reject(new Error('RATE_LIMITED'));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      })
      .on('error', reject);
  });
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await httpsGet(url);
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        console.log('    Rate limited, waiting 15s...');
        await sleep(15000);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

async function getPuuid(player) {
  const url = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`;
  const account = await fetchWithRetry(url);
  return account.puuid;
}

async function fetchAllRankedMatches(puuid, count = 100) {
  const url = `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&count=${count}`;
  return await fetchWithRetry(url);
}

async function fetchMatchDetails(matchId, puuid) {
  const url = `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const match = await fetchWithRetry(url);

  if (match.info.queueId !== 420) return null; // Solo/Duo only

  const participant = match.info.participants.find((p) => p.puuid === puuid);
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
    win: participant.win,
  };
}

async function processPlayer(player) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Processing: ${player.gameName}#${player.tagLine}`);
  console.log('='.repeat(50));

  try {
    // Get PUUID
    const puuid = await getPuuid(player);
    console.log('PUUID:', puuid);
    await sleep(500);

    // Get player's entries from database that need match data
    const { data: entries, error: fetchError } = await supabase
      .from('lp_history')
      .select('*')
      .eq('game_name', player.gameName)
      .eq('tag_line', player.tagLine)
      .is('match_id', null)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;

    console.log(`Found ${entries.length} entries without match data`);

    if (entries.length === 0) {
      return { updated: 0, failed: 0 };
    }

    // Fetch match history
    const matchIds = await fetchAllRankedMatches(puuid, 100);
    console.log(`Found ${matchIds.length} ranked match IDs`);

    // Fetch all match details
    const allMatches = [];
    for (const matchId of matchIds) {
      await sleep(200); // Rate limit safety
      try {
        const match = await fetchMatchDetails(matchId, puuid);
        if (match) allMatches.push(match);
      } catch (err) {
        if (err.message === 'RATE_LIMITED') {
          console.log('Rate limited on match details, waiting 20s...');
          await sleep(20000);
          // Retry this match
          try {
            const match = await fetchMatchDetails(matchId, puuid);
            if (match) allMatches.push(match);
          } catch (e) {
            console.log(`  Skipping ${matchId}: ${e.message}`);
          }
        } else {
          console.log(`  Error fetching ${matchId}: ${err.message}`);
        }
      }
    }
    console.log(`Fetched ${allMatches.length} Solo/Duo match details`);

    // Sort matches by timestamp (oldest first)
    allMatches.sort((a, b) => a.gameEndTimestamp - b.gameEndTimestamp);

    // For each entry, find the best matching game
    let updated = 0;
    let failed = 0;

    for (const entry of entries) {
      const entryTime = new Date(entry.created_at).getTime();

      // Find match that ended BEFORE this entry
      // Use a wider window: up to 2 hours before (in case of delayed refresh)
      // But prefer matches closer to the entry time
      const candidates = allMatches.filter((m) => {
        const timeDiff = entryTime - m.gameEndTimestamp;
        return timeDiff >= 0 && timeDiff < 2 * 60 * 60 * 1000; // 2 hours
      });

      // Sort by closest to entry time
      candidates.sort((a, b) => {
        const diffA = entryTime - a.gameEndTimestamp;
        const diffB = entryTime - b.gameEndTimestamp;
        return diffA - diffB; // Smaller diff = closer match
      });

      const matchingMatch = candidates[0];

      if (matchingMatch) {
        // UPDATE the entry with match data
        const { error: updateError } = await supabase
          .from('lp_history')
          .update({
            match_id: matchingMatch.matchId,
            champion_name: matchingMatch.champion,
            champion_id: matchingMatch.championId,
            kills: matchingMatch.kills,
            deaths: matchingMatch.deaths,
            assists: matchingMatch.assists,
            game_win: matchingMatch.win,
          })
          .eq('id', entry.id);

        if (updateError) {
          console.log(`  Failed to update entry ${entry.id}: ${updateError.message}`);
          failed++;
        } else {
          const winLoss = matchingMatch.win ? 'W' : 'L';
          console.log(
            `  [${entry.id}] ${matchingMatch.champion} ${matchingMatch.kills}/${matchingMatch.deaths}/${matchingMatch.assists} ${winLoss}`
          );
          updated++;

          // Remove this match from allMatches so it's not reused
          const matchIndex = allMatches.indexOf(matchingMatch);
          if (matchIndex > -1) allMatches.splice(matchIndex, 1);
        }
      } else {
        console.log(`  [${entry.id}] No match found for ${entry.created_at}`);
        failed++;
      }

      await sleep(50);
    }

    return { updated, failed };
  } catch (err) {
    console.error(`Error processing ${player.gameName}: ${err.message}`);
    return { updated: 0, failed: 0 };
  }
}

async function main() {
  const playerArg = process.argv[2];

  console.log('='.repeat(60));
  console.log('LP TRACKER BACKFILL v2 (UPDATE MODE)');
  console.log('='.repeat(60));
  console.log('');

  let playersToProcess = PLAYERS;

  if (playerArg) {
    playersToProcess = PLAYERS.filter((p) =>
      p.gameName.toLowerCase().includes(playerArg.toLowerCase())
    );
    if (playersToProcess.length === 0) {
      console.log(`No player found matching "${playerArg}"`);
      process.exit(1);
    }
  }

  console.log(`Processing ${playersToProcess.length} player(s)...\n`);

  let totalUpdated = 0;
  let totalFailed = 0;

  for (const player of playersToProcess) {
    const result = await processPlayer(player);
    totalUpdated += result.updated;
    totalFailed += result.failed;
    await sleep(2000); // Delay between players
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('COMPLETE');
  console.log(`  Updated: ${totalUpdated} entries`);
  console.log(`  No match found: ${totalFailed} entries`);
  console.log('='.repeat(60));
}

main();
