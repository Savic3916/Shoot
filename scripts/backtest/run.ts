// Replays past days with the app's own model, compares slip formats and fits a calibration.
// Usage: npx tsx --tsconfig scripts/backtest/tsconfig.json scripts/backtest/run.ts [days=90]
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
import { chooseDay, combinedStats, DEFAULT_FORMAT, type Candidate, type SlipFormat } from '@/features/picks';
import { screenCandidates } from '@/features/pipeline';
import { fitRatings } from '@/features/ratings';
import { buildTeamHistory } from '@/features/risk';
import { loadJson, saveJson } from '@/lib/storage';

const DAYS = Number(process.argv[2] ?? 90);
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

const FORMATS: { name: string; format: SlipFormat; realPricesOnly?: boolean }[] = [
  { name: '1 game @ 1.50', format: { sizes: [1], target: 1.5, ceiling: 1.8 } },
  { name: '1 game @ 1.50, real prices', format: { sizes: [1], target: 1.5, ceiling: 1.8 }, realPricesOnly: true },
  { name: '2 games @ 1.50', format: { sizes: [2], target: 1.5, ceiling: 1.8 } },
  { name: '2 games @ 1.50, real prices', format: { sizes: [2], target: 1.5, ceiling: 1.8 }, realPricesOnly: true },
  { name: '2-3 games @ 2.00', format: { sizes: [2, 3], target: 2, ceiling: 2.4 } },
  { name: '3-4 games @ 2.00 (app)', format: DEFAULT_FORMAT },
];

type Day = { date: string; pool: Graded[] };
const days: Day[] = [];
/** Ratings-only result forecasts for each share of goals replaced by shot quality. */
const SHOT_WEIGHTS = [0, 0.5, 0.75];
const ratingLoss = SHOT_WEIGHTS.map(() => ({ loss: 0, n: 0 }));

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
  const byId = new Map(finished.map((f) => [f.id, f]));
  SHOT_WEIGHTS.forEach((weight, i) => {
    const variant = fitRatings(results, Date.parse(`${date}T00:00:00Z`), weight);
    for (const f of before) {
      const probs = analyseFixture(f, variant, DEFAULT_LEARNED)?.statProbs;
      const actual = byId.get(f.id)!;
      if (!probs) continue;
      const diff = (actual.homeGoals ?? 0) - (actual.awayGoals ?? 0);
      const p = diff > 0 ? probs.home : diff < 0 ? probs.away : probs.draw;
      ratingLoss[i].loss -= Math.log(Math.max(1e-6, p));
      ratingLoss[i].n += 1;
    }
  });
  const pool = screenCandidates({ date, fixtures: before }, analyses, buildTeamHistory(results));
  days.push({ date, pool: pool.map((pick) => grade(pick, byId.get(pick.fixtureId)!)) });
  process.stdout.write(`${date}: ${finished.length} matches, ${pool.length} bets\n`);
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
/** A void leg (handicap push, draw no bet on a draw) pays back its stake, so it counts as odds 1. */
const payout = (legs: Graded[]) => (legs.some((leg) => leg.won === false) ? 0 : legs.reduce((p, leg) => p * (leg.won === null ? 1 : leg.pick.odds), 1));

console.log('\nFormat                         slips   won    expected  return per 1 staked');
for (const { name, format, realPricesOnly } of FORMATS) {
  let slips = 0;
  let won = 0;
  let expected = 0;
  let returned = 0;
  for (const day of days) {
    const pool = day.pool.filter((g) => !realPricesOnly || !g.pick.priceIsEstimate);
    const picks = chooseDay(pool.map((g) => g.pick), format);
    if (!picks.length) continue;
    const legs = picks.map((pick) => pool.find((g) => g.pick.fixtureId === pick.fixtureId && g.pick.key === pick.key)!);
    slips += 1;
    expected += combinedStats(picks).chance;
    const pay = payout(legs);
    returned += pay;
    if (pay > 0) won += 1;
  }
  console.log(`${name.padEnd(30)} ${String(slips).padStart(5)}  ${pct(won / slips).padStart(6)}  ${pct(expected / slips).padStart(8)}  ${(returned / slips).toFixed(3)}`);
}

console.log('\nRatings alone, match result log loss (lower is better):');
SHOT_WEIGHTS.forEach((weight, i) => console.log(`  shots weight ${weight.toFixed(2)}: ${(ratingLoss[i].loss / ratingLoss[i].n).toFixed(4)} over ${ratingLoss[i].n} matches`));

// Value singles: every bet with a real bookmaker price that the model rates above that price.
for (const minEdge of [0, 0.03, 0.06]) {
  const bets = days.flatMap((day) => day.pool).filter((g) => !g.pick.priceIsEstimate && g.pick.conservative * g.pick.odds - 1 >= minEdge);
  const returned = bets.reduce((sum, g) => sum + payout([g]), 0);
  console.log(`Value singles, edge >= ${pct(minEdge).padEnd(5)}   ${String(bets.length).padStart(5)}  ${pct(bets.filter((g) => g.won !== false).length / bets.length).padStart(6)}  ${pct(bets.reduce((s, g) => s + g.pick.conservative, 0) / bets.length).padStart(8)}  ${(returned / bets.length).toFixed(3)}`);
}

// Calibration: fit chance -> real win rate on the earlier days, judge it on the later ones.
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const split = Math.floor(days.length * (2 / 3));
const graded = (from: Day[]) => from.flatMap((day) => day.pool).filter((g) => g.won !== null);
const train = graded(days.slice(0, split));
const test = graded(days.slice(split));
let a = 0;
let b = 1;
for (let step = 0; step < 50; step++) {
  // Newton steps for logistic regression of the outcome on logit(chance).
  let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
  for (const g of train) {
    const x = logit(g.pick.conservative);
    const p = sigmoid(a + b * x);
    const y = g.won ? 1 : 0;
    const w = p * (1 - p);
    ga += y - p; gb += (y - p) * x;
    haa += w; hab += w * x; hbb += w * x * x;
  }
  const det = haa * hbb - hab * hab;
  a += (hbb * ga - hab * gb) / det;
  b += (haa * gb - hab * ga) / det;
}
const logLoss = (map: (p: number) => number) =>
  test.reduce((sum, g) => sum - Math.log(g.won ? map(g.pick.conservative) : 1 - map(g.pick.conservative)), 0) / test.length;
console.log(`\nCalibration fitted on ${train.length} bets: real chance = sigmoid(${a.toFixed(3)} + ${b.toFixed(3)} * logit(model chance))`);
console.log(`Judged on ${test.length} later bets: log loss ${logLoss((p) => p).toFixed(4)} as is, ${logLoss((p) => sigmoid(a + b * logit(p))).toFixed(4)} corrected (lower is better).`);
console.log('\nModel chance -> how often it actually won (all days), and the corrected chance:');
const all = graded(days);
for (let low = 0.6; low < 1; low += 0.05) {
  const bucket = all.filter((g) => g.pick.conservative >= low && g.pick.conservative < low + 0.05);
  if (bucket.length < 20) continue;
  const mid = low + 0.025;
  console.log(`  ${pct(low).padStart(6)}-${pct(low + 0.05).padEnd(6)} ${String(bucket.length).padStart(5)} bets  won ${pct(bucket.filter((g) => g.won).length / bucket.length)}  corrected ${pct(sigmoid(a + b * logit(mid)))}`);
}

// The real test of an edge: on the later days only, bet every real bookmaker price that the
// corrected chance (fitted on the earlier days) rates above the price.
const corrected = (p: number) => sigmoid(a + b * logit(p));
for (const minEdge of [0, 0.03, 0.06]) {
  const bets = days.slice(split).flatMap((day) => day.pool)
    .filter((g) => !g.pick.priceIsEstimate && corrected(g.pick.conservative) * g.pick.odds - 1 >= minEdge);
  if (!bets.length) continue;
  const returned = bets.reduce((sum, g) => sum + payout([g]), 0);
  console.log(`Later days, corrected value singles, edge >= ${pct(minEdge)}: ${bets.length} bets, won ${pct(bets.filter((g) => g.won !== false).length / bets.length)}, return ${(returned / bets.length).toFixed(3)} per 1 staked`);
}
