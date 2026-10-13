import type { FootballMatch } from './football-data';

export type MarketPrediction = {
  key: string;
  label: string;
  probability: number;
  decimalOdds: number;
  sampleSize: number;
};

const PRIOR_STRENGTH = 4;
const HEAD_TO_HEAD_WEIGHT = 0.65;

function completed(match: FootballMatch) {
  return (
    match.status === 'FINISHED' &&
    match.homeGoals !== null &&
    match.awayGoals !== null
  );
}

function recentMatches(team: string, matches: FootballMatch[], before: string) {
  return matches
    .filter(
      (match) =>
        completed(match) &&
        match.utcDate < before &&
        (match.homeTeam === team || match.awayTeam === team),
    )
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
    .slice(0, 8);
}

function teamGoals(match: FootballMatch, team: string) {
  return match.homeTeam === team
    ? { scored: match.homeGoals!, conceded: match.awayGoals! }
    : { scored: match.awayGoals!, conceded: match.homeGoals! };
}

function teamResult(match: FootballMatch, team: string) {
  const { scored, conceded } = teamGoals(match, team);
  return scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';
}

function estimate(
  recentGroups: boolean[][],
  headToHead: boolean[],
): Pick<MarketPrediction, 'probability' | 'decimalOdds' | 'sampleSize'> {
  const recent = recentGroups.flat();
  const h2hSuccesses = headToHead.filter(Boolean).length * HEAD_TO_HEAD_WEIGHT;
  const h2hWeight = headToHead.length * HEAD_TO_HEAD_WEIGHT;
  const successes = recent.filter(Boolean).length;
  const totalWeight = PRIOR_STRENGTH + recent.length + h2hWeight;
  const probability = Math.min(
    0.96,
    Math.max(0.04, (PRIOR_STRENGTH / 2 + successes + h2hSuccesses) / totalWeight),
  );

  return {
    probability,
    decimalOdds: 1 / probability,
    sampleSize: recent.length + headToHead.length,
  };
}

export function predictMarkets(
  fixture: FootballMatch,
  history: FootballMatch[],
): MarketPrediction[] {
  const before = fixture.utcDate;
  const home = recentMatches(fixture.homeTeam, history, before);
  const away = recentMatches(fixture.awayTeam, history, before);
  const headToHead = history
    .filter(
      (match) =>
        completed(match) &&
        match.utcDate < before &&
        ((match.homeTeam === fixture.homeTeam && match.awayTeam === fixture.awayTeam) ||
          (match.homeTeam === fixture.awayTeam && match.awayTeam === fixture.homeTeam)),
    )
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
    .slice(0, 5);

  const markets: {
    key: string;
    label: string;
    homeEvent: (match: FootballMatch) => boolean;
    awayEvent: (match: FootballMatch) => boolean;
    h2hEvent: (match: FootballMatch) => boolean;
  }[] = [
    {
      key: 'home-or-draw',
      label: 'Home win or draw',
      homeEvent: (match) => teamResult(match, fixture.homeTeam) !== 'L',
      awayEvent: (match) => teamResult(match, fixture.awayTeam) !== 'W',
      h2hEvent: (match) => teamResult(match, fixture.homeTeam) !== 'L',
    },
    {
      key: 'away-or-draw',
      label: 'Away win or draw',
      homeEvent: (match) => teamResult(match, fixture.homeTeam) !== 'W',
      awayEvent: (match) => teamResult(match, fixture.awayTeam) !== 'L',
      h2hEvent: (match) => teamResult(match, fixture.awayTeam) !== 'L',
    },
    {
      key: 'home-two-plus',
      label: `${fixture.homeTeam} 2+ goals`,
      homeEvent: (match) => teamGoals(match, fixture.homeTeam).scored >= 2,
      awayEvent: (match) => teamGoals(match, fixture.awayTeam).conceded >= 2,
      h2hEvent: (match) => teamGoals(match, fixture.homeTeam).scored >= 2,
    },
    {
      key: 'away-two-plus',
      label: `${fixture.awayTeam} 2+ goals`,
      homeEvent: (match) => teamGoals(match, fixture.homeTeam).conceded >= 2,
      awayEvent: (match) => teamGoals(match, fixture.awayTeam).scored >= 2,
      h2hEvent: (match) => teamGoals(match, fixture.awayTeam).scored >= 2,
    },
    {
      key: 'over-2-5',
      label: 'Over 2.5 total goals',
      homeEvent: (match) => match.homeGoals! + match.awayGoals! > 2,
      awayEvent: (match) => match.homeGoals! + match.awayGoals! > 2,
      h2hEvent: (match) => match.homeGoals! + match.awayGoals! > 2,
    },
  ];

  return markets.map((market) => {
    const prediction = estimate(
      [
        home.map(market.homeEvent),
        away.map(market.awayEvent),
      ],
      headToHead.map(market.h2hEvent),
    );

    return { key: market.key, label: market.label, ...prediction };
  });
}

export function getTeamForm(team: string, history: FootballMatch[], before: string) {
  return recentMatches(team, history, before)
    .slice(0, 5)
    .reverse()
    .map((match) => teamResult(match, team))
    .join('');
}
