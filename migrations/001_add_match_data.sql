-- Migration: Add match data columns to lp_history table
-- Run this in Supabase SQL Editor

ALTER TABLE lp_history ADD COLUMN IF NOT EXISTS match_id TEXT;
ALTER TABLE lp_history ADD COLUMN IF NOT EXISTS champion_name TEXT;
ALTER TABLE lp_history ADD COLUMN IF NOT EXISTS champion_id INTEGER;
ALTER TABLE lp_history ADD COLUMN IF NOT EXISTS kills INTEGER;
ALTER TABLE lp_history ADD COLUMN IF NOT EXISTS deaths INTEGER;
ALTER TABLE lp_history ADD COLUMN IF NOT EXISTS assists INTEGER;
ALTER TABLE lp_history ADD COLUMN IF NOT EXISTS game_win BOOLEAN;

-- Index for match_id lookups
CREATE INDEX IF NOT EXISTS idx_lp_history_match_id ON lp_history(match_id);
