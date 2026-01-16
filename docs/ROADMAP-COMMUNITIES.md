# LP Tracker - Communities Feature Roadmap

**Status:** Pending Production API Key
**Last Updated:** January 13, 2026

---

## Vision

Transform LP Tracker from a single hardcoded friend group into a multi-tenant platform where anyone can create and manage their own League community tracker.

---

## User Flows

### New User - Create Community

1. Land on homepage → See "Create Community" / "Join Community" options
2. Click "Create Community"
3. Enter community name + create password
4. Become admin of new community
5. See empty chart + admin panel to add players
6. Add players by Riot ID (GameName#Tag)
7. System fetches initial data and starts tracking

### Existing User - Join Community

1. Land on homepage → Click "Join Community"
2. Enter community name + password (provided by admin)
3. View the community's chart (read-only, no admin panel)
4. Can filter players, toggle views, etc.

### Admin - Manage Community

1. Admin panel visible only to community creator
2. Add new players (Riot ID input)
3. Remove players
4. Regenerate/change community password
5. Delete community

---

## Technical Requirements

### Database Schema Changes

```sql
-- Communities table
CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  admin_token TEXT NOT NULL -- for admin verification
);

-- Link players to communities
CREATE TABLE community_players (
  id SERIAL PRIMARY KEY,
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  game_name TEXT NOT NULL,
  tag_line TEXT NOT NULL,
  region TEXT DEFAULT 'NA',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(community_id, game_name, tag_line)
);

-- Update lp_history to include community
ALTER TABLE lp_history ADD COLUMN community_id UUID REFERENCES communities(id);
CREATE INDEX idx_lp_history_community ON lp_history(community_id);
```

### New API Endpoints

| Endpoint                                 | Method | Purpose                          |
| ---------------------------------------- | ------ | -------------------------------- |
| `/api/community`                         | POST   | Create new community             |
| `/api/community/join`                    | POST   | Verify password & return session |
| `/api/community/[id]/players`            | GET    | List players in community        |
| `/api/community/[id]/players`            | POST   | Add player (admin only)          |
| `/api/community/[id]/players/[playerId]` | DELETE | Remove player (admin only)       |
| `/api/community/[id]/history`            | GET    | Get LP history for community     |

### Frontend Pages

1. **Landing Page** (`/`)
   - Hero section with app description
   - Two CTAs: "Create Community" / "Join Community"
   - Example screenshot/demo

2. **Create Community** (`/create`)
   - Form: Community name, password, confirm password
   - Creates community → redirects to dashboard with admin token

3. **Join Community** (`/join`)
   - Form: Community name, password
   - Validates → redirects to dashboard (read-only)

4. **Dashboard** (`/c/[community-name]`)
   - Current chart view (what we have now)
   - Admin panel (conditionally rendered)
   - Player cards + graph

### Admin Panel UI

```
┌─────────────────────────────────┐
│ ADMIN PANEL                     │
├─────────────────────────────────┤
│ Add Player:                     │
│ [GameName#Tag    ] [Add]        │
│                                 │
│ Current Players:                │
│ ☐ PlayerOne#NA1        [Remove] │
│ ☐ PlayerTwo#1234       [Remove] │
│ ☐ PlayerThree#ABC      [Remove] │
│                                 │
│ [Change Password] [Delete Community] │
└─────────────────────────────────┘
```

---

## Session Management

- Use localStorage for community session
- Store: `{ communityId, communityName, isAdmin, adminToken? }`
- Admin token only stored for community creator
- No user accounts - just community-level auth

---

## Migration Path

1. Create new schema alongside existing
2. Create "LIFTED F-250" as first community with existing data
3. Migrate existing `lp_history` entries to new community
4. Deploy new frontend with backwards compatibility
5. Remove hardcoded TRACKED_PLAYERS array

---

## Security Considerations

- Hash community passwords (bcrypt)
- Admin token should be UUID, stored hashed
- Rate limit community creation
- Rate limit player additions (prevent API abuse)
- Validate Riot IDs before adding (check if account exists)

---

## Future Enhancements (Post-MVP)

- [ ] Public/private community toggle
- [ ] Community discovery/browse public communities
- [ ] Multiple admins per community
- [ ] Player stats dashboard (win rate, most played, etc.)
- [ ] Discord webhook notifications for rank changes
- [ ] Community leaderboard/rankings
- [ ] Export data as CSV

---

## Current State (Pre-Production Key)

- ✅ Single community working (LIFTED F-250)
- ✅ 8 players tracked
- ✅ Colorblind-friendly chart
- ✅ OP.GG links on player cards
- ✅ Riot Games disclaimer
- ✅ Domain verification file ready
- ⏳ Awaiting production API key approval

---

## Files to Modify

- `public/index.html` → Add routing/pages
- `public/app.js` → Refactor for multi-community
- `public/styles.css` → Landing page, admin panel styles
- `api/history.js` → Add community filtering
- `api/community.js` → New (create, join, manage)
- `api/rank.js` → No changes needed
- Database → Run migration scripts

---

## Logistical Details

### Riot API Rate Limits (Production Key)

- Production keys typically get: **20 requests/sec**, **100 requests/2min**
- Per player refresh = 3 API calls (Account → Summoner → League)
- A 10-player community refresh = ~30 API calls
- Safe to refresh ~3 communities per minute without hitting limits
- Consider: background job queue for refreshes vs on-demand

### Auto-Refresh Strategy

- Current: 5-minute auto-refresh for single community
- Multi-tenant: Staggered refresh schedule
  - Option A: Each community refreshes on its own 5-min timer (risky at scale)
  - Option B: Global refresh worker cycles through all communities
  - Option C: Only refresh when users are actively viewing (presence-based)
- **Recommendation:** Option C with fallback to hourly background refresh

### Database Considerations (Supabase Free Tier)

- 500MB storage limit
- ~1KB per lp_history row
- 500,000 rows before hitting limit
- At 50 data points/player/day × 10 players × 100 communities = 50K rows/day
- **Need to consider:** Data retention policy, archiving old data

### Vercel Limits (Hobby Plan)

- 100GB bandwidth/month
- Serverless function timeout: 10s (hobby) / 60s (pro)
- Consider: Caching API responses, CDN for static assets

### Cost Projection

| Scale             | Supabase | Vercel  | Notes                 |
| ----------------- | -------- | ------- | --------------------- |
| 10 communities    | Free     | Free    | Current sweet spot    |
| 100 communities   | Free     | Free    | May need data pruning |
| 1000+ communities | ~$25/mo  | ~$20/mo | Pro tiers needed      |

### Riot API Compliance Reminders

- Must display disclaimer (✅ done)
- Cannot charge users for access
- Cannot use data for betting/gambling
- Must cache appropriately (don't hammer API)
- Cannot store raw API responses long-term (only derived data)

### Player Validation Flow

When admin adds a player:

1. Parse Riot ID (split on #)
2. Call Account API to verify exists
3. If 404: Show "Player not found" error
4. If found: Call Summoner + League API
5. If unranked: Warn admin, still allow add (they may place later)
6. If ranked: Save initial data point, add to community

### Edge Cases to Handle

- Player name changes (PUUID stays same, store PUUID?)
- Player transfers regions
- Player hasn't played ranked yet this season
- Community password forgotten (recovery flow?)
- Admin abandons community (orphan cleanup?)
- Duplicate communities (name collision)

---

## Getting Started (When Ready)

1. Get production API key approved
2. Run database migrations
3. Create `/api/community.js` endpoints
4. Build landing page
5. Refactor dashboard for community context
6. Add admin panel component
7. Test with new community
8. Migrate existing data to "LIFTED F-250" community
