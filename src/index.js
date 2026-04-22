require('dotenv').config();

const KalshiClient = require('./kalshi');
const OddsApiClient = require('./oddsApi');
const { matchMarkets } = require('./matcher');
const { findArbOpportunities } = require('./arb');

const BANKROLL = parseFloat(process.env.BANKROLL || '1000');
const NEAR_MISS_THRESHOLD = parseFloat(process.env.NEAR_MISS_THRESHOLD || '1.05');
const DIVIDER = '─'.repeat(64);

// ── Formatting helpers ────────────────────────────────────────────────────────

function pct(v) {
  return (v * 100).toFixed(2) + '%';
}

function usd(v) {
  return '$' + v.toFixed(2);
}

function fmt(label, value, width = 18) {
  return `  ${label.padEnd(width)} ${value}`;
}

function sportLabel(key) {
  const map = {
    americanfootball_nfl: 'NFL',
    americanfootball_ncaaf: 'NCAAF',
    basketball_nba: 'NBA',
    basketball_ncaab: 'NCAAB',
    baseball_mlb: 'MLB',
    icehockey_nhl: 'NHL',
    soccer_usa_mls: 'MLS',
  };
  return map[key] || key;
}

function printOpportunity(opp, idx, isNearMiss = false) {
  const tag = isNearMiss ? 'NEAR MISS' : `ARB #${idx + 1}`;
  console.log(`\n${DIVIDER}`);
  console.log(`[${tag}] ${opp.type}`);
  console.log(DIVIDER);
  console.log(fmt('Event:', opp.event));
  console.log(fmt('Sport:', sportLabel(opp.sport)));
  console.log(fmt('Kickoff:', new Date(opp.commenceTime).toLocaleString()));
  console.log('');
  console.log(fmt('Kalshi side:', `${opp.kalshiSide} on ${opp.kalshiTicker}`));
  console.log(
    fmt('Kalshi price:', `${opp.kalshiPriceCents}¢  →  ${opp.kalshiDecimalOdds.toFixed(4)}x  (impl ${pct(opp.kalshiImpliedProb)})`)
  );
  console.log('');
  console.log(fmt('Bookmaker:', opp.bookmaker));
  console.log(fmt('SB side:', opp.sbSide));
  console.log(
    fmt('SB odds:', `${opp.sbDecimalOdds.toFixed(4)}x  (impl ${pct(opp.sbImpliedProb)})`)
  );
  console.log('');
  console.log(
    fmt(
      'Total implied:',
      `${pct(opp.totalImpliedProb)}  ${opp.totalImpliedProb < 1 ? '← ARBITRAGE' : `(${pct(opp.totalImpliedProb - 1)} over)`}`
    )
  );

  if (!isNearMiss) {
    console.log('');
    console.log(fmt('Stake (Kalshi):', usd(opp.stakeKalshi)));
    console.log(fmt('Stake (SB):', usd(opp.stakeSportsbook)));
    console.log(fmt('Guaranteed payout:', usd(opp.payout)));
    console.log(fmt('Guaranteed profit:', `${usd(opp.profit)}  (ROI ${opp.roi.toFixed(2)}%)`));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(64));
  console.log('  Kalshi Arbitrage Bot');
  console.log(`  Bankroll: ${usd(BANKROLL)}   |   Started: ${new Date().toLocaleString()}`);
  console.log('═'.repeat(64));

  // ── Validate env ──────────────────────────────────────────────────────────
  const missing = [];
  if (!process.env.KALSHI_EMAIL) missing.push('KALSHI_EMAIL');
  if (!process.env.KALSHI_PASSWORD) missing.push('KALSHI_PASSWORD');
  if (!process.env.THE_ODDS_API_KEY) missing.push('THE_ODDS_API_KEY');
  if (missing.length) {
    console.error(`\nMissing required env vars: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your credentials.\n');
    process.exit(1);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const kalshi = new KalshiClient();
  const oddsApi = new OddsApiClient(process.env.THE_ODDS_API_KEY);

  process.stdout.write('Authenticating with Kalshi... ');
  await kalshi.login(process.env.KALSHI_EMAIL, process.env.KALSHI_PASSWORD);
  console.log('OK');

  // ── Fetch ─────────────────────────────────────────────────────────────────
  process.stdout.write('Fetching markets (parallel)... ');
  const [allKalshiMarkets, allOddsEvents] = await Promise.all([
    kalshi.getAllOpenMarkets(),
    oddsApi.getAllOdds(),
  ]);
  console.log('OK');

  const sportsMarkets = kalshi.filterSportsMarkets(allKalshiMarkets);

  console.log(`\n  Kalshi open markets      : ${allKalshiMarkets.length}`);
  console.log(`  Kalshi sports markets    : ${sportsMarkets.length}`);
  console.log(`  Odds API events          : ${allOddsEvents.length}`);

  // ── Match ─────────────────────────────────────────────────────────────────
  const matched = matchMarkets(sportsMarkets, allOddsEvents);
  console.log(`  Matched pairs            : ${matched.length}`);

  if (matched.length === 0) {
    console.log(
      '\nNo market pairs matched. This is common off-season or when Kalshi' +
        '\nmarket titles do not contain recognizable team names.\n'
    );
    return;
  }

  // ── Analyze ───────────────────────────────────────────────────────────────
  const { opportunities, nearMisses } = findArbOpportunities(matched, BANKROLL, NEAR_MISS_THRESHOLD);

  // ── Output ────────────────────────────────────────────────────────────────
  if (opportunities.length > 0) {
    console.log(`\n✓ Found ${opportunities.length} arbitrage opportunity(ies)!\n`);
    opportunities.forEach((opp, i) => printOpportunity(opp, i, false));

    const totalProfit = opportunities.reduce((s, o) => s + o.profit, 0);
    console.log(`\n${DIVIDER}`);
    console.log(`  TOTAL POTENTIAL PROFIT: ${usd(totalProfit)} across ${opportunities.length} arb(s)`);
    console.log(DIVIDER);
  } else {
    console.log('\nNo arbitrage opportunities found at this time.');
  }

  if (nearMisses.length > 0) {
    console.log(`\n── Near misses (implied prob < ${pct(NEAR_MISS_THRESHOLD)}) ────────────────────`);
    nearMisses.slice(0, 5).forEach((nm, i) => printOpportunity(nm, i, true));
    if (nearMisses.length > 5) {
      console.log(`\n  … and ${nearMisses.length - 5} more near misses.`);
    }
  }

  console.log(`\nScan complete: ${new Date().toLocaleString()}\n`);
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  if (err.response) {
    console.error('HTTP status:', err.response.status);
    console.error('Response body:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
