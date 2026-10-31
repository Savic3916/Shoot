import { americanToDecimal } from './odds';

export type League = {
  /** ESPN feed slug. */
  slug: string;
  name: string;
  /** Extra query parameters the feed needs (college feeds only list ranked teams without `groups`). */
  params?: Record<string, string>;
  /** Average points a home team gains. */
  homeEdge: number;
  /** Spread of final margins around the expected margin, in points. */
  sigma: number;
};

export const LEAGUES: League[] = [
  { slug: 'nba', name: 'NBA', homeEdge: 2.5, sigma: 12.5 },
  { slug: 'wnba', name: 'WNBA', homeEdge: 2, sigma: 11 },
  { slug: 'mens-college-basketball', name: 'NCAA Men', params: { groups: '50' }, homeEdge: 3.5, sigma: 11 },
  { slug: 'womens-college-basketball', name: 'NCAA Women', params: { groups: '50' }, homeEdge: 3.5, sigma: 11 },
  { slug: 'nbl', name: 'NBL Australia', homeEdge: 2.5, sigma: 11.5 },
];

export type Game = {
  id: string;
  league: League;
  utcDate: string;
  status: 'NOT STARTED' | 'LIVE' | 'FINISHED';
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Season win-loss records as the feed shows them, e.g. "3-1". */
  homeRecord?: string;
  awayRecord?: string;
  /** Match-winner prices (overtime included), decimal. */
  moneyline?: { home: number; away: number; provider: string };
  /** Points the home team is expected to win by, from the bookmaker's handicap. */
  homeSpread?: number;
};

const ESPN_ROOT = 'https://site.api.espn.com/apis/site/v2/sports/basketball';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function closeOdds(node: unknown) {
  if (!isRecord(node)) return undefined;
  return americanToDecimal(isRecord(node.close) ? node.close.odds : undefined);
}

function parseGame(event: Record<string, unknown>, league: League): Game | undefined {
  const competition = records(event.competitions)[0];
  const competitors = records(competition?.competitors);
  const home = competitors.find((team) => team.homeAway === 'home');
  const away = competitors.find((team) => team.homeAway === 'away');
  const homeTeam = isRecord(home?.team) ? home.team : undefined;
  const awayTeam = isRecord(away?.team) ? away.team : undefined;
  const timestamp = typeof event.date === 'string' ? Date.parse(event.date) : NaN;
  if (!homeTeam || !awayTeam || !Number.isFinite(timestamp) || event.id === undefined) return undefined;

  const state = isRecord(competition?.status) && isRecord(competition.status.type) ? competition.status.type : undefined;
  const status = state?.completed === true || state?.state === 'post' ? 'FINISHED' : state?.state === 'in' ? 'LIVE' : 'NOT STARTED';
  const score = (entry: Record<string, unknown> | undefined) => {
    const value = Number(entry?.score);
    return status !== 'NOT STARTED' && Number.isFinite(value) ? value : null;
  };
  const overall = (entry: Record<string, unknown> | undefined) => {
    const total = records(entry?.records).find((item) => item.type === 'total');
    return typeof total?.summary === 'string' ? total.summary : undefined;
  };

  const odds = records(competition?.odds)[0];
  const ml = isRecord(odds?.moneyline) ? odds.moneyline : undefined;
  const homePrice = closeOdds(ml?.home);
  const awayPrice = closeOdds(ml?.away);
  const provider = isRecord(odds?.provider) && typeof odds.provider.displayName === 'string' ? odds.provider.displayName : 'Bookmaker';
  // "details" reads like "POR -7.5": the named team is favoured by that many points.
  let homeSpread: number | undefined;
  if (typeof odds?.details === 'string' && typeof odds.spread === 'number') {
    const homeFavoured = isRecord(odds.homeTeamOdds) && odds.homeTeamOdds.favorite === true;
    homeSpread = homeFavoured ? Math.abs(odds.spread) : -Math.abs(odds.spread);
  }

  return {
    id: String(event.id),
    league,
    utcDate: new Date(timestamp).toISOString(),
    status,
    homeTeam: String(homeTeam.displayName ?? homeTeam.name ?? 'Home'),
    awayTeam: String(awayTeam.displayName ?? awayTeam.name ?? 'Away'),
    homeTeamId: String(homeTeam.id),
    awayTeamId: String(awayTeam.id),
    homeScore: score(home),
    awayScore: score(away),
    homeRecord: overall(home),
    awayRecord: overall(away),
    moneyline: homePrice && awayPrice ? { home: homePrice, away: awayPrice, provider } : undefined,
    homeSpread,
  };
}

async function fetchLeagueDay(league: League, yyyymmdd: string, signal?: AbortSignal): Promise<Game[]> {
  const endpoint = new URL(`${ESPN_ROOT}/${league.slug}/scoreboard`);
  endpoint.searchParams.set('dates', yyyymmdd);
  endpoint.searchParams.set('limit', '500');
  for (const [key, value] of Object.entries(league.params ?? {})) endpoint.searchParams.set(key, value);
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error('invalid scoreboard response');
  return records(payload.events).flatMap((event) => parseGame(event, league) ?? []);
}

function compactDate(date: string, offsetDays = 0) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10).replaceAll('-', '');
}

export function localDate(timestamp: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Runs requests a few at a time so the free feed is not flooded; failed requests are skipped. */
async function inBatches<T>(tasks: (() => Promise<T>)[], size: number, signal?: AbortSignal) {
  const results: (T | undefined)[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    results.push(
      ...(await Promise.all(
        tasks.slice(i, i + size).map((task) =>
          task().catch((error: unknown) => {
            if (signal?.aborted) throw error;
            return undefined;
          }),
        ),
      )),
    );
  }
  return results;
}

/** Every game of the local day across the covered leagues. */
export async function getGameDay(date: string, timezone: string, signal?: AbortSignal): Promise<Game[]> {
  // The feed groups days in US time, so the neighbouring days can hold this local day's tip-offs.
  const tasks = LEAGUES.flatMap((league) =>
    [-1, 0, 1].map((offset) => () => fetchLeagueDay(league, compactDate(date, offset), signal)),
  );
  const batches = await inBatches(tasks, 8, signal);
  if (!batches.some(Boolean)) throw new Error('The free basketball scoreboard feed could not be reached.');
  const games = batches.flatMap((batch) => batch ?? []).filter((game) => localDate(game.utcDate, timezone) === date);
  return [...new Map(games.map((game) => [game.id, game])).values()].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}

/** Finished games of the given leagues over the previous `days` days, for ratings and grading. */
export async function getRecentResults(date: string, leagues: League[], days: number, signal?: AbortSignal): Promise<Game[]> {
  const tasks = leagues.flatMap((league) =>
    Array.from({ length: days }, (_, i) => () => fetchLeagueDay(league, compactDate(date, -i), signal)),
  );
  const batches = await inBatches(tasks, 10, signal);
  const games = batches.flatMap((batch) => batch ?? []).filter((game) => game.status === 'FINISHED');
  return [...new Map(games.map((game) => [game.id, game])).values()];
}
