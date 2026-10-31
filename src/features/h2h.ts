import { LEAGUES } from '@/constants/leagues';
import type { FootballMatch } from './football-data';
import type { H2HGame } from './insight';
import { outcomeOf } from './markets';
import { loadJson, saveJson } from '@/lib/storage';

const ROOT = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
/** ESPN's league schedules reach back to about the 2003 season. */
const FIRST_SEASON = 2003;
/** A club absent from the league this many seasons in a row (relegated or never there) ends the search. */
const MAX_EMPTY_SEASONS = 3;
const CACHE_PREFIX = 'h2h:season:v1:';
/** Old meetings count less: squads, coaches and owners change. Weight halves every four years. */
const HALF_LIFE_YEARS = 4;
/** A meeting at the other team's ground counts for less than one at the same venue as this match. */
const OTHER_VENUE_WEIGHT = 0.7;

type SeasonGame = H2HGame & { homeId: string; awayId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function score(value: unknown): number | undefined {
  const raw = isRecord(value) ? (value.value ?? value.displayValue) : value;
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(n) ? n : undefined;
}

/** One club's finished league games of one season. Finished seasons are kept on the device for good. */
async function teamSeason(slug: string, teamId: string, season: number, cacheable: boolean, signal?: AbortSignal) {
  const key = `${CACHE_PREFIX}${slug}:${teamId}:${season}`;
  if (cacheable) {
    const cached = await loadJson<SeasonGame[] | null>(key, null);
    if (cached) return cached;
  }
  const response = await fetch(`${ROOT}/${slug}/teams/${teamId}/schedule?season=${season}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  const games: SeasonGame[] = [];
  for (const event of list(isRecord(payload) ? payload.events : undefined)) {
    const competition = list(event.competitions)[0];
    const status = isRecord(competition?.status) && isRecord(competition.status.type) ? competition.status.type : undefined;
    if (status?.completed !== true) continue;
    const competitors = list(competition?.competitors);
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    const homeTeam = isRecord(home?.team) ? home.team : undefined;
    const awayTeam = isRecord(away?.team) ? away.team : undefined;
    const homeGoals = score(home?.score);
    const awayGoals = score(away?.score);
    if (!homeTeam || !awayTeam || homeGoals === undefined || awayGoals === undefined) continue;
    games.push({
      date: String(event.date ?? ''),
      home: String(homeTeam.displayName ?? homeTeam.name ?? ''),
      away: String(awayTeam.displayName ?? awayTeam.name ?? ''),
      homeId: String(homeTeam.id),
      awayId: String(awayTeam.id),
      homeGoals,
      awayGoals,
    });
  }
  if (cacheable) await saveJson(key, games);
  return games;
}

const meetingsCache = new Map<string, Promise<H2HGame[]>>();

/**
 * Every league meeting of the two clubs since 2003, newest first, merged with the recent meetings
 * from the match summary (which also covers cups). Seasons are read newest first and the search
 * stops once the home club has been out of the league for several seasons in a row.
 */
export function allMeetings(fixture: FootballMatch, recent: H2HGame[], signal?: AbortSignal): Promise<H2HGame[]> {
  const cached = meetingsCache.get(fixture.id);
  if (cached) return cached;
  const request = (async () => {
    const slug = LEAGUES[fixture.leagueId]?.[2];
    const found: H2HGame[] = [...recent];
    // Domestic leagues only: cup and continental schedules hold too few meetings to be worth it.
    if (slug && /\.\d$/.test(slug)) {
      const thisYear = new Date(fixture.utcDate).getUTCFullYear();
      let empty = 0;
      for (let season = thisYear; season >= FIRST_SEASON && empty < MAX_EMPTY_SEASONS; season -= 3) {
        const seasons = [season, season - 1, season - 2].filter((year) => year >= FIRST_SEASON);
        const batches = await Promise.all(
          seasons.map((year) =>
            teamSeason(slug, fixture.homeTeamId, year, year <= thisYear - 2, signal).catch((error: unknown) => {
              if (signal?.aborted) throw error;
              return undefined;
            }),
          ),
        );
        for (const games of batches) {
          // A failed request says nothing about whether the club was in the league.
          if (games === undefined) continue;
          empty = games.length ? 0 : empty + 1;
          found.push(
            ...games.filter(
              (game) =>
                (game.homeId === fixture.homeTeamId && game.awayId === fixture.awayTeamId) ||
                (game.homeId === fixture.awayTeamId && game.awayId === fixture.homeTeamId),
            ).map(({ homeId: _h, awayId: _a, ...game }) => game),
          );
        }
      }
    }
    // The summary and the schedules list the same recent league games; keep one of each.
    const unique = new Map(found.map((game) => [game.date.slice(0, 10), game]));
    return [...unique.values()].sort((a, b) => b.date.localeCompare(a.date));
  })();
  meetingsCache.set(fixture.id, request);
  request.catch(() => meetingsCache.delete(fixture.id));
  if (meetingsCache.size > 400) meetingsCache.delete(meetingsCache.keys().next().value!);
  return request;
}

export type MeetingSupport = {
  /** Smoothed, recency- and venue-weighted share of meetings this bet would have won. */
  support: number;
  hits: number;
  games: number;
  since?: number;
};

/** How often this exact bet would have won in the clubs' past meetings, seen from today's home side. */
export function meetingSupport(key: string, fixture: FootballMatch, meetings: H2HGame[]): MeetingSupport | undefined {
  const now = Date.parse(fixture.utcDate);
  let weightedHits = 0;
  let weightedGames = 0;
  let hits = 0;
  let games = 0;
  let oldest: string | undefined;
  for (const game of meetings) {
    const sameVenue = game.home === fixture.homeTeam;
    const won = sameVenue ? outcomeOf(key, game.homeGoals, game.awayGoals) : outcomeOf(key, game.awayGoals, game.homeGoals);
    if (won === null) continue;
    const years = Math.max(0, (now - Date.parse(game.date)) / (365.25 * 86_400_000));
    const weight = 0.5 ** (years / HALF_LIFE_YEARS) * (sameVenue ? 1 : OTHER_VENUE_WEIGHT);
    weightedGames += weight;
    games += 1;
    if (won) {
      weightedHits += weight;
      hits += 1;
    }
    if (!oldest || game.date < oldest) oldest = game.date;
  }
  if (!games) return undefined;
  return {
    support: (weightedHits + 1) / (weightedGames + 2),
    hits,
    games,
    since: oldest ? new Date(oldest).getUTCFullYear() : undefined,
  };
}
