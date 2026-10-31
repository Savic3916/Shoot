// Replays past days with the app's own model and slip rules and grades every slip.
// Usage: npx tsx --tsconfig scripts/backtest/tsconfig.json scripts/backtest/run.ts [days=30]
//
// Each day is rebuilt as it looked before kick-off: the bookmaker's pre-match prices (kept in each
// match's summary) and only results from earlier days. The news, five-game and head-to-head
// checks need per-match downloads of data that may include later games, so they are left out;
// the screening stage and the slip search are exactly the app's.
import { analyseFixture } from '@/features/analysis';
import { isTrustedCompetition } from '@/features/competitions';
import { fetchDayEvents, normalizeEvent, type FootballMatch } from '@/features/football-data';
import { getRecentResults } from '@/features/history';
import { DEFAULT_LEARNED } from '@/features/learning';
import { outcomeOf } from '@/features/markets';
import { parseMarketOdds, type MarketOdds } from '@/features/odds';
import { chooseDay, combinedStats, type Candidate } from '@/features/picks';
import { screenCandidates } from '@/features/pipeline';
import { fitRatings } from '@/features/ratings';
import { buildTeamHistory } from '@/features/risk';
import { loadJson, saveJson } from '@/lib/storage';

const DAYS = Number(process.argv[2] ?? 30);
const ROOT = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

function isoDay(offset: number) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

/** Pre-match prices of a finished match, from its summary; cached on disk. */
async function preMatchOdds(fixture: FootballMatch): Promise<MarketOdds | null> {
  const key = `odds:${fixture.id}`;
  const cached = await loadJson<MarketOdds | null | undefined>(key, undefined);
  if (cached !== undefined) return cached;
  try {
    const response = await fetch(`${ROOT}/all/summary?event=${fixture.id}`);
    const payload = (await response.json()) as { pickcenter?: unknown[] };
    const market = parseMarketOdds(payload.pickcenter?.[0]) ?? null;
    await saveJson(key, market);
    return market;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await task(items[index]);
      }
    }),
  );
  return out;
}

type Graded = { won: boolean | null; pick: Candidate };

function grade(pick: Candidate, fixture: FootballMatch): Graded {
  return { pick, won: outcomeOf(pick.key, fixture.homeGoals ?? 0, fixture.awayGoals ?? 0) };
}

const slips: { date: string; legs: Graded[]; odds: number; chance: number }[] = [];
const allBets: Graded[] = [];

for (let offset = DAYS; offset >= 1; offset--) {
  const date = isoDay(offset);
  const { events } = await fetchDayEvents(date.replaceAll('-', ''));
  const finished = events
    .map((event) => normalizeEvent(event)?.fixture)
    .filter((f): f is FootballMatch => !!f && f.status === 'FINISHED' && f.homeGoals !== null && isTrustedCompetition(f));
  const markets = await mapLimit(finished, 8, preMatchOdds);
  // The match as it looked before kick-off: no score, not started, pre-match prices.
  const before = finished.map((f, i): FootballMatch => ({
    ...f, status: 'NOT STARTED', homeGoals: null, awayGoals: null, cards: undefined, market: markets[i] ?? undefined,
  }));
  const results = await getRecentResults(date);
  const ratings = fitRatings(results, Date.parse(`${date}T00:00:00Z`));
  const analyses = new Map(
    before.flatMap((f) => {
      const analysis = analyseFixture(f, ratings, DEFAULT_LEARNED);
      return analysis ? [[f.id, analysis] as const] : [];
    }),
  );
  const pool = screenCandidates({ date, fixtures: before }, analyses, buildTeamHistory(results));
  const byId = new Map(finished.map((f) => [f.id, f]));
  allBets.push(...pool.map((pick) => grade(pick, byId.get(pick.fixtureId)!)));
  const picks = chooseDay(pool);
  const legs = picks.map((pick) => grade(pick as Candidate, byId.get(pick.fixtureId)!));
  const stats = combinedStats(picks);
  if (legs.length) slips.push({ date, legs, odds: stats.odds, chance: stats.chance });
  const outcome = !legs.length ? 'no slip' : legs.every((leg) => leg.won !== false) ? 'WON ' : 'lost';
  console.log(
    `${date}  ${String(finished.length).padStart(3)} matches, ${String(pool.length).padStart(4)} bets  ${outcome}` +
      (legs.length ? `  ${stats.odds.toFixed(2)} @ ${(stats.chance * 100).toFixed(0)}%  ` + legs.map((l) => `${l.won === false ? '✗' : '✓'} ${l.pick.label}`).join(' | ') : ''),
  );
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const won = slips.filter((slip) => slip.legs.every((leg) => leg.won !== false));
// A void leg (handicap push) pays back its stake, so it counts as odds 1.
const returns = won.reduce((sum, slip) => sum + slip.legs.reduce((p, leg) => p * (leg.won === null ? 1 : leg.pick.odds), 1), 0);
console.log(`\nSlips: ${won.length} of ${slips.length} won (${pct(won.length / slips.length)}); model expected ${pct(slips.reduce((s, x) => s + x.chance, 0) / slips.length)}.`);
console.log(`Flat 1-unit stakes: returned ${returns.toFixed(2)} for ${slips.length} staked (${pct(returns / slips.length - 1)} profit) at the odds shown.`);
const legs = slips.flatMap((slip) => slip.legs);
console.log(`Legs: ${legs.filter((l) => l.won !== false).length} of ${legs.length} won; model expected ${pct(legs.reduce((s, l) => s + l.pick.conservative, 0) / legs.length)}.`);

console.log('\nCalibration of every screened bet (model chance -> how often it actually won):');
for (let low = 0.6; low < 1; low += 0.05) {
  const bucket = allBets.filter((b) => b.won !== null && b.pick.conservative >= low && b.pick.conservative < low + 0.05);
  if (bucket.length < 20) continue;
  const hit = bucket.filter((b) => b.won).length / bucket.length;
  console.log(`  ${pct(low).padStart(6)}-${pct(low + 0.05).padEnd(6)} ${String(bucket.length).padStart(5)} bets  won ${pct(hit)}`);
}
