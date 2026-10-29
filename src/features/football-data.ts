import { parseMarketOdds, type MarketOdds } from './odds';

/** Cards shown in a finished match; absent when the feed carries no match events for it. */
export type MatchCards = { homeRed: number; awayRed: number; homeYellow: number; awayYellow: number };

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
  /** Bookmaker prices (1X2, totals, handicap) when the feed carries them. */
  market?: MarketOdds;
  leagueId: string;
  cards?: MatchCards;
};

export type MatchdayData = {
  fixtures: FootballMatch[];
  source: 'espn';
  date: string;
  coverageWarnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ESPN_ROOT = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parseScore(value: unknown): number | null {
  const score = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(score) && score >= 0 ? score : null;
}

function competitionName(event: Record<string, unknown>) {
  const slug = isRecord(event.season) && typeof event.season.slug === 'string' ? event.season.slug : '';
  const words = slug.replace(/^\d{4}(-\d{2,4})?-/, '').split('-').filter(Boolean);
  return words.length
    ? words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
    : 'Football';
}

function leagueIdOf(event: Record<string, unknown>) {
  return typeof event.uid === 'string' ? (event.uid.match(/~l:(\d+)/)?.[1] ?? '0') : '0';
}

function parseCards(competition: Record<string, unknown> | undefined, homeId: string, awayId: string) {
  const details = records(competition?.details);
  if (!details.length) return undefined;
  const cards: MatchCards = { homeRed: 0, awayRed: 0, homeYellow: 0, awayYellow: 0 };
  for (const detail of details) {
    const teamId = isRecord(detail.team) ? String(detail.team.id) : '';
    const home = teamId === homeId;
    if (!home && teamId !== awayId) continue;
    if (detail.redCard === true) cards[home ? 'homeRed' : 'awayRed'] += 1;
    else if (detail.yellowCard === true) cards[home ? 'homeYellow' : 'awayYellow'] += 1;
  }
  return cards;
}

export function normalizeEvent(event: Record<string, unknown>) {
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
  const eventCompetitors = competitors;
  const homeEntry = eventCompetitors.find((team) => team.homeAway === 'home');
  const awayEntry = eventCompetitors.find((team) => team.homeAway === 'away');

  return {
    fixture: {
      id,
      utcDate,
      status,
      competition: competitionName(event),
      leagueId: leagueIdOf(event),
      cards: parseCards(competition, homeId, awayId),
      homeTeam: homeName,
      awayTeam: awayName,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeGoals: parseScore(homeEntry?.score),
      awayGoals: parseScore(awayEntry?.score),
      market: parseMarketOdds(records(competition?.odds)[0]),
    } satisfies FootballMatch,
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

function compactDate(date: string, offsetDays = 0) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10).replaceAll('-', '');
}

/** One request returns every competition ESPN covers for the day (scoreboard "all" feed). */
export async function fetchDayEvents(
  yyyymmdd: string,
  signal?: AbortSignal,
): Promise<{ events: Record<string, unknown>[] }> {
  const endpoint = new URL(`${ESPN_ROOT}/all/scoreboard`);
  endpoint.searchParams.set('dates', yyyymmdd);
  endpoint.searchParams.set('limit', '1000');
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    throw new Error('invalid scoreboard response');
  }
  return { events: records(payload.events) };
}

export async function getMatchdayData(
  date: string,
  timezone: string,
  signal?: AbortSignal,
): Promise<MatchdayData> {
  // The feed buckets days in US time, so neighbouring days can hold this local day's kickoffs.
  const days = [-1, 0, 1].map((offset) => compactDate(date, offset));
  const failures: string[] = [];
  const batches = await Promise.all(
    days.map((day) =>
      fetchDayEvents(day, signal).catch((error: unknown) => {
        if (signal?.aborted) throw error;
        failures.push(`${day}: ${error instanceof Error ? error.message : 'request failed'}`);
        return undefined;
      }),
    ),
  );
  if (!batches.some(Boolean)) {
    throw new Error(`The free soccer scoreboard feed could not be reached. ${failures.slice(0, 2).join(' ')}`);
  }

  const fixtures: FootballMatch[] = [];
  for (const batch of batches) {
    for (const event of batch?.events ?? []) {
      const normalized = normalizeEvent(event);
      if (!normalized || localDate(normalized.fixture.utcDate, timezone) !== date) continue;
      fixtures.push(normalized.fixture);
    }
  }
  const uniqueFixtures = [...new Map(fixtures.map((fixture) => [fixture.id, fixture])).values()]
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  return {
    fixtures: uniqueFixtures,
    source: 'espn',
    date,
    coverageWarnings: failures,
  };
}
