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
  goalsFor: number | null;
  goalsAgainst: number | null;
  outcome?: 'W' | 'D' | 'L';
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
  source: 'espn';
  date: string;
  coverageWarnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ESPN_ROOT = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const SCOREBOARD_LEAGUES = [
  'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'uefa.nations',
  'eng.1', 'eng.2', 'eng.3', 'eng.4', 'eng.fa', 'eng.league_cup',
  'esp.1', 'esp.2', 'esp.copa_del_rey', 'ger.1', 'ger.2', 'ger.dfb_pokal',
  'ita.1', 'ita.2', 'ita.coppa_italia', 'fra.1', 'fra.2', 'fra.coupe_de_france',
  'ned.1', 'por.1', 'sco.1', 'bel.1', 'tur.1', 'bra.1', 'arg.1', 'mex.1',
  'usa.1', 'conmebol.libertadores', 'conmebol.sudamericana', 'aus.1', 'jpn.1',
];

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parseScore(value: unknown): number | null {
  const score = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(score) && score >= 0 ? score : null;
}

function getForm(value: unknown, utcDate: string): TeamResult[] {
  if (typeof value !== 'string') return [];
  return (value.toUpperCase().match(/[WDL]/g) ?? []).map((outcome, index) => ({
    utcDate: `${utcDate}#${index}`,
    opponent: 'Recent form',
    goalsFor: null,
    goalsAgainst: null,
    outcome: outcome as 'W' | 'D' | 'L',
  }));
}

function normalizeEvent(event: Record<string, unknown>, defaultCompetition: string) {
  const competition = records(event.competitions)[0];
  const competitors = records(competition?.competitors);
  const home = competitors.find((team) => team.homeAway === 'home');
  const away = competitors.find((team) => team.homeAway === 'away');
  const homeTeam = isRecord(home?.team) ? home.team : undefined;
  const awayTeam = isRecord(away?.team) ? away.team : undefined;
  const timestamp = typeof event.date === 'string' ? Date.parse(event.date) : NaN;
  const utcDate = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
  const id = typeof event.id === 'string' || typeof event.id === 'number'
    ? String(event.id)
    : undefined;
  const homeId = homeTeam?.id === undefined ? '' : String(homeTeam.id);
  const awayId = awayTeam?.id === undefined ? '' : String(awayTeam.id);
  const homeName = homeTeam?.displayName ?? homeTeam?.name;
  const awayName = awayTeam?.displayName ?? awayTeam?.name;
  if (
    !utcDate ||
    !id ||
    !homeId ||
    !awayId ||
    typeof homeName !== 'string' ||
    typeof awayName !== 'string'
  ) {
    return undefined;
  }

  const statusType = isRecord(competition?.status) && isRecord(competition.status.type)
    ? competition.status.type
    : undefined;
  const status = statusType?.completed === true || statusType?.state === 'post'
    ? 'FINISHED'
    : statusType?.state === 'in'
      ? 'LIVE'
      : statusType?.state === 'pre'
        ? 'NOT STARTED'
        : typeof statusType?.detail === 'string'
          ? statusType.detail
          : 'UNKNOWN';
  const league = records(event.competitions).find((item) => typeof item.name === 'string');
  const eventCompetitors = competitors;
  const homeEntry = eventCompetitors.find((team) => team.homeAway === 'home');
  const awayEntry = eventCompetitors.find((team) => team.homeAway === 'away');

  return {
    fixture: {
      id,
      utcDate,
      status,
      competition: typeof league?.name === 'string' ? league.name : defaultCompetition,
      homeTeam: homeName,
      awayTeam: awayName,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeGoals: parseScore(homeEntry?.score),
      awayGoals: parseScore(awayEntry?.score),
      odds: [],
      unavailable: [],
      lineupsPublished: false,
      expectedPlayers: [],
    } satisfies FootballMatch,
    homeForm: getForm(home?.form, utcDate),
    awayForm: getForm(away?.form, utcDate),
  };
}

function localDate(timestamp: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function getMatchdayData(
  date: string,
  timezone: string,
  signal?: AbortSignal,
): Promise<MatchdayData> {
  const failures: string[] = [];
  const scoreboards: { league: string; events: Record<string, unknown>[] }[] = [];
  let nextLeague = 0;
  async function worker() {
    while (nextLeague < SCOREBOARD_LEAGUES.length) {
      const league = SCOREBOARD_LEAGUES[nextLeague];
      nextLeague += 1;
      const endpoint = new URL(`${ESPN_ROOT}/${league}/scoreboard`);
      endpoint.searchParams.set('dates', date.replaceAll('-', ''));
      try {
        const response = await fetch(endpoint, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload: unknown = await response.json();
        if (!isRecord(payload) || !Array.isArray(payload.events)) {
          throw new Error('invalid scoreboard response');
        }
        const events = records(payload.events);
        const leagueName = records(payload.leagues)[0]?.name;
        scoreboards.push({
          league: typeof leagueName === 'string' ? leagueName : league,
          events,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        failures.push(`${league}: ${error instanceof Error ? error.message : 'request failed'}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));
  if (!scoreboards.length) {
    throw new Error(`The free soccer scoreboard feed could not be reached. ${failures.slice(0, 2).join(' ')}`);
  }

  const fixtures: FootballMatch[] = [];
  const form: Record<string, TeamResult[]> = {};
  const players: Record<string, PlayerSummary[]> = {};
  for (const scoreboard of scoreboards) {
    for (const event of scoreboard.events) {
      const normalized = normalizeEvent(event, scoreboard.league);
      if (!normalized || localDate(normalized.fixture.utcDate, timezone) !== date) continue;
      const { fixture, homeForm, awayForm } = normalized;
      fixtures.push(fixture);
      if ((form[fixture.homeTeamId]?.length ?? 0) < homeForm.length) {
        form[fixture.homeTeamId] = homeForm;
      }
      if ((form[fixture.awayTeamId]?.length ?? 0) < awayForm.length) {
        form[fixture.awayTeamId] = awayForm;
      }
    }
  }
  const uniqueFixtures = [...new Map(fixtures.map((fixture) => [fixture.id, fixture])).values()]
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  return {
    fixtures: uniqueFixtures,
    form,
    players,
    source: 'espn',
    date,
    coverageWarnings: failures,
  };
}
