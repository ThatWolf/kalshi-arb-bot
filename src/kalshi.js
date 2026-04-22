const axios = require('axios');

const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

// Series tickers for individual game winner markets on Kalshi
const GAME_SERIES = ['KXMLBGAME', 'KXNHLGAME', 'KXNBAGAME', 'KXNFLGAME'];

class KalshiClient {
  constructor() {
    this.http = axios.create({ baseURL: BASE_URL, timeout: 15000 });
  }

  async getMarketsForSeries(seriesTicker, maxPages = 3) {
    const all = [];
    let cursor = null;
    for (let i = 0; i < maxPages; i++) {
      const params = { limit: 200, status: 'open', series_ticker: seriesTicker };
      if (cursor) params.cursor = cursor;
      const res = await this.http.get('/markets', { params });
      const markets = res.data.markets || [];
      all.push(...markets);
      cursor = res.data.cursor;
      if (!cursor || markets.length === 0) break;
    }
    return all;
  }

  async getAllGameMarkets() {
    const results = await Promise.allSettled(
      GAME_SERIES.map((s) => this.getMarketsForSeries(s))
    );
    return results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .filter((m) => m.yes_ask_dollars && m.no_ask_dollars && m.yes_sub_title);
  }

  // Group flat list of markets into per-game objects.
  // Each game event has 2 markets — one for each team's YES side.
  static groupByEvent(markets) {
    const byEvent = {};
    for (const m of markets) {
      const key = m.event_ticker;
      if (!byEvent[key]) byEvent[key] = [];
      byEvent[key].push(m);
    }

    const games = [];
    for (const [eventTicker, legs] of Object.entries(byEvent)) {
      if (legs.length < 2) continue;
      const [a, b] = legs;
      games.push({
        eventTicker,
        sport: eventTicker.split('-')[0], // e.g. KXMLBGAME
        // Use occurrence_datetime for date-based matching; fall back to expected_expiration_time
        occurrenceDatetime: a.occurrence_datetime || a.expected_expiration_time || null,
        teamA: {
          name: a.yes_sub_title,
          ticker: a.ticker,
          yesPrice: parseFloat(a.yes_ask_dollars),
          noPrice: parseFloat(a.no_ask_dollars),
        },
        teamB: {
          name: b.yes_sub_title,
          ticker: b.ticker,
          yesPrice: parseFloat(b.yes_ask_dollars),
          noPrice: parseFloat(b.no_ask_dollars),
        },
      });
    }
    return games;
  }
}

module.exports = KalshiClient;
