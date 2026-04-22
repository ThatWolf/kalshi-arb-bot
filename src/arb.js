/**
 * Optimal stake sizing for a 2-leg arbitrage.
 *
 * p1, p2: implied probabilities of each side (both < 1, sum < 1 for true arb)
 * bankroll: total capital to deploy across both legs
 *
 * Derivation: set equal payouts from both legs, distribute bankroll proportionally.
 *   stake_i = bankroll × (p_i / Σp)
 *   guaranteed payout = bankroll / Σp
 *   profit = payout − bankroll
 */
function calcStakes(p1, p2, bankroll) {
  const total = p1 + p2;
  return {
    stakeA: bankroll * (p1 / total),
    stakeB: bankroll * (p2 / total),
    payout: bankroll / total,
    profit: bankroll * (1 - total) / total,
    roi: ((1 - total) / total) * 100,
    totalImpliedProb: total,
  };
}

/**
 * Evaluate all arb legs for every matched Kalshi↔sportsbook pair.
 *
 * For each matched game we check 4 legs:
 *   Leg 1: Kalshi YES TeamA  +  Sportsbook TeamB win
 *   Leg 2: Kalshi YES TeamB  +  Sportsbook TeamA win
 *   Leg 3: Kalshi NO  TeamA  +  Sportsbook TeamA win  (Kalshi NO = TeamA loses = TeamB wins, but sb side is TeamA — mutually exclusive ✓)
 *   Leg 4: Kalshi NO  TeamB  +  Sportsbook TeamB win
 *
 * nearMissThreshold: show entries up to this total implied prob (1.05 = within 5% of arb)
 */
function findArbOpportunities(matches, bankroll = 1000, nearMissThreshold = 1.05) {
  const opportunities = [];
  const nearMisses = [];

  for (const { kalshiGame: game, oddsEvent: event } of matches) {
    const { teamA, teamB } = game;

    for (const bookmaker of event.bookmakers || []) {
      const h2h = (bookmaker.markets || []).find((m) => m.key === 'h2h');
      if (!h2h) continue;

      const outA = h2h.outcomes.find(
        (o) => o.name === event.home_team || o.name === event.away_team
          ? o.name
          : null
      );

      // Match sportsbook outcomes to Kalshi teamA / teamB
      let sbTeamA = null;
      let sbTeamB = null;
      for (const o of h2h.outcomes) {
        if (!sbTeamA && isTeamMatch(o.name, teamA.name)) sbTeamA = o;
        else if (!sbTeamB && isTeamMatch(o.name, teamB.name)) sbTeamB = o;
      }
      if (!sbTeamA || !sbTeamB) continue;

      const pSbA = 1 / sbTeamA.price; // sportsbook implied prob for teamA to win
      const pSbB = 1 / sbTeamB.price;

      const legs = [
        {
          desc: `Kalshi YES ${teamA.name} + ${bookmaker.title} ${teamB.name}`,
          kalshiSide: `YES ${teamA.name}`,
          kalshiTicker: teamA.ticker,
          kalshiPrice: teamA.yesPrice,
          sbSide: teamB.name,
          sbBook: bookmaker.title,
          sbOdds: sbTeamB.price,
          p1: teamA.yesPrice,
          p2: pSbB,
        },
        {
          desc: `Kalshi YES ${teamB.name} + ${bookmaker.title} ${teamA.name}`,
          kalshiSide: `YES ${teamB.name}`,
          kalshiTicker: teamB.ticker,
          kalshiPrice: teamB.yesPrice,
          sbSide: teamA.name,
          sbBook: bookmaker.title,
          sbOdds: sbTeamA.price,
          p1: teamB.yesPrice,
          p2: pSbA,
        },
        {
          desc: `Kalshi NO ${teamA.name} + ${bookmaker.title} ${teamA.name}`,
          kalshiSide: `NO ${teamA.name}`,
          kalshiTicker: teamA.ticker,
          kalshiPrice: teamA.noPrice,
          sbSide: teamA.name,
          sbBook: bookmaker.title,
          sbOdds: sbTeamA.price,
          p1: teamA.noPrice,
          p2: pSbA,
        },
        {
          desc: `Kalshi NO ${teamB.name} + ${bookmaker.title} ${teamB.name}`,
          kalshiSide: `NO ${teamB.name}`,
          kalshiTicker: teamB.ticker,
          kalshiPrice: teamB.noPrice,
          sbSide: teamB.name,
          sbBook: bookmaker.title,
          sbOdds: sbTeamB.price,
          p1: teamB.noPrice,
          p2: pSbB,
        },
      ];

      for (const leg of legs) {
        const stakes = calcStakes(leg.p1, leg.p2, bankroll);
        const commenceTime = event.commence_time;
        const isLive = Date.now() >= new Date(commenceTime).getTime();
        const entry = {
          ...leg,
          event: `${event.away_team} @ ${event.home_team}`,
          eventTicker: game.eventTicker,
          sport: game.sport,
          commenceTime,
          isLive,
          ...stakes,
        };
        if (stakes.totalImpliedProb < 1) opportunities.push(entry);
        else if (stakes.totalImpliedProb < nearMissThreshold) nearMisses.push(entry);
      }
    }
  }

  opportunities.sort((a, b) => b.profit - a.profit);
  nearMisses.sort((a, b) => a.totalImpliedProb - b.totalImpliedProb);
  return { opportunities, nearMisses };
}

function isTeamMatch(sbName, kalshiName) {
  const n = (s) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const a = n(sbName);
  const b = n(kalshiName);
  if (a.includes(b) || b.includes(a)) return true;
  const bWords = b.split(' ').filter((w) => w.length > 3);
  return bWords.some((w) => a.includes(w));
}

module.exports = { findArbOpportunities, calcStakes };
