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
│   ├── backfill.js         # Backfill historical data
│   └── seed-db.js          # Seed database
└── shared/                 # Shared constants (coming soon)
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

- `npm start` - Run the production server
- `npm run dev` - Run the development server with auto-reload
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Deployment

The app is deployed on Vercel. Push to both remotes:

```bash
git push origin main && git push vercel main
```

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

1. Create a feature branch
2. Make your changes
3. Run `npm run lint` and `npm run format`
4. Submit a pull request

## License

ISC
