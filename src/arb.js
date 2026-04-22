const KalshiClient = require('./kalshi');

// ── Price helpers ────────────────────────────────────────────────────────────

function centsToDecimal(cents) {
  return 100 / cents; // e.g. 60¢ → 1.667x decimal
}

function centsToImpliedProb(cents) {
  return cents / 100;
}

// ── Stake sizing ─────────────────────────────────────────────────────────────

/**
 * Given implied probabilities p1 and p2 (both < 1, summing to < 1),
 * returns the optimal stakes and guaranteed profit for a fixed bankroll.
 *
 * Formula (equal-payout arbitrage):
 *   stake_i = bankroll × (p_i / Σp)
 *   payout  = bankroll / Σp
 *   profit  = payout − bankroll
 */
function calcStakes(p1, p2, bankroll) {
  const total = p1 + p2;
  const s1 = bankroll * (p1 / total);
  const s2 = bankroll * (p2 / total);
  const payout = bankroll / total;
  const profit = payout - bankroll;
  const roi = (profit / bankroll) * 100;
  return { s1, s2, payout, profit, roi, totalImpliedProb: total };
}

// ── Core scanner ─────────────────────────────────────────────────────────────

/**
 * Evaluates every matched Kalshi↔sportsbook pair.
 *
 * Each pair is checked twice:
 *   1. Kalshi YES + sportsbook opposite side
 *   2. Kalshi NO  + sportsbook same side as Kalshi YES
 *
 * nearMissThreshold: pairs with totalImpliedProb below this are reported
 * as near-misses (1.0 = true arb, 1.05 = within 5% of arb).
 */
function findArbOpportunities(matched, bankroll = 1000, nearMissThreshold = 1.05) {
  const opportunities = [];
  const nearMisses = [];

  for (const { kalshiMarket: km, oddsEvent: event, yesIsHome } of matched) {
    const yesAsk = KalshiClient.normalizePrice(km.yes_ask);
    const noAsk = KalshiClient.normalizePrice(km.no_ask);

    if (!yesAsk || !noAsk || yesAsk <= 0 || noAsk <= 0) continue;

    const kYesProb = centsToImpliedProb(yesAsk);
    const kNoProb = centsToImpliedProb(noAsk);

    for (const bookmaker of event.bookmakers || []) {
      const h2h = (bookmaker.markets || []).find((m) => m.key === 'h2h');
      if (!h2h) continue;

      const homeOut = h2h.outcomes.find((o) => o.name === event.home_team);
      const awayOut = h2h.outcomes.find((o) => o.name === event.away_team);
      if (!homeOut || !awayOut) continue;

      const homeProb = 1 / homeOut.price;
      const awayProb = 1 / awayOut.price;

      // yesIsHome: Kalshi YES = home team wins
      const sbYesDecimal = yesIsHome ? homeOut.price : awayOut.price;
      const sbNoDecimal = yesIsHome ? awayOut.price : homeOut.price;
      const sbYesProb = yesIsHome ? homeProb : awayProb;
      const sbNoProb = yesIsHome ? awayProb : homeProb;

      const sbYesTeam = yesIsHome ? event.home_team : event.away_team;
      const sbNoTeam = yesIsHome ? event.away_team : event.home_team;

      const label = `${event.away_team} @ ${event.home_team}`;

      // ── Leg 1: Kalshi YES + Sportsbook NO ──────────────────────────────
      (() => {
        const { s1, s2, payout, profit, roi, totalImpliedProb } = calcStakes(kYesProb, sbNoProb, bankroll);
        const entry = {
          type: 'Kalshi YES + Sportsbook NO',
          event: label,
          sport: event.sport_key,
          commenceTime: event.commence_time,
          kalshiTicker: km.ticker,
          kalshiTitle: km.title,
          kalshiSide: 'YES',
          kalshiPriceCents: yesAsk,
          kalshiDecimalOdds: centsToDecimal(yesAsk),
          kalshiImpliedProb: kYesProb,
          bookmaker: bookmaker.title,
          sbSide: sbNoTeam,
          sbDecimalOdds: sbNoDecimal,
          sbImpliedProb: sbNoProb,
          totalImpliedProb,
          stakeKalshi: s1,
          stakeSportsbook: s2,
          payout,
          profit,
          roi,
        };
        if (totalImpliedProb < 1) opportunities.push(entry);
        else if (totalImpliedProb < nearMissThreshold) nearMisses.push(entry);
      })();

      // ── Leg 2: Kalshi NO + Sportsbook YES ──────────────────────────────
      (() => {
        const { s1, s2, payout, profit, roi, totalImpliedProb } = calcStakes(kNoProb, sbYesProb, bankroll);
        const entry = {
          type: 'Kalshi NO + Sportsbook YES',
          event: label,
          sport: event.sport_key,
          commenceTime: event.commence_time,
          kalshiTicker: km.ticker,
          kalshiTitle: km.title,
          kalshiSide: 'NO',
          kalshiPriceCents: noAsk,
          kalshiDecimalOdds: centsToDecimal(noAsk),
          kalshiImpliedProb: kNoProb,
          bookmaker: bookmaker.title,
          sbSide: sbYesTeam,
          sbDecimalOdds: sbYesDecimal,
          sbImpliedProb: sbYesProb,
          totalImpliedProb,
          stakeKalshi: s1,
          stakeSportsbook: s2,
          payout,
          profit,
          roi,
        };
        if (totalImpliedProb < 1) opportunities.push(entry);
        else if (totalImpliedProb < nearMissThreshold) nearMisses.push(entry);
      })();
    }
  }

  // Best arb first; near-misses sorted by closest to arb threshold
  opportunities.sort((a, b) => b.profit - a.profit);
  nearMisses.sort((a, b) => a.totalImpliedProb - b.totalImpliedProb);

  return { opportunities, nearMisses };
}

module.exports = { findArbOpportunities, calcStakes, centsToDecimal };
