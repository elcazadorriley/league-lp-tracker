# LP Tracker - Riot Games Production API Key Application

## Project Overview

**LP Tracker** is a web-based League of Legends ranked progression visualization tool that allows a group of friends to track and compare their Solo/Duo ranked LP (League Points) over time. The application provides a real-time dashboard displaying each player's current rank, recent LP changes, and historical progression through an interactive chart.

**Live URL:** https://www.liftedf250.lol
**GitHub Repository:** https://github.com/elcazadorriley/league-lp-tracker

---

## Project Goals

1. **Track Ranked Progression** - Monitor Solo/Duo ranked LP changes for a defined group of players over time
2. **Visualize Historical Data** - Display LP history through an interactive line chart showing progression from Iron to Challenger
3. **Compare Performance** - Allow side-by-side comparison of multiple players' ranked journeys
4. **Persist Data** - Store historical LP data in a database so progression history is never lost
5. **Provide Quick Access** - Link directly to each player's OP.GG profile for detailed match history

---

## Technical Architecture

### Stack Overview

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | HTML, CSS, JavaScript | User interface and chart rendering |
| Charting | Chart.js | Interactive LP progression visualization |
| Backend | Vercel Serverless Functions | API proxy and database operations |
| Database | Supabase (PostgreSQL) | Persistent storage for LP history |
| Hosting | Vercel | Deployment and CDN |
| External API | Riot Games API | Live ranked data retrieval |

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Player Cards  │  │   LP Chart      │  │  Refresh Button │  │
│  │   (Chart.js)    │  │   (Interactive) │  │  (Manual Sync)  │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼─────────────────────┼─────────────────────┼─────────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL SERVERLESS FUNCTIONS                  │
│  ┌─────────────────────────────┐  ┌─────────────────────────┐   │
│  │      /api/rank              │  │      /api/history       │   │
│  │  (Riot API Proxy)           │  │  (Database CRUD)        │   │
│  └──────────────┬──────────────┘  └──────────────┬──────────┘   │
└─────────────────┼─────────────────────────────────┼─────────────┘
                  │                                 │
                  ▼                                 ▼
      ┌───────────────────┐             ┌───────────────────┐
      │   RIOT GAMES API  │             │     SUPABASE      │
      │                   │             │    (PostgreSQL)   │
      │ - Account API     │             │                   │
      │ - League API      │             │  lp_history table │
      └───────────────────┘             └───────────────────┘
```

---

## Riot Games API Usage

### Endpoints Used

#### 1. Account API - Get PUUID by Riot ID
```
GET https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}
```
**Purpose:** Retrieve the player's PUUID (Player Universally Unique Identifier) using their Riot ID (gameName#tagLine)

**Response Data Used:**
- `puuid` - Used to query League-specific endpoints

#### 2. League API - Get Ranked Stats by Summoner ID
```
GET https://{platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/{encryptedSummonerId}
```
**Purpose:** Retrieve current ranked standings for Solo/Duo queue

**Response Data Used:**
- `tier` - Current rank tier (IRON, BRONZE, SILVER, GOLD, PLATINUM, EMERALD, DIAMOND, MASTER, GRANDMASTER, CHALLENGER)
- `rank` - Division within tier (IV, III, II, I)
- `leaguePoints` - Current LP within division
- `wins` - Total ranked wins
- `losses` - Total ranked losses

#### 3. Summoner API - Get Summoner by PUUID
```
GET https://{platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/{puuid}
```
**Purpose:** Convert PUUID to encrypted Summoner ID for League API queries

**Response Data Used:**
- `id` - Encrypted Summoner ID

### API Call Flow

1. User clicks "Refresh All" button
2. For each tracked player:
   - Call Account API to get PUUID from Riot ID
   - Call Summoner API to get encrypted Summoner ID from PUUID
   - Call League API to get current ranked stats
3. Compare new LP with last stored value
4. If LP changed, save new data point to database
5. Update UI with current stats and chart

### Rate Limiting Compliance

- **Request Spacing:** 200ms delay between player refreshes to avoid burst requests
- **Auto-Refresh Interval:** 5 minutes minimum between automatic refreshes
- **Caching:** Database serves as cache for historical data, reducing redundant API calls
- **Error Handling:** Graceful handling of 429 (Rate Limited) responses with retry logic

---

## Data Storage

### Database Schema: `lp_history`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key, auto-increment |
| `player_id` | TEXT | Riot ID format: "GameName#TagLine" |
| `game_name` | TEXT | Player's game name |
| `tag_line` | TEXT | Player's tag line |
| `region` | TEXT | Server region (NA, EUW, etc.) |
| `total_lp` | INTEGER | Calculated total LP from Iron IV (0-4000+) |
| `tier` | TEXT | Rank tier at time of record |
| `rank` | TEXT | Division at time of record |
| `lp` | INTEGER | LP within division |
| `wins` | INTEGER | Total wins at time of record |
| `losses` | INTEGER | Total losses at time of record |
| `created_at` | TIMESTAMPTZ | Timestamp of data point |

### LP Calculation Formula

Total LP is calculated as a continuous scale from Iron IV (0 LP) to Challenger:

```javascript
const RANK_VALUES = {
  'IRON': 0,
  'BRONZE': 400,
  'SILVER': 800,
  'GOLD': 1200,
  'PLATINUM': 1600,
  'EMERALD': 2000,
  'DIAMOND': 2400,
  'MASTER': 2800,
  'GRANDMASTER': 3200,
  'CHALLENGER': 3600
};

const DIVISION_VALUES = { 'IV': 0, 'III': 100, 'II': 200, 'I': 300 };

// Example: Gold II with 45 LP = 1200 + 200 + 45 = 1445 total LP
totalLP = RANK_VALUES[tier] + DIVISION_VALUES[rank] + leaguePoints;
```

---

## Frontend Features

### Player Cards
- Show LP change indicator (▲/▼) from last recorded game
- Click to open player's OP.GG profile
- Color-coded left border matching chart line color

### Interactive Chart
- **Library:** Chart.js with zoom plugin
- **X-Axis:** Timestamp of each data point
- **Y-Axis:** Total LP with rank tier labels
- **Features:**
  - Hover to see exact LP and rank at any point
  - Click legend to filter/highlight specific players
  - Toggle between Overview (all data) and Daily view
  - Pan and zoom support

### Responsive Design
- Desktop: Side-by-side layout with player cards on left, chart on right
- Mobile: Stacked layout with scrollable player cards

---

## Privacy & Data Handling

1. **Public Data Only:** The application only accesses publicly available ranked data through official Riot APIs
2. **No Personal Information:** No email addresses, real names, or private account details are collected
3. **No Authentication:** Users do not log in; the app tracks a predefined list of players
4. **Data Retention:** Historical LP data is retained indefinitely to show long-term progression
5. **No Data Sharing:** Player data is not shared with third parties

---

## Current Limitations & Future Plans

### Current State
- Tracks 7 predefined players in NA region
- Manual refresh or 5-minute auto-refresh
- Development API key requires daily renewal

### With Production API Key
- **Reliability:** No daily key expiration interrupting service
- **Scalability:** Potential to add more players or expand to other regions
- **Features:** Could add match-by-match LP tracking using Match History API

### Potential Future Enhancements
- User-configurable player list
- Multi-region support
- LP gain/loss statistics and averages
- Rank milestone notifications


---

## Technical Compliance

### Riot Games API Terms of Use Compliance

1. **Attribution:** Application links to official Riot resources (OP.GG profiles)
2. **No Monetization:** Application is free with no ads or paid features
3. **Rate Limiting:** Proper delays and caching implemented
4. **Data Accuracy:** Data displayed exactly as received from API
5. **No Automation:** All refreshes are user-initiated or on reasonable intervals

### Legal Notice

LP Tracker isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

---

## Contact Information

**Developer:** Hunter Riley
**Email:** hriley3031@gmail.com
**GitHub:** github.com/elcazadorriley

---

## Summary

LP Tracker is a personal project built to help a group of friends visualize and compare their League of Legends ranked progression over time. It uses the Riot Games API responsibly to fetch current ranked data, stores historical snapshots in a database, and presents the data through an intuitive web interface.

A production API key would provide the reliability needed for continuous operation without daily key renewals, ensuring the tracked players' progression history remains uninterrupted.

My goal would be to create this, for everyone. I would like to change the site structure in a way that you would have an admin set up the player list, and a password, to which you can access your local communities data. I have hang-ups around data storage with this plan, TBD. 

Thank you for considering this application.
