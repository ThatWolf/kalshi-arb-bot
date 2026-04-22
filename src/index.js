require('dotenv').config();

const KalshiClient = require('./kalshi');
const OddsApiClient = require('./oddsApi');
const { matchGames } = require('./matcher');
const { findArbOpportunities } = require('./arb');

const BANKROLL = parseFloat(process.env.BANKROLL || '1000');
const NEAR_MISS_THRESHOLD = parseFloat(process.env.NEAR_MISS_THRESHOLD || '1.05');
const DIVIDER = '─'.repeat(64);

function pct(v) { return (v * 100).toFixed(2) + '%'; }
function usd(v) { return '$' + v.toFixed(2); }
function fmt(label, value, w = 20) { return `  ${label.padEnd(w)} ${value}`; }

const SPORT_LABEL = {
  KXMLBGAME: 'MLB', KXNHLGAME: 'NHL', KXNBAGAME: 'NBA', KXNFLGAME: 'NFL',
};

function printEntry(entry, tag) {
  console.log(`\n${DIVIDER}`);
  console.log(`[${tag}]`);
  console.log(DIVIDER);
  console.log(fmt('Event:', entry.event));
  console.log(fmt('Sport:', SPORT_LABEL[entry.sport] || entry.sport));
  console.log(fmt('Kickoff:', new Date(entry.commenceTime).toLocaleString()));
  console.log('');
  console.log(fmt('Kalshi:', `${entry.kalshiSide}`));
  console.log(fmt('Kalshi ticker:', entry.kalshiTicker));
  console.log(fmt('Kalshi price:', `${(entry.kalshiPrice * 100).toFixed(0)}¢  →  ${(1 / entry.kalshiPrice).toFixed(4)}x  (impl ${pct(entry.kalshiPrice)})`));
  console.log('');
  console.log(fmt('Bookmaker:', entry.sbBook));
  console.log(fmt('SB side:', entry.sbSide));
  console.log(fmt('SB odds:', `${entry.sbOdds.toFixed(4)}x  (impl ${pct(entry.p2)})`));
  console.log('');
  console.log(fmt('Total implied:', `${pct(entry.totalImpliedProb)}  ${entry.totalImpliedProb < 1 ? '← ARBITRAGE' : `(${pct(entry.totalImpliedProb - 1)} over fair)`}`));

  if (entry.profit > 0) {
    console.log('');
    console.log(fmt('Stake (Kalshi):', usd(entry.stakeA)));
    console.log(fmt('Stake (Sportsbook):', usd(entry.stakeB)));
    console.log(fmt('Guaranteed payout:', usd(entry.payout)));
    console.log(fmt('Guaranteed profit:', `${usd(entry.profit)}  (ROI ${entry.roi.toFixed(2)}%)`));
  }
}

async function main() {
  console.log('═'.repeat(64));
  console.log('  Kalshi Arbitrage Bot');
  console.log(`  Bankroll: ${usd(BANKROLL)}   |   ${new Date().toLocaleString()}`);
  console.log('═'.repeat(64));

  if (!process.env.THE_ODDS_API_KEY) {
    console.error('\nMissing THE_ODDS_API_KEY — add it to .env\n');
    process.exit(1);
  }

  const kalshi = new KalshiClient();
  const oddsApi = new OddsApiClient(process.env.THE_ODDS_API_KEY);

  process.stdout.write('Fetching Kalshi game markets... ');
  const rawMarkets = await kalshi.getAllGameMarkets();
  const kalshiGames = KalshiClient.groupByEvent(rawMarkets);
  console.log(`${rawMarkets.length} markets → ${kalshiGames.length} games`);

  process.stdout.write('Fetching sportsbook odds... ');
  const oddsEvents = await oddsApi.getAllOdds();
  console.log(`${oddsEvents.length} events`);

  const matched = matchGames(kalshiGames, oddsEvents);
  console.log(`\nMatched pairs: ${matched.length}`);

  if (matched.length === 0) {
    console.log('\nNo games matched between Kalshi and sportsbooks.');
    console.log('Kalshi games found:');
    kalshiGames.slice(0, 10).forEach((g) =>
      console.log(`  ${g.eventTicker}: ${g.teamA.name} vs ${g.teamB.name}`)
    );
    return;
  }

  const { opportunities, nearMisses } = findArbOpportunities(matched, BANKROLL, NEAR_MISS_THRESHOLD);

  if (opportunities.length > 0) {
    console.log(`\n${'✓ '.repeat(10)}`);
    console.log(`Found ${opportunities.length} arbitrage opportunity(ies)!`);
    opportunities.forEach((o, i) => printEntry(o, `ARB #${i + 1}`));

    const totalProfit = opportunities.reduce((s, o) => s + o.profit, 0);
    console.log(`\n${DIVIDER}`);
    console.log(`  TOTAL POTENTIAL PROFIT: ${usd(totalProfit)}`);
    console.log(DIVIDER);
  } else {
    console.log('\nNo true arbitrage found at this time.');
  }

  if (nearMisses.length > 0) {
    console.log(`\n── Near misses (implied < ${pct(NEAR_MISS_THRESHOLD)}) ──────────────────────────`);
    nearMisses.slice(0, 5).forEach((o, i) => printEntry(o, `NEAR MISS #${i + 1}`));
    if (nearMisses.length > 5)
      console.log(`\n  … and ${nearMisses.length - 5} more.`);
  }

  console.log(`\nScan complete: ${new Date().toLocaleString()}\n`);
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  if (err.response) {
    console.error('HTTP', err.response.status, JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
