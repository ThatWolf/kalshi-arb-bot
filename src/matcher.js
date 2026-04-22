// Kalshi series → Odds API sport key(s) that are valid matches
const SPORT_MAP = {
  KXMLBGAME: ['baseball_mlb'],
  KXNHLGAME: ['icehockey_nhl'],
  KXNBAGAME: ['basketball_nba'],
  KXNFLGAME: ['americanfootball_nfl', 'americanfootball_ncaaf'],
};

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/\b(the|fc|sc|cf|united|city|county|town|athletic|athletics|new|los|san|las|st\.?)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Two team names match if they share a meaningful non-trivial word.
// Handles "San Diego" ↔ "San Diego Padres", "Boston" ↔ "Boston Red Sox", etc.
function teamsMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;

  // Direct containment
  if (na.includes(nb) || nb.includes(na)) return true;

  // Any non-trivial word overlap (length > 3 to skip prepositions / city abbrevs)
  const aWords = na.split(' ').filter((w) => w.length > 3);
  const bWords = nb.split(' ').filter((w) => w.length > 3);
  return aWords.some((w) => bWords.includes(w));
}

/**
 * Match Kalshi game objects against The Odds API events.
 *
 * Kalshi game: { eventTicker, teamA: { name, ... }, teamB: { name, ... } }
 * Odds event:  { home_team, away_team, bookmakers, ... }
 *
 * Returns array of { kalshiGame, oddsEvent }
 */
function matchGames(kalshiGames, oddsEvents) {
  const matches = [];

  for (const game of kalshiGames) {
    const allowedSports = SPORT_MAP[game.sport] || [];

    for (const event of oddsEvents) {
      // Skip if the Odds API event is the wrong sport type
      if (allowedSports.length > 0 && !allowedSports.includes(event.sport_key)) continue;

      const { home_team: home, away_team: away } = event;

      const aMatchesHome = teamsMatch(game.teamA.name, home);
      const aMatchesAway = teamsMatch(game.teamA.name, away);
      const bMatchesHome = teamsMatch(game.teamB.name, home);
      const bMatchesAway = teamsMatch(game.teamB.name, away);

      const isMatch = (aMatchesHome && bMatchesAway) || (aMatchesAway && bMatchesHome);
      if (!isMatch) continue;

      // Reject if game dates are more than 36 hours apart (same teams, different day in a series)
      if (game.occurrenceDatetime && event.commence_time) {
        const kalshiMs = new Date(game.occurrenceDatetime).getTime();
        const oddsMs = new Date(event.commence_time).getTime();
        const diffHours = Math.abs(kalshiMs - oddsMs) / 3_600_000;
        if (diffHours > 12) continue;
      }

      matches.push({ kalshiGame: game, oddsEvent: event });
    }
  }

  return matches;
}

module.exports = { matchGames, teamsMatch };
