const axios = require('axios');

const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

const GAME_SERIES = ['KXMLBGAME', 'KXNHLGAME', 'KXNBAGAME', 'KXNFLGAME'];

// Minimum required volume (in contracts) to consider a market liquid enough.
// Markets with last_price = 0 have never traded and have wide, unreliable spreads.
const MIN_VOLUME = 10;

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
      .filter((m) => m.yes_ask_dollars && m.yes_bid_dollars && m.no_ask_dollars && m.yes_sub_title);
  }

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

      // Skip events where either market has never traded (last_price = 0).
      // Those markets have very wide spreads and unreliable quoted prices.
      const aVol = parseFloat(a.volume_fp || '0');
      const bVol = parseFloat(b.volume_fp || '0');
      if (aVol < MIN_VOLUME || bVol < MIN_VOLUME) continue;

      const teamData = (m) => ({
        name: m.yes_sub_title,
        ticker: m.ticker,
        // Ask = what you pay to buy; mid = what Kalshi UI typically shows.
        // We use ask for arb math (real cost), store mid for display.
        yesAsk: parseFloat(m.yes_ask_dollars),
        yesBid: parseFloat(m.yes_bid_dollars),
        yesMid: (parseFloat(m.yes_bid_dollars) + parseFloat(m.yes_ask_dollars)) / 2,
        noAsk:  parseFloat(m.no_ask_dollars),
        noBid:  parseFloat(m.no_bid_dollars),
        noMid:  (parseFloat(m.no_bid_dollars) + parseFloat(m.no_ask_dollars)) / 2,
        volume: aVol,
      });

      games.push({
        eventTicker,
        sport: eventTicker.split('-')[0],
        occurrenceDatetime: a.occurrence_datetime || a.expected_expiration_time || null,
        teamA: teamData(a),
        teamB: teamData(b),
      });
    }
    return games;
  }
}

module.exports = KalshiClient;
