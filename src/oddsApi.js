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
    // Attach sport key to each event for downstream use
    return (res.data || []).map((e) => ({ ...e, sport_key: sport }));
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
