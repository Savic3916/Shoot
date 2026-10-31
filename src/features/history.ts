import { fetchDayEvents, normalizeEvent, type MatchCards, type MatchShots } from './football-data';
import { loadJson, saveJson } from '@/lib/storage';

export type PastResult = {
  id: string;
  utcDate: string;
  leagueId: string;
  competition: string;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  cards?: MatchCards;
  shots?: MatchShots;
};

const HISTORY_DAYS = 45;
// v3 adds shots.
const CACHE_PREFIX = 'results:v3:';

function compact(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function daysAgo(today: string, offset: number) {
  const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

async function resultsForDay(yyyymmdd: string, cacheable: boolean, signal?: AbortSignal) {
  if (cacheable) {
    const cached = await loadJson<PastResult[] | null>(CACHE_PREFIX + yyyymmdd, null);
    if (cached) return cached;
  }
  const { events } = await fetchDayEvents(yyyymmdd, signal);
  const results: PastResult[] = [];
  for (const event of events) {
    const normalized = normalizeEvent(event);
    if (!normalized) continue;
    const { fixture } = normalized;
    if (fixture.status !== 'FINISHED' || fixture.homeGoals === null || fixture.awayGoals === null) {
      continue;
    }
    results.push({
      id: fixture.id,
      utcDate: fixture.utcDate,
      leagueId: fixture.leagueId,
      competition: fixture.competition,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeGoals: fixture.homeGoals,
      awayGoals: fixture.awayGoals,
      cards: fixture.cards,
      shots: fixture.shots,
    });
  }
  // Days older than yesterday cannot change any more, so they are cached for good.
  if (cacheable) await saveJson(CACHE_PREFIX + yyyymmdd, results);
  return results;
}

/**
 * Completed results for roughly the last 45 days across every competition the feed covers.
 * Settled days are cached on the device, so only the first launch downloads the full window.
 */
export async function getRecentResults(today: string, signal?: AbortSignal): Promise<PastResult[]> {
  const offsets = Array.from({ length: HISTORY_DAYS }, (_, index) => index + 1);
  const collected: PastResult[] = [];
  let next = 0;
  async function worker() {
    while (next < offsets.length) {
      const offset = offsets[next];
      next += 1;
      try {
        collected.push(...(await resultsForDay(compact(daysAgo(today, offset)), offset > 2, signal)));
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  return [...new Map(collected.map((result) => [result.id, result])).values()];
}
