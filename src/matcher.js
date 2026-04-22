// Normalization strips common filler words so "New York Knicks" matches "Knicks"
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/\b(the|fc|sc|cf|united|city|county|town|athletic|athletics|new|los|san|las|st\.?|at)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastWord(str) {
  const words = normalize(str).split(' ').filter(Boolean);
  return words[words.length - 1] || '';
}

// Two team references match if they share a meaningful word (usually city/mascot)
function teamsMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  const aLast = lastWord(a);
  const bLast = lastWord(b);
  return (
    na === nb ||
    na.includes(nb) ||
    nb.includes(na) ||
    (aLast.length > 3 && nb.includes(aLast)) ||
    (bLast.length > 3 && na.includes(bLast))
  );
}

function extractTeamsFromTitle(title) {
  if (!title) return null;

  // "Will the Kansas City Chiefs beat the Buffalo Bills [in…]"
  let m = title.match(
    /will (?:the )?(.+?) (?:beat|defeat|win against|top|overcome|beat out) (?:the )?(.+?)(?:\?|$|\s+in\s|\s+during\s)/i
  );
  if (m) return [m[1].trim(), m[2].trim()];

  // "Chiefs vs Bills" / "Chiefs v Bills" / "Chiefs vs. Bills — Game 7"
  m = title.match(/(.+?)\s+vs?\.?\s+(.+?)(?:\?|$|\s*[-–—|]|\s+\()/i);
  if (m) return [m[1].trim(), m[2].trim()];

  // "Who will win: Chiefs or Bills?"
  m = title.match(/who will win[:\s]+(.+?) or (.+?)(?:\?|$)/i);
  if (m) return [m[1].trim(), m[2].trim()];

  // "Chiefs-Bills winner" style
  m = title.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)-([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);
  if (m) return [m[1].trim(), m[2].trim()];

  return null;
}

/**
 * Pairs Kalshi sports markets with The Odds API events by team-name overlap.
 *
 * Returns an array of:
 *   { kalshiMarket, oddsEvent, yesIsHome }
 *
 * yesIsHome=true means Kalshi YES maps to the home team winning.
 */
function matchMarkets(kalshiMarkets, oddsEvents) {
  const matches = [];

  for (const km of kalshiMarkets) {
    const teams = extractTeamsFromTitle(km.title || km.subtitle || '');
    if (!teams) continue;
    const [team1, team2] = teams;

    for (const event of oddsEvents) {
      const { home_team: home, away_team: away } = event;

      const t1Home = teamsMatch(team1, home);
      const t1Away = teamsMatch(team1, away);
      const t2Home = teamsMatch(team2, home);
      const t2Away = teamsMatch(team2, away);

      // Valid if team1 maps to one side and team2 maps to the other
      const crossMatch = (t1Home && t2Away) || (t1Away && t2Home);
      if (!crossMatch) continue;

      const yesIsHome = t1Home && t2Away;
      matches.push({ kalshiMarket: km, oddsEvent: event, yesIsHome });
    }
  }

  return matches;
}

module.exports = { matchMarkets, extractTeamsFromTitle, teamsMatch };
