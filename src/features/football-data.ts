export const LEAGUES = [
  { code: 'PL', name: 'Premier League', shortName: 'ENG' },
  { code: 'PD', name: 'La Liga', shortName: 'ESP' },
  { code: 'BL1', name: 'Bundesliga', shortName: 'GER' },
  { code: 'SA', name: 'Serie A', shortName: 'ITA' },
  { code: 'FL1', name: 'Ligue 1', shortName: 'FRA' },
] as const;

export type LeagueCode = (typeof LEAGUES)[number]['code'];

export type FootballMatch = {
  id: string;
  utcDate: string;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

export type MatchdayData = {
  competition: string;
  fixtures: FootballMatch[];
  history: FootballMatch[];
  source: 'football-data.org' | 'demo';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseMatches(value: unknown): FootballMatch[] {
  if (!Array.isArray(value)) {
    throw new Error('The match server returned an invalid response.');
  }

  return value.map((item): FootballMatch => {
    if (
      !isRecord(item) ||
      (typeof item.id !== 'string' && typeof item.id !== 'number') ||
      typeof item.utcDate !== 'string' ||
      typeof item.status !== 'string' ||
      typeof item.homeTeam !== 'string' ||
      typeof item.awayTeam !== 'string' ||
      (item.homeGoals !== null && typeof item.homeGoals !== 'number') ||
      (item.awayGoals !== null && typeof item.awayGoals !== 'number')
    ) {
      throw new Error('The match server returned a malformed match.');
    }

    return {
      id: String(item.id),
      utcDate: item.utcDate,
      status: item.status,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      homeGoals: item.homeGoals,
      awayGoals: item.awayGoals,
    };
  });
}

export async function getMatchdayData(
  league: LeagueCode,
  date: string,
  signal?: AbortSignal,
): Promise<MatchdayData> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');

  if (!baseUrl) {
    return makeDemoData(league, date);
  }

  let endpoint: URL;
  try {
    endpoint = new URL(`${baseUrl}/api/matches`);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be a valid absolute URL.');
  }
  const host = endpoint.hostname.replace(/^\[|\]$/g, '');
  const isPrivateLanHost =
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^fd[0-9a-f]{2}:/i.test(host);
  const isLocalDevelopmentHost = host === 'localhost' || host === '127.0.0.1' || isPrivateLanHost;
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLocalDevelopmentHost)) {
    throw new Error('The match server URL must use HTTPS, except for local development.');
  }
  endpoint.searchParams.set('competition', league);
  endpoint.searchParams.set('date', date);

  const response = await fetch(endpoint, { signal });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Match server request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(payload) || typeof payload.competition !== 'string') {
    throw new Error('The match server returned an invalid response.');
  }

  return {
    competition: payload.competition,
    fixtures: parseMatches(payload.fixtures),
    history: parseMatches(payload.history),
    source: 'football-data.org',
  };
}

function makeDemoData(league: LeagueCode, date: string): MatchdayData {
  const leagueInfo = LEAGUES.find((item) => item.code === league);
  if (!leagueInfo) {
    throw new Error('Unknown competition selected.');
  }

  const examples = [
    ['Northbridge FC', 'Harbor Town'],
    ['Riverside United', 'Kingswell City'],
  ];
  const fixtures = examples.map(([homeTeam, awayTeam], index): FootballMatch => ({
    id: `demo-${league}-${index}`,
    utcDate: `${date}T${index === 0 ? '16:00' : '19:30'}:00.000Z`,
    status: 'SCHEDULED',
    homeTeam,
    awayTeam,
    homeGoals: null,
    awayGoals: null,
  }));

  const history: FootballMatch[] = [];
  examples.forEach(([homeTeam, awayTeam], fixtureIndex) => {
    const daysAgo = (days: number) => {
      const day = new Date(`${date}T12:00:00.000Z`);
      day.setUTCDate(day.getUTCDate() - days);
      return day.toISOString();
    };
    const scores = fixtureIndex === 0
      ? [[2, 0], [1, 1], [1, 2], [3, 1], [0, 1], [2, 2], [1, 0], [0, 0]]
      : [[0, 1], [2, 2], [1, 0], [1, 3], [2, 1], [0, 0], [1, 2], [3, 2]];

    scores.forEach(([homeGoals, awayGoals], index) => {
      const reverse = index % 2 === 1;
      history.push({
        id: `demo-history-${fixtureIndex}-${index}`,
        utcDate: daysAgo((index + 1) * 7),
        status: 'FINISHED',
        homeTeam: reverse ? awayTeam : homeTeam,
        awayTeam: reverse ? homeTeam : awayTeam,
        homeGoals: reverse ? awayGoals : homeGoals,
        awayGoals: reverse ? homeGoals : awayGoals,
      });
    });
  });

  return {
    competition: leagueInfo.name,
    fixtures,
    history,
    source: 'demo',
  };
}
