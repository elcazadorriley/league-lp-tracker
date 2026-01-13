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

      const { data, error } = await supabase
        .from('lp_history')
        .insert([{
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
          created_at: new Date().toISOString()
        }])
        .select();

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Database error', details: error.message, code: error.code });
      }

      res.json(data[0]);
    } catch (error) {
      console.error('Insert error:', error);
      res.status(500).json({ error: 'Failed to save history', details: error.message || String(error) });
    }
  }
  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
