import { groupOf, logit, outcomeOf, sigmoid, type MarketGroup } from './markets';
import { loadJson, saveJson } from '@/lib/storage';
import type { PastResult } from './history';
import type { PickInsight } from './insight';

/**
 * The app learns on-device. Every analysed match is logged with the market-implied, stats-only
 * and blended probability for the core markets. Once results arrive, the log is graded and used
 * to re-weight market vs stats and to correct over/under-confidence per market group.
 */
export const LEARN_KEYS = ['home', 'draw', 'away', 'o15', 'o25', 'o35', 'btts'] as const;

export type LoggedProb = { b: number; m?: number; s?: number };

export type MatchRecord = {
  id: string;
  utcDate: string;
  home: string;
  away: string;
  competition: string;
  probs: Record<string, LoggedProb>;
  result?: { home: number; away: number };
};

export type LoggedPick = {
  date: string;
  fixtureId: string;
  utcDate: string;
  home: string;
  away: string;
  competition: string;
  country?: string;
  key: string;
  label: string;
  family: string;
  predictedScore: string;
  probability: number;
  odds: number;
  priceIsEstimate: boolean;
  tier: string;
  reasons: string[];
  /** Form, head to head, table and team news gathered when the pick was made. */
  insight?: PickInsight;
  /** Chance after penalising model disagreement and thin evidence; this is the chance shown. */
  conservative?: number;
  outcome?: 'won' | 'lost' | 'void';
};

export type Learned = {
  weightMarket: number;
  scale: Record<MarketGroup, number>;
  settled: number;
  withBothModels: number;
};

export const DEFAULT_LEARNED: Learned = {
  weightMarket: 0.75,
  scale: { result: 1, goals: 1, btts: 1 },
  settled: 0,
  withBothModels: 0,
};

const RECORDS_KEY = 'learn:records:v1';
const PICKS_KEY = 'learn:picks:v1';
const MAX_RECORDS = 1500;
const MAX_PICKS = 400;
const PRIOR_WEIGHT_MARKET = 0.75;
// Pseudo-observations that keep a small sample from swinging the parameters.
const PRIOR_STRENGTH = 60;

function logLoss(p: number, won: boolean) {
  const clamped = Math.min(0.999, Math.max(0.001, p));
  return -Math.log(won ? clamped : 1 - clamped);
}

export function loadRecords() {
  return loadJson<MatchRecord[]>(RECORDS_KEY, []);
}

export function loadPicks() {
  return loadJson<LoggedPick[]>(PICKS_KEY, []);
}

export function savePicks(picks: LoggedPick[]) {
  return saveJson(PICKS_KEY, picks.slice(-MAX_PICKS));
}

/** Adds or refreshes records for matches that have not kicked off yet. */
export async function logRecords(records: MatchRecord[], existing: MatchRecord[]) {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const record of records) {
    const previous = byId.get(record.id);
    if (previous?.result) continue;
    byId.set(record.id, record);
  }
  const merged = [...byId.values()]
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
    .slice(-MAX_RECORDS);
  await saveJson(RECORDS_KEY, merged);
  return merged;
}

/** Grades logged matches and picks with the results the feed has published since. */
export function settle(
  records: MatchRecord[],
  picks: LoggedPick[],
  results: PastResult[],
): { records: MatchRecord[]; picks: LoggedPick[]; changed: boolean } {
  const byId = new Map(results.map((result) => [result.id, result]));
  let changed = false;
  const settledRecords = records.map((record) => {
    const result = byId.get(record.id);
    if (record.result || !result) return record;
    changed = true;
    return { ...record, result: { home: result.homeGoals, away: result.awayGoals } };
  });
  const settledPicks = picks.map((pick) => {
    const result = byId.get(pick.fixtureId);
    if (pick.outcome || !result) return pick;
    const won = outcomeOf(pick.key, result.homeGoals, result.awayGoals);
    changed = true;
    return { ...pick, outcome: won === null ? ('void' as const) : won ? ('won' as const) : ('lost' as const) };
  });
  return { records: settledRecords, picks: settledPicks, changed };
}

export async function saveRecords(records: MatchRecord[]) {
  await saveJson(RECORDS_KEY, records.slice(-MAX_RECORDS));
}

type Observation = { p: LoggedProb; key: string; won: boolean };

function observations(records: MatchRecord[]): Observation[] {
  const list: Observation[] = [];
  for (const record of records) {
    if (!record.result) continue;
    for (const [key, p] of Object.entries(record.probs)) {
      const won = outcomeOf(key, record.result.home, record.result.away);
      if (won !== null) list.push({ p, key, won });
    }
  }
  return list;
}

function argmin(candidates: number[], cost: (value: number) => number) {
  let best = candidates[0];
  let bestCost = Infinity;
  for (const value of candidates) {
    const current = cost(value);
    if (current < bestCost) {
      bestCost = current;
      best = value;
    }
  }
  return best;
}

export function applyScale(p: number, scale: number) {
  return sigmoid(scale * logit(p));
}

/** Fits the market/stats blend weight and per-group confidence scaling from graded matches. */
export function fitLearned(records: MatchRecord[]): Learned {
  const obs = observations(records);
  const both = obs.filter((item) => item.p.m !== undefined && item.p.s !== undefined);

  let weightMarket = PRIOR_WEIGHT_MARKET;
  if (both.length) {
    const grid = Array.from({ length: 11 }, (_, index) => index / 10);
    const fitted = argmin(grid, (weight) =>
      both.reduce(
        (sum, item) => sum + logLoss(weight * item.p.m! + (1 - weight) * item.p.s!, item.won),
        0,
      ),
    );
    weightMarket = (both.length * fitted + PRIOR_STRENGTH * PRIOR_WEIGHT_MARKET) / (both.length + PRIOR_STRENGTH);
  }

  const scale: Learned['scale'] = { result: 1, goals: 1, btts: 1 };
  for (const group of Object.keys(scale) as MarketGroup[]) {
    const items = obs.filter((item) => groupOf(item.key) === group);
    if (!items.length) continue;
    const grid = Array.from({ length: 29 }, (_, index) => 0.6 + index * 0.025);
    const fitted = argmin(grid, (value) =>
      items.reduce((sum, item) => sum + logLoss(applyScale(item.p.b, value), item.won), 0),
    );
    scale[group] = (items.length * fitted + PRIOR_STRENGTH) / (items.length + PRIOR_STRENGTH);
  }

  return {
    weightMarket,
    scale,
    settled: records.filter((record) => record.result).length,
    withBothModels: records.filter(
      (record) => record.result && Object.values(record.probs).some((p) => p.m !== undefined && p.s !== undefined),
    ).length,
  };
}

export type TrackRecord = {
  picksSettled: number;
  picksWon: number;
  /** Mean model probability across settled picks, to compare with the hit rate. */
  picksAverageProbability: number;
  matchesGraded: number;
  /** Mean Brier score of the blended model, and of a naive base-rate guess, over all graded markets. */
  brier: number;
  brierBaseline: number;
};

export function trackRecord(records: MatchRecord[], picks: LoggedPick[]): TrackRecord {
  const settled = picks.filter((pick) => pick.outcome === 'won' || pick.outcome === 'lost');
  const obs = observations(records);
  // Naive baseline: always predict each market's own observed hit rate.
  const rates = new Map<string, { won: number; total: number }>();
  for (const item of obs) {
    const entry = rates.get(item.key) ?? { won: 0, total: 0 };
    entry.total += 1;
    if (item.won) entry.won += 1;
    rates.set(item.key, entry);
  }
  return {
    picksSettled: settled.length,
    picksWon: settled.filter((pick) => pick.outcome === 'won').length,
    picksAverageProbability: settled.length
      ? settled.reduce((sum, pick) => sum + pick.probability, 0) / settled.length
      : 0,
    matchesGraded: records.filter((record) => record.result).length,
    brier: obs.length
      ? obs.reduce((sum, item) => sum + (item.p.b - Number(item.won)) ** 2, 0) / obs.length
      : 0,
    brierBaseline: obs.length
      ? obs.reduce((sum, item) => {
          const entry = rates.get(item.key)!;
          return sum + (entry.won / entry.total - Number(item.won)) ** 2;
        }, 0) / obs.length
      : 0,
  };
}
