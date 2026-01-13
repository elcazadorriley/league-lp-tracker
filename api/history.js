const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  }
  // POST - save new data point
  else if (req.method === 'POST') {
    try {
      const { player_id, game_name, tag_line, region, total_lp, tier, rank, lp, wins, losses } = req.body;

      const { data, error } = await supabase
        .from('lp_history')
        .insert([{
          player_id,
          game_name,
          tag_line,
          region,
          total_lp,
          tier,
          rank,
          lp,
          wins,
          losses
        }])
        .select();

      if (error) throw error;
      res.json(data[0]);
    } catch (error) {
      console.error('Insert error:', error);
      res.status(500).json({ error: 'Failed to save history' });
    }
  }
  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
