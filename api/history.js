const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * LP History API - CRUD operations for player LP tracking data.
 *
 * @route GET /api/history
 * Fetches all LP history entries, ordered by creation date.
 * @returns {Array<LPHistoryEntry>} Array of LP history entries
 *
 * @route POST /api/history
 * Creates a new LP history entry with duplicate prevention.
 * If match_id is provided and already exists for the player, the insert is skipped.
 * @body {LPHistoryEntry} LP history data to save
 * @returns {LPHistoryEntry} The created entry, or {skipped: true} if duplicate
 *
 * @route DELETE /api/history
 * Deletes LP history entries before a specific date for a player.
 * @query {string} player_id - Player identifier
 * @query {string} before_date - ISO date string; entries before this are deleted
 * @returns {Object} Delete result with count and deleted entries
 *
 * @typedef {Object} LPHistoryEntry
 * @property {string} player_id - Unique player identifier
 * @property {string} game_name - Player's Riot game name
 * @property {string} tag_line - Player's Riot tag line
 * @property {string} region - Region code (NA, EUW, etc.)
 * @property {number} total_lp - Calculated total LP
 * @property {string} tier - Rank tier (IRON, BRONZE, etc.)
 * @property {string} rank - Division (I, II, III, IV)
 * @property {number} lp - League points within division
 * @property {number} wins - Total ranked wins
 * @property {number} losses - Total ranked losses
 * @property {string} [created_at] - ISO timestamp (auto-generated if not provided)
 * @property {string} [match_id] - Associated match ID
 * @property {string} [champion_name] - Champion played
 * @property {number} [champion_id] - Champion ID
 * @property {number} [kills] - Kills in match
 * @property {number} [deaths] - Deaths in match
 * @property {number} [assists] - Assists in match
 * @property {boolean} [game_win] - Whether the game was won
 */
module.exports = async (req, res) => {
  // GET - fetch all history
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('lp_history')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error('Fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch history', details: error.message || error });
    }
  }
  // POST - save new data point
  else if (req.method === 'POST') {
    try {
      const body = req.body;
      console.log('Received body:', JSON.stringify(body));

      if (!body || !body.game_name) {
        return res.status(400).json({ error: 'Missing required fields', received: body });
      }

      // Server-side duplicate prevention: check if match_id already exists for this player
      if (body.match_id && body.player_id) {
        const { data: existing, error: checkError } = await supabase
          .from('lp_history')
          .select('id')
          .eq('player_id', body.player_id)
          .eq('match_id', body.match_id)
          .limit(1);

        if (checkError) {
          console.error('Duplicate check error:', checkError);
        } else if (existing && existing.length > 0) {
          console.log(`Duplicate match_id ${body.match_id} for ${body.player_id} - skipping`);
          return res.json({ skipped: true, reason: 'duplicate_match_id', match_id: body.match_id });
        }
      }

      const { data, error } = await supabase
        .from('lp_history')
        .insert([
          {
            player_id: body.player_id,
            game_name: body.game_name,
            tag_line: body.tag_line,
            region: body.region,
            total_lp: body.total_lp,
            tier: body.tier,
            rank: body.rank,
            lp: body.lp,
            wins: body.wins,
            losses: body.losses,
            created_at: body.created_at || new Date().toISOString(),
            // Match data fields (optional)
            match_id: body.match_id || null,
            champion_name: body.champion_name || null,
            champion_id: body.champion_id || null,
            kills: body.kills ?? null,
            deaths: body.deaths ?? null,
            assists: body.assists ?? null,
            game_win: body.game_win ?? null,
          },
        ])
        .select();

      if (error) {
        console.error('Supabase error:', error);
        return res
          .status(500)
          .json({ error: 'Database error', details: error.message, code: error.code });
      }

      res.json(data[0]);
    } catch (error) {
      console.error('Insert error:', error);
      res
        .status(500)
        .json({ error: 'Failed to save history', details: error.message || String(error) });
    }
  }
  // DELETE - remove entries before a date for a player
  else if (req.method === 'DELETE') {
    try {
      const { player_id, before_date } = req.query;

      if (!player_id || !before_date) {
        return res.status(400).json({ error: 'Missing player_id or before_date query params' });
      }

      const { data, error } = await supabase
        .from('lp_history')
        .delete()
        .eq('player_id', player_id)
        .lt('created_at', before_date)
        .select();

      if (error) {
        console.error('Delete error:', error);
        return res.status(500).json({ error: 'Database error', details: error.message });
      }

      res.json({ deleted: data.length, entries: data });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ error: 'Failed to delete', details: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
