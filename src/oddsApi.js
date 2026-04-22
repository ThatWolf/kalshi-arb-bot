const axios = require('axios');

const BASE_URL = 'https://api.the-odds-api.com/v4';

// Major sports supported by The Odds API
const SPORTS = [
  'americanfootball_nfl',
  'basketball_nba',
  'baseball_mlb',
  'icehockey_nhl',
  'soccer_usa_mls',
  'americanfootball_ncaaf',
  'basketball_ncaab',
];

class OddsApiClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error('THE_ODDS_API_KEY is required');
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 15000,
      params: { apiKey },
    });
  }

  async getOddsForSport(sport) {
    const res = await this.http.get(`/sports/${sport}/odds`, {
      params: {
        regions: 'us',
        markets: 'h2h',
        oddsFormat: 'decimal',
      },
    });
    return (res.data || []).map((e) => ({
      ...e,
      sport_key: sport,
      // Drop bookmakers whose line went stale before the game started.
      // last_update ≤ commence_time means the book pulled the market at kickoff.
      bookmakers: this.filterStaleBookmakers(e.bookmakers || [], e.commence_time),
    }));
  }

  // A bookmaker is stale if the game has started AND their last update
  // predates kickoff (they closed the line and The Odds API is serving a snapshot).
  filterStaleBookmakers(bookmakers, commenceTime) {
    const now = Date.now();
    const kickoff = new Date(commenceTime).getTime();
    const gameStarted = now >= kickoff;
    if (!gameStarted) return bookmakers; // Pre-game: all lines are live

    return bookmakers.filter((bk) => {
      const h2h = (bk.markets || []).find((m) => m.key === 'h2h');
      if (!h2h?.last_update) return false;
      const updated = new Date(h2h.last_update).getTime();
      // Keep only bookmakers that updated AFTER the game started
      return updated > kickoff;
    });
  }

  async getAllOdds() {
    const results = await Promise.allSettled(SPORTS.map((s) => this.getOddsForSport(s)));
    const events = [];
    for (const r of results) {
      if (r.status === 'fulfilled') events.push(...r.value);
      // Silently skip sports with no current lines (off-season, API errors, etc.)
    }
    return events;
  }

  // Return remaining API quota from last response headers (informational)
  get remainingRequests() {
    return this._remaining ?? 'unknown';
  }
}

module.exports = OddsApiClient;
