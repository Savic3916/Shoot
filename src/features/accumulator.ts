import type { FootballMatch, PlayerSummary, MarketOdd, TeamResult } from './football-data';

export type AccumulatorLeg = {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  market: string;
  selection: string;
  decimalOdds: number;
  estimatedChance: number;
  bookmakerCount: number;
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
const MAX_ODDS_AGE_MS = 6 * 60 * 60 * 1000;

function updatedTime(value: string | null) {
  if (!value) return undefined;
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const time = Date.parse(withTimezone);
  return Number.isFinite(time) ? time : undefined;
}

function canonicalSelection(value: string): 'home-draw' | 'draw-away' | 'home-away' | undefined {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');
  if (
    ['1x', 'home/draw', 'draw/home', 'homeordraw', 'draworhome', 'homeortie'].includes(
      normalized,
    )
  ) {
    return 'home-draw';
  }
  if (
    ['x2', 'draw/away', 'away/draw', 'draworaway', 'awayordraw', 'awayortie'].includes(
      normalized,
    )
  ) {
    return 'draw-away';
  }
  if (['12', '1/2', 'home/away', 'away/home', 'homeaway', 'awayhome', 'homeoraway'].includes(normalized)) {
    return 'home-away';
  }
  return undefined;
}

function successfulResult(result: TeamResult, side: 'home' | 'away') {
  const won = result.goalsFor > result.goalsAgainst;
  const drawn = result.goalsFor === result.goalsAgainst;
  return side === 'home' ? won || drawn : !won;
}

function marketOdds(odds: MarketOdd[]) {
  const groups = new Map<string, MarketOdd[]>();
  for (const odd of odds) {
    const updatedAt = updatedTime(odd.updatedAt);
    if (
      updatedAt === undefined ||
      Date.now() - updatedAt > MAX_ODDS_AGE_MS ||
      updatedAt > Date.now() + 5 * 60 * 1000
    ) {
      continue;
    }
    if (!odd.market.toLowerCase().includes('double chance') || odd.decimal < 1.01 || odd.decimal > 100) {
      continue;
    }
    const selection = canonicalSelection(odd.selection);
    if (!selection) continue;
    const groupKey = `${odd.marketId ?? odd.market}:${odd.bookmaker}`;
    const group = groups.get(groupKey) ?? [];
    group.push(odd);
    groups.set(groupKey, group);
  }

  const probabilities = new Map<string, number[]>();
  const bestPrices = new Map<string, number>();
  for (const group of groups.values()) {
    const implied = group.map((odd) => ({
      odd,
      selection: canonicalSelection(odd.selection),
      probability: 1 / odd.decimal,
    }));
    const margin = implied.reduce((sum, odd) => sum + odd.probability, 0);
    const selections = new Set(implied.map((odd) => odd.selection));
    if (
      !selections.has('home-draw') ||
      !selections.has('draw-away') ||
      !selections.has('home-away') ||
      margin <= 0
    ) {
      continue;
    }

    for (const item of implied) {
      if (!item.selection) continue;
      if (item.selection !== 'home-away') {
        const samples = probabilities.get(item.selection) ?? [];
        // Home/draw, draw/away, and home/away are overlapping outcomes whose
        // fair probabilities sum to 2, not 1.
        samples.push(item.probability * 2 / margin);
        probabilities.set(item.selection, samples);
        const currentBest = bestPrices.get(item.selection) ?? 0;
        if (item.odd.decimal > currentBest) bestPrices.set(item.selection, item.odd.decimal);
      }
    }
  }

  return (['home-draw', 'draw-away'] as const).flatMap((selection) => {
    const samples = probabilities.get(selection);
    const price = bestPrices.get(selection);
    if (!samples?.length || !price) return [];
    return [{
      selection,
      bookmakerProbability: samples.reduce((sum, item) => sum + item, 0) / samples.length,
      price,
      bookmakerCount: samples.length,
    }];
  });
}

function candidateFor(
  fixture: FootballMatch,
  form: Record<string, TeamResult[]>,
  players: Record<string, PlayerSummary[]>,
): AccumulatorLeg | undefined {
  const homeForm = form[fixture.homeTeamId] ?? [];
  const awayForm = form[fixture.awayTeamId] ?? [];
  if (homeForm.length < MIN_FORM_MATCHES || awayForm.length < MIN_FORM_MATCHES) return undefined;

  const recentContributors = [
    ...(players[fixture.homeTeamId] ?? []),
    ...(players[fixture.awayTeamId] ?? []),
  ].filter((player) => player.goals + player.assists > 0);
  const normalized = (name: string) =>
    name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const missingContributor = fixture.unavailable.some((absence) =>
    recentContributors.some((player) => normalized(player.name) === normalized(absence.name)),
  );
  if (missingContributor) return undefined;

  const odds = marketOdds(fixture.odds);
  const candidates = odds.flatMap((odd) => {
    if (odd.price > MAX_LEG_ODDS) return [];
    const isHomeSelection = odd.selection === 'home-draw';
    const selection = isHomeSelection ? 'Home win or draw' : 'Away win or draw';
    const rates = odd.selection === 'home-draw'
      ? [
          ...homeForm.map((result) => successfulResult(result, 'home')),
          ...awayForm.map((result) => successfulResult(result, 'away')),
        ]
      : [
          ...homeForm.map((result) => successfulResult(result, 'away')),
          ...awayForm.map((result) => successfulResult(result, 'home')),
        ];
    const empirical = (2 + rates.filter(Boolean).length) / (4 + rates.length);
    const estimatedChance = Math.max(
      0.02,
      Math.min(0.98, 0.7 * odd.bookmakerProbability + 0.3 * empirical),
    );
    if (estimatedChance < 0.68) return [];

    return [{
      fixtureId: fixture.id,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      competition: fixture.competition,
      market: 'Double chance',
      selection,
      decimalOdds: odd.price,
      estimatedChance,
      bookmakerCount: odd.bookmakerCount,
      formMatches: rates.length,
      unavailableCount: fixture.unavailable.length,
      lineupsPublished: fixture.lineupsPublished,
    }];
  });
  return candidates.sort((a, b) => b.estimatedChance - a.estimatedChance)[0];
}

export function buildDailyAccumulator(
  fixtures: FootballMatch[],
  form: Record<string, TeamResult[]>,
  players: Record<string, PlayerSummary[]>,
): Accumulator | undefined {
  const candidates = fixtures
    .filter(
      (fixture) =>
        ['NOT STARTED', 'NS', 'SCHEDULED', 'TIMED'].includes(fixture.status.toUpperCase()) &&
        new Date(fixture.utcDate).getTime() > Date.now(),
    )
    .map((fixture) => candidateFor(fixture, form, players))
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
