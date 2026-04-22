const axios = require('axios');

const BASE_URL = 'https://api.kalshi.com/trade-api/v2';

// Keywords used to filter Kalshi markets down to sports
const SPORT_KEYWORDS = [
  'nfl', 'nba', 'mlb', 'nhl', 'mls', 'ncaaf', 'ncaab',
  'super bowl', 'playoffs', 'championship', 'world series', 'stanley cup',
  'chiefs', 'eagles', 'patriots', 'cowboys', 'bills', 'ravens', '49ers',
  'lakers', 'celtics', 'warriors', 'heat', 'bulls', 'knicks', 'nets', 'nuggets',
  'yankees', 'mets', 'dodgers', 'red sox', 'cubs', 'astros', 'cardinals',
  'maple leafs', 'bruins', 'rangers', 'penguins', 'lightning', 'oilers',
];

class KalshiClient {
  constructor() {
    this.http = axios.create({ baseURL: BASE_URL, timeout: 15000 });
  }

  async login(email, password) {
    const res = await this.http.post('/login', { email, password });
    const token = res.data.token;
    this.http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    return token;
  }

  async getOpenMarkets({ limit = 200, cursor } = {}) {
    const params = { limit, status: 'open' };
    if (cursor) params.cursor = cursor;
    const res = await this.http.get('/markets', { params });
    return {
      markets: res.data.markets || [],
      cursor: res.data.cursor || null,
    };
  }

  async getAllOpenMarkets(maxPages = 5) {
    const all = [];
    let cursor = null;
    for (let i = 0; i < maxPages; i++) {
      const { markets, cursor: next } = await this.getOpenMarkets({ cursor });
      all.push(...markets);
      if (!next || markets.length === 0) break;
      cursor = next;
    }
    return all;
  }

  filterSportsMarkets(markets) {
    return markets.filter((m) => {
      if (!m.yes_ask || !m.no_ask) return false;
      const text = `${m.title || ''} ${m.subtitle || ''} ${m.ticker || ''}`.toLowerCase();
      return SPORT_KEYWORDS.some((kw) => text.includes(kw));
    });
  }

  // Kalshi prices can be raw cents (1–99 int) or fractional (0.01–0.99 float).
  // Normalize to cents for consistent math.
  static normalizePrice(price) {
    return price <= 1 ? Math.round(price * 100) : price;
  }
}

module.exports = KalshiClient;
