import type { FootballMatch, PlayerSummary, TeamResult } from './football-data';

export type AccumulatorLeg = {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  market: string;
  selection: string;
  decimalOdds: number;
  estimatedChance: number;
  formMatches: number;
  unavailableCount: number;
  lineupsPublished: boolean;
};

export type Accumulator = {
  legs: AccumulatorLeg[];
  combinedOdds: number;
  estimatedChance: number;
};

const MAX_COMBINED_ODDS = 5;
const MAX_LEG_ODDS = 1.9;
const MIN_FORM_MATCHES = 4;

function outcome(result: TeamResult): 'W' | 'D' | 'L' | undefined {
  if (result.outcome) return result.outcome;
  if (result.goalsFor === null || result.goalsAgainst === null) return undefined;
  return result.goalsFor > result.goalsAgainst
    ? 'W'
    : result.goalsFor === result.goalsAgainst
      ? 'D'
      : 'L';
}

function rate(results: TeamResult[], succeeds: (value: 'W' | 'D' | 'L') => boolean) {
  const outcomes = results.map(outcome).filter((value): value is 'W' | 'D' | 'L' => value !== undefined);
  if (!outcomes.length) return undefined;
  const successes = outcomes.filter(succeeds).length;
  return { successes, total: outcomes.length };
}

function candidateFor(
  fixture: FootballMatch,
  form: Record<string, TeamResult[]>,
): AccumulatorLeg | undefined {
  const home = (form[fixture.homeTeamId] ?? []).slice(0, 5);
  const away = (form[fixture.awayTeamId] ?? []).slice(0, 5);
  if (home.length < MIN_FORM_MATCHES || away.length < MIN_FORM_MATCHES) return undefined;

  const options = [
    {
      selection: 'Home win or draw',
      homeRate: rate(home, (value) => value !== 'L'),
      awayRate: rate(away, (value) => value !== 'W'),
    },
    {
      selection: 'Away win or draw',
      homeRate: rate(home, (value) => value !== 'W'),
      awayRate: rate(away, (value) => value !== 'L'),
    },
  ].flatMap((option) => {
    if (!option.homeRate || !option.awayRate) return [];
    const total = option.homeRate.total + option.awayRate.total;
    const successes = option.homeRate.successes + option.awayRate.successes;
    const estimatedChance = (2 + successes) / (4 + total);
    const decimalOdds = 1 / estimatedChance;
    if (estimatedChance < 0.68 || decimalOdds > MAX_LEG_ODDS) return [];
    return [{ ...option, total, estimatedChance, decimalOdds }];
  });

  const best = options.sort((a, b) => b.estimatedChance - a.estimatedChance)[0];
  if (!best) return undefined;
  return {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    competition: fixture.competition,
    market: 'Double chance',
    selection: best.selection,
    decimalOdds: best.decimalOdds,
    estimatedChance: best.estimatedChance,
    formMatches: best.total,
    unavailableCount: fixture.unavailable.length,
    lineupsPublished: fixture.lineupsPublished,
  };
}

export function getFixturePrediction(
  fixture: FootballMatch,
  form: Record<string, TeamResult[]>,
  _players: Record<string, PlayerSummary[]>,
): AccumulatorLeg | undefined {
  if (
    !['NOT STARTED', 'NS', 'SCHEDULED', 'TIMED'].includes(fixture.status.toUpperCase()) ||
    new Date(fixture.utcDate).getTime() <= Date.now()
  ) {
    return undefined;
  }
  return candidateFor(fixture, form);
}

export function buildDailyAccumulator(
  fixtures: FootballMatch[],
  form: Record<string, TeamResult[]>,
  players: Record<string, PlayerSummary[]>,
): Accumulator | undefined {
  const candidates = fixtures
    .map((fixture) => getFixturePrediction(fixture, form, players))
    .filter((leg): leg is AccumulatorLeg => Boolean(leg))
    .sort((a, b) => b.estimatedChance - a.estimatedChance);

  const legs: AccumulatorLeg[] = [];
  let combinedOdds = 1;
  for (const candidate of candidates) {
    if (legs.some((leg) => leg.fixtureId === candidate.fixtureId)) continue;
    if (combinedOdds * candidate.decimalOdds > MAX_COMBINED_ODDS) continue;
    legs.push(candidate);
    combinedOdds *= candidate.decimalOdds;
  }

  if (legs.length < 2) return undefined;
  return {
    legs,
    combinedOdds,
    estimatedChance: legs.reduce((chance, leg) => chance * leg.estimatedChance, 1),
  };
}
