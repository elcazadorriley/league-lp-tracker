# LP Tracker

## Quick Reference

- **Live:** https://www.liftedf250.lol
- **GitHub:** elcazadorriley/league-lp-tracker
- **DB:** Supabase (orerpnummsjnmiicglgx)

## Current State

- Single community "LIFTED F-250" with 8 players tracking
- Vercel serverless + Supabase Postgres
- Dev API key (expires 24h) - production key pending

## Architecture

- `/api/rank.js` - Riot API proxy
- `/api/history.js` - GET/POST LP history to Supabase
- `/public/app.js` - Chart.js frontend

## Git Remotes

Push to BOTH: `git push origin main && git push vercel main`

## TODO

- [ ] Delete test DB entries (game_name = "test")
- [ ] Production API key approval
- [ ] Communities feature (see ROADMAP-COMMUNITIES.md)
