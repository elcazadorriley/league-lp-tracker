# League LP Tracker

Track League of Legends ranked LP gains and losses over time with interactive charts.

**Live Site:** https://www.liftedf250.lol

## Tech Stack

- **Frontend:** Vanilla JavaScript, Chart.js
- **Backend:** Vercel Serverless Functions
- **Database:** Supabase (PostgreSQL)
- **API:** Riot Games API

## Project Structure

```
league-lp-tracker/
├── api/                    # Vercel serverless functions
│   ├── rank.js             # Fetch player rank from Riot API
│   ├── history.js          # CRUD operations for LP history
│   └── matches.js          # Fetch match history from Riot API
├── public/                 # Static frontend files
│   ├── index.html          # Main HTML template
│   ├── app.js              # Frontend application logic
│   ├── player-data.js      # Preloaded player data
│   └── styles.css          # Styling
├── src/
│   └── server.js           # Local development server
├── scripts/                # Utility scripts
│   └── backfill.js         # Backfill historical data
├── shared/
│   └── constants.js        # Shared constants (tiers, LP values)
└── docs/                   # Documentation
    ├── ROADMAP-COMMUNITIES.md
    └── SESSION-NOTES.md
```

## Local Development

### Prerequisites

- Node.js 18+
- npm
- Riot Games API key (get one at https://developer.riotgames.com)
- Supabase account and project

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/elcazadorriley/league-lp-tracker.git
   cd league-lp-tracker
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with your credentials:

   ```
   RIOT_API_KEY=your_riot_api_key
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000 in your browser.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run the production server |
| `npm run dev` | Run dev server with auto-reload |
| `npm run lint` | Check for linting issues |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting without changes |

## Database Schema

### `lp_history` table

| Column        | Type        | Description                         |
| ------------- | ----------- | ----------------------------------- |
| id            | uuid        | Primary key                         |
| game_name     | text        | Player's Riot game name             |
| tag_line      | text        | Player's Riot tag                   |
| region        | text        | Server region (NA, EUW, etc.)       |
| total_lp      | integer     | Calculated total LP                 |
| tier          | text        | Rank tier (IRON, BRONZE, etc.)      |
| rank          | text        | Division (I, II, III, IV)           |
| lp            | integer     | League points within division       |
| timestamp     | timestamptz | When the data was recorded          |
| match_id      | text        | Associated match ID (nullable)      |
| champion_name | text        | Champion played (nullable)          |
| kills         | integer     | Kills in match (nullable)           |
| deaths        | integer     | Deaths in match (nullable)          |
| assists       | integer     | Assists in match (nullable)         |
| game_win      | boolean     | Whether the game was won (nullable) |

## API Endpoints

### GET `/api/rank/:region/:gameName/:tagLine`

Fetch current rank for a player from Riot API.

### GET `/api/history`

Query parameters: `game_name`, `tag_line`, `region`
Fetch LP history for a player from database.

### POST `/api/history`

Save a new LP history entry to database.

### GET `/api/matches/:region/:gameName/:tagLine`

Fetch recent match history for a player from Riot API.

## Contributing

### Getting Started

1. Fork the repo and clone your fork
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and add your credentials
4. Start dev server: `npm run dev`
5. Open http://localhost:3000

### Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Run linting and formatting:
   ```bash
   npm run lint:fix
   npm run format
   ```
4. Test locally with `npm run dev`
5. Submit a pull request

### Code Style

- ESLint and Prettier are configured - run them before committing
- Use `npm run lint:fix` to auto-fix linting issues
- Use `npm run format` to format code

### Key Files to Know

| File | Purpose |
|------|---------|
| `public/app.js` | Main frontend logic, Chart.js rendering |
| `public/player-data.js` | Player list configuration |
| `api/rank.js` | Riot API proxy for current rank |
| `api/history.js` | Database read/write for LP history |
| `shared/constants.js` | Tier/LP calculation constants |

### Deployment

Push to both remotes for deployment:
```bash
git push origin main && git push vercel main
```

## License

ISC
