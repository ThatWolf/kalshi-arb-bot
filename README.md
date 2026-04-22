# kalshi-arb-bot

A Node.js arbitrage scanner that compares Kalshi prediction-market prices against
sportsbook odds from [The Odds API](https://the-odds-api.com). When the combined
implied probability of two opposing sides is below 100 %, the bot prints the
guaranteed-profit stake split across the two books.

## How arbitrage works here

Kalshi sells binary YES/NO contracts for sports events. A YES contract purchased
at **60 ¢** pays **$1** if YES, making the implied probability 60 %. If a
sportsbook simultaneously offers the opposing outcome (Team B wins) at decimal
odds that imply **< 40 %**, the combined book is **< 100 %** — and a
risk-free profit is available by betting both sides proportionally.

```
Stake (side i) = Bankroll × (implied_prob_i / Σ implied_probs)
Guaranteed payout = Bankroll / Σ implied_probs
Guaranteed profit = Payout − Bankroll
```

## Quickstart

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/kalshi-arb-bot.git
cd kalshi-arb-bot
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
# Edit .env with your Kalshi email/password and Odds API key
```

| Variable | Where to get it |
|---|---|
| `KALSHI_EMAIL` | Your Kalshi login email |
| `KALSHI_PASSWORD` | Your Kalshi login password |
| `THE_ODDS_API_KEY` | [the-odds-api.com](https://the-odds-api.com) – free tier: 500 req/month |

### 3. Run

```bash
npm start
```

## Example output

```
════════════════════════════════════════════════════════════════
  Kalshi Arbitrage Bot
  Bankroll: $1000.00   |   Started: 4/22/2026, 9:00:00 AM
════════════════════════════════════════════════════════════════
Authenticating with Kalshi... OK
Fetching markets (parallel)... OK

  Kalshi open markets      : 432
  Kalshi sports markets    : 38
  Odds API events          : 76
  Matched pairs            : 12

✓ Found 1 arbitrage opportunity!

────────────────────────────────────────────────────────────────
[ARB #1] Kalshi YES + Sportsbook NO
────────────────────────────────────────────────────────────────
  Event:             Celtics @ Lakers
  Sport:             NBA
  Kickoff:           4/22/2026, 8:00:00 PM

  Kalshi side:       YES on KXNBA-LAKERSBEATCELTICS-20260422
  Kalshi price:      45¢  →  2.2222x  (impl 45.00%)

  Bookmaker:         DraftKings
  SB side:           Boston Celtics
  SB odds:           2.4000x  (impl 41.67%)

  Total implied:     86.67%  ← ARBITRAGE

  Stake (Kalkalshi): $519.23
  Stake (SB):        $480.77
  Guaranteed payout: $1153.85
  Guaranteed profit: $153.85  (ROI 15.39%)
```

## Project structure

```
src/
  index.js    — entry point: orchestrates fetch → match → analyze → print
  kalshi.js   — Kalshi REST API v2 client (auth + market fetching)
  oddsApi.js  — The Odds API client (h2h odds for major US sports)
  matcher.js  — fuzzy team-name matching between Kalshi titles and Odds API events
  arb.js      — arbitrage math: implied probabilities, stake sizing, near-miss detection
```

## Supported sports

NFL · NBA · MLB · NHL · MLS · NCAAF · NCAAB

## Notes & limitations

- **Market matching is heuristic.** Kalshi market titles are free-form; the bot
  uses regex + keyword overlap to pair them with structured Odds API events.
  Some matches may be missed or incorrect — always verify before placing a trade.
- **This is a read-only scanner.** No trades are placed automatically.
- **Kalshi prices are directional.** The bot checks both YES+sbNO and NO+sbYES
  legs independently.
- **Near misses** (total implied prob < `NEAR_MISS_THRESHOLD`, default 105 %) are
  displayed without stake sizes — useful for monitoring lines that are close to arb.
- Real arbitrage on prediction markets is rare and closes quickly. Use this as a
  starting point, not a guaranteed income stream.

## License

MIT
