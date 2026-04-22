// ── Kalshi fee model ─────────────────────────────────────────────────────────
//
// Kalshi uses a quadratic fee on profit:
//   fee_rate(p) = maxFee × 4 × p × (1−p)
//   fee_amount  = fee_rate × (1−p)   per contract  [fee is on the potential profit]
//
// So if you buy YES at price p and YES wins:
//   gross payout per contract = 1
//   fee per contract          = fee_rate × (1−p)
//   net payout per contract   = 1 − fee_rate × (1−p)
//   effective decimal odds    = net_payout / p
//
// The quadratic shape means:
//   p = 0.50 → fee_rate = maxFee (maximum)
//   p = 0.10 or 0.90 → fee_rate ≈ 0.36 × maxFee (much lower near edges)
//
function kalshiEffectiveOdds(priceUsd, maxFeeRate) {
  const feeRate = maxFeeRate * 4 * priceUsd * (1 - priceUsd);
  const netPayout = 1 - feeRate * (1 - priceUsd);
  return { effectiveOdds: netPayout / priceUsd, feeRate };
}

// ── Stake sizing ─────────────────────────────────────────────────────────────
//
// Given effective decimal odds D1 (Kalshi, post-fee) and D2 (sportsbook,
// vig already baked in), find the stakes that guarantee equal payout.
//
//   stake_i = bankroll × (1/D_i) / Σ(1/D_j)
//   payout  = bankroll / Σ(1/D_j)
//   profit  = payout − bankroll
//
function calcStakes(D1eff, D2eff, bankroll) {
  const p1 = 1 / D1eff;
  const p2 = 1 / D2eff;
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

// ── Sportsbook vig helper ─────────────────────────────────────────────────────
function sbBookPct(h2h) {
  return h2h.outcomes.reduce((sum, o) => sum + 1 / o.price, 0);
}

// ── Core scanner ─────────────────────────────────────────────────────────────
function findArbOpportunities(matches, bankroll = 1000, nearMissThreshold = 1.05, kalshiMaxFee = 0.07) {
  const opportunities = [];
  const nearMisses = [];

  for (const { kalshiGame: game, oddsEvent: event } of matches) {
    const { teamA, teamB } = game;

    for (const bookmaker of event.bookmakers || []) {
      const h2h = (bookmaker.markets || []).find((m) => m.key === 'h2h');
      if (!h2h) continue;

      let sbTeamA = null;
      let sbTeamB = null;
      for (const o of h2h.outcomes) {
        if (!sbTeamA && isTeamMatch(o.name, teamA.name)) sbTeamA = o;
        else if (!sbTeamB && isTeamMatch(o.name, teamB.name)) sbTeamB = o;
      }
      if (!sbTeamA || !sbTeamB) continue;

      const bookVigPct = sbBookPct(h2h);       // e.g. 1.042 = 4.2% vig
      const bookVigAmt = (bookVigPct - 1) * 100; // e.g. 4.2

      const legs = [
        {
          kalshiSide: `YES ${teamA.name}`,
          kalshiTicker: teamA.ticker,
          kalshiPrice: teamA.yesPrice,
          sbSide: teamB.name,
          sbBook: bookmaker.title,
          sbOdds: sbTeamB.price,
        },
        {
          kalshiSide: `YES ${teamB.name}`,
          kalshiTicker: teamB.ticker,
          kalshiPrice: teamB.yesPrice,
          sbSide: teamA.name,
          sbBook: bookmaker.title,
          sbOdds: sbTeamA.price,
        },
        {
          kalshiSide: `NO ${teamA.name}`,
          kalshiTicker: teamA.ticker,
          kalshiPrice: teamA.noPrice,
          sbSide: teamA.name,
          sbBook: bookmaker.title,
          sbOdds: sbTeamA.price,
        },
        {
          kalshiSide: `NO ${teamB.name}`,
          kalshiTicker: teamB.ticker,
          kalshiPrice: teamB.noPrice,
          sbSide: teamB.name,
          sbBook: bookmaker.title,
          sbOdds: sbTeamB.price,
        },
      ];

      const commenceTime = event.commence_time;
      const isLive = Date.now() >= new Date(commenceTime).getTime();

      for (const leg of legs) {
        const { effectiveOdds: D1eff, feeRate: kalshiFeeRate } =
          kalshiEffectiveOdds(leg.kalshiPrice, kalshiMaxFee);
        const D2eff = leg.sbOdds; // sportsbook vig already baked into the decimal odds

        const stakes = calcStakes(D1eff, D2eff, bankroll);

        const entry = {
          ...leg,
          event: `${event.away_team} @ ${event.home_team}`,
          eventTicker: game.eventTicker,
          sport: game.sport,
          commenceTime,
          isLive,
          kalshiRawOdds: 1 / leg.kalshiPrice,
          kalshiEffectiveOdds: D1eff,
          kalshiFeeRate,          // e.g. 0.0672 = 6.72%
          bookVigPct,             // total sportsbook book % (e.g. 1.042)
          bookVigAmt,             // vig in % points (e.g. 4.2)
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

module.exports = { findArbOpportunities, calcStakes, kalshiEffectiveOdds };
