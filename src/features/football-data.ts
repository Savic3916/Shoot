export type MarketOdd = {
  market: string;
  marketId: number | null;
  selection: string;
  decimal: number;
  bookmaker: string;
  updatedAt: string | null;
};

export type PlayerAbsence = {
  name: string;
  reason: string;
  category: string;
};

export type FootballMatch = {
  id: string;
  utcDate: string;
  status: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  odds: MarketOdd[];
  unavailable: PlayerAbsence[];
  lineupsPublished: boolean;
  expectedPlayers: string[];
};

export type TeamResult = {
  utcDate: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
};

export type PlayerSummary = {
  id: string;
  name: string;
  appearances: number;
  goals: number;
  assists: number;
  minutes: number;
  averageRating: number | null;
};

export type MatchdayData = {
  fixtures: FootballMatch[];
  form: Record<string, TeamResult[]>;
  players: Record<string, PlayerSummary[]>;
  source: 'sportmonks';
  date: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseMatch(value: unknown): FootballMatch {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.utcDate !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.competition !== 'string' ||
    typeof value.homeTeam !== 'string' ||
    typeof value.awayTeam !== 'string' ||
    typeof value.homeTeamId !== 'string' ||
    typeof value.awayTeamId !== 'string' ||
    (value.homeGoals !== null && typeof value.homeGoals !== 'number') ||
    (value.awayGoals !== null && typeof value.awayGoals !== 'number') ||
    !Array.isArray(value.odds) ||
    !Array.isArray(value.unavailable) ||
    typeof value.lineupsPublished !== 'boolean' ||
    !Array.isArray(value.expectedPlayers) ||
    !value.expectedPlayers.every((player) => typeof player === 'string')
  ) {
    throw new Error('The match service returned an invalid fixture.');
  }

  const odds: MarketOdd[] = value.odds.map((odd) => {
    if (
      !isRecord(odd) ||
      typeof odd.market !== 'string' ||
      (odd.marketId !== null && typeof odd.marketId !== 'number') ||
      typeof odd.selection !== 'string' ||
      typeof odd.decimal !== 'number' ||
      !Number.isFinite(odd.decimal) ||
      typeof odd.bookmaker !== 'string' ||
      (odd.updatedAt !== null && typeof odd.updatedAt !== 'string')
    ) {
      throw new Error('The match service returned an invalid odds entry.');
    }
    return {
      market: odd.market,
      marketId: odd.marketId,
      selection: odd.selection,
      decimal: odd.decimal,
      bookmaker: odd.bookmaker,
      updatedAt: odd.updatedAt,
    };
  });
  const unavailable: PlayerAbsence[] = value.unavailable.map((player) => {
    if (
      !isRecord(player) ||
      typeof player.name !== 'string' ||
      typeof player.reason !== 'string' ||
      typeof player.category !== 'string'
    ) {
      throw new Error('The match service returned invalid availability data.');
    }
    return { name: player.name, reason: player.reason, category: player.category };
  });

  return {
    id: value.id,
    utcDate: value.utcDate,
    status: value.status,
    competition: value.competition,
    homeTeam: value.homeTeam,
    awayTeam: value.awayTeam,
    homeTeamId: value.homeTeamId,
    awayTeamId: value.awayTeamId,
    homeGoals: value.homeGoals,
    awayGoals: value.awayGoals,
    odds,
    unavailable,
    lineupsPublished: value.lineupsPublished,
    expectedPlayers: value.expectedPlayers,
  };
}

export async function getMatchdayData(
  date: string,
  timezone: string,
  signal?: AbortSignal,
): Promise<MatchdayData> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error(
      'Live fixtures, odds, and predictions are not configured. Set up the Sportmonks token and API URL as described in the Model tab.',
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(`${baseUrl}/api/matches`);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be a valid absolute URL.');
  }
  const host = endpoint.hostname.replace(/^\[|\]$/g, '');
  const localHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^fd[0-9a-f]{2}:/i.test(host);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && localHost)) {
    throw new Error('The match service URL must use HTTPS, except for local development.');
  }
  endpoint.searchParams.set('date', date);
  endpoint.searchParams.set('timezone', timezone);

  const response = await fetch(endpoint, { signal });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Match service request failed (${response.status}).`,
    );
  }
  if (
    !isRecord(payload) ||
    payload.source !== 'sportmonks' ||
    payload.date !== date ||
    !Array.isArray(payload.fixtures) ||
    !isRecord(payload.form) ||
    !isRecord(payload.players)
  ) {
    throw new Error('The match service returned an invalid response.');
  }

  const form: Record<string, TeamResult[]> = {};
  const players: Record<string, PlayerSummary[]> = {};
  for (const [teamId, results] of Object.entries(payload.form)) {
    if (!Array.isArray(results)) throw new Error('The match service returned invalid team form.');
    form[teamId] = results.map((result) => {
      if (
        !isRecord(result) ||
        typeof result.utcDate !== 'string' ||
        typeof result.opponent !== 'string' ||
        typeof result.goalsFor !== 'number' ||
        typeof result.goalsAgainst !== 'number'
      ) {
        throw new Error('The match service returned an invalid past result.');
      }
      return {
        utcDate: result.utcDate,
        opponent: result.opponent,
        goalsFor: result.goalsFor,
        goalsAgainst: result.goalsAgainst,
      };
    });
  }
  for (const [teamId, summaries] of Object.entries(payload.players)) {
    if (!Array.isArray(summaries)) {
      throw new Error('The match service returned invalid player summaries.');
    }
    players[teamId] = summaries.map((summary) => {
      if (
        !isRecord(summary) ||
        typeof summary.id !== 'string' ||
        typeof summary.name !== 'string' ||
        typeof summary.appearances !== 'number' ||
        typeof summary.goals !== 'number' ||
        typeof summary.assists !== 'number' ||
        typeof summary.minutes !== 'number' ||
        (summary.averageRating !== null && typeof summary.averageRating !== 'number')
      ) {
        throw new Error('The match service returned an invalid player summary.');
      }
      return {
        id: summary.id,
        name: summary.name,
        appearances: summary.appearances,
        goals: summary.goals,
        assists: summary.assists,
        minutes: summary.minutes,
        averageRating: summary.averageRating,
      };
    });
  }

  return {
    fixtures: payload.fixtures.map(parseMatch),
    form,
    players,
    source: 'sportmonks',
    date,
  };
}
