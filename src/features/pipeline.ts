import { analyseFixture, toRecord, type MatchAnalysis } from './analysis';
import type { MatchdayData } from './football-data';
import { getRecentResults } from './history';
import { fetchInsight } from './insight';
import {
  DEFAULT_LEARNED,
  fitLearned,
  loadPicks,
  loadRecords,
  logRecords,
  savePicks,
  saveRecords,
  settle,
  trackRecord,
  type Learned,
  type LoggedPick,
  type MatchRecord,
  type TrackRecord,
} from './learning';
import { selectDailyPicks, type Pick } from './picks';
import { fitRatings, type Ratings } from './ratings';
import { loadJson, saveJson } from '@/lib/storage';

const LOCKED_KEY = 'learn:locked-days:v1';

export type Brief = {
  analyses: Map<string, MatchAnalysis>;
  picks: Pick[];
  /** True when the day's picks were generated earlier and are frozen; refreshing never changes them. */
  picksLocked: boolean;
  /** False while the first full analysis for the day is still running (no picks are shown yet). */
  picksReady: boolean;
  learned: Learned;
  track: TrackRecord;
  /** Stage 1 uses bookmaker prices only; stage 2 adds stats ratings and learning. */
  stage: 'market' | 'full';
  historyMatches: number;
};

function analyseAll(data: MatchdayData, ratings: Ratings | undefined, learned: Learned) {
  const analyses = new Map<string, MatchAnalysis>();
  for (const fixture of data.fixtures) {
    const analysis = analyseFixture(fixture, ratings, learned);
    if (analysis) analyses.set(fixture.id, analysis);
  }
  return analyses;
}

function frozenPicks(stored: LoggedPick[], date: string): Pick[] {
  return stored
    .filter((pick) => pick.date === date)
    .map((pick) => ({ ...pick, conservative: pick.probability }));
}

/** Attaches the evidence behind each pick; picks that already have it are left untouched. */
async function withInsights(
  picks: Pick[],
  data: MatchdayData,
  analyses: Map<string, MatchAnalysis>,
  signal?: AbortSignal,
): Promise<Pick[]> {
  return Promise.all(
    picks.map(async (pick) => {
      if (pick.insight) return pick;
      const fixture = data.fixtures.find((item) => item.id === pick.fixtureId);
      const analysis = analyses.get(pick.fixtureId);
      if (!fixture || !analysis) return pick;
      const insight = await fetchInsight(fixture, pick, analysis, signal).catch(() => undefined);
      return insight ? { ...pick, insight } : pick;
    }),
  );
}

function compose(
  data: MatchdayData,
  ratings: Ratings | undefined,
  learned: Learned,
  records: MatchRecord[],
  stored: LoggedPick[],
  locked: boolean,
  stage: Brief['stage'],
  historyMatches: number,
): Brief {
  const analyses = analyseAll(data, ratings, learned);
  // Once a day's picks exist they are final. Before the full analysis there are none to show,
  // so a preliminary pick can never appear and then change.
  const picks = locked
    ? frozenPicks(stored, data.date)
    : stage === 'full'
      ? selectDailyPicks(data.date, data.fixtures, analyses)
      : [];
  return {
    analyses,
    picks,
    picksLocked: locked,
    picksReady: locked || stage === 'full',
    learned,
    track: trackRecord(records, stored),
    stage,
    historyMatches,
  };
}

/**
 * Builds the day's analysis in two stages so the screen is useful immediately: bookmaker-only
 * numbers first, then stats ratings, grading of past predictions, and re-learned parameters.
 */
export async function buildBrief(
  data: MatchdayData,
  onStage: (brief: Brief) => void,
  signal?: AbortSignal,
): Promise<Brief> {
  const [records0, picks0, lockedDays] = await Promise.all([
    loadRecords(),
    loadPicks(),
    loadJson<string[]>(LOCKED_KEY, []),
  ]);
  const locked = lockedDays.includes(data.date);
  const learned0 = records0.length ? fitLearned(records0) : DEFAULT_LEARNED;
  onStage(compose(data, undefined, learned0, records0, picks0, locked, 'market', 0));

  const results = await getRecentResults(data.date, signal);
  const ratings = fitRatings(results);
  const settled = settle(records0, picks0, results);
  if (settled.changed) {
    await Promise.all([saveRecords(settled.records), savePicks(settled.picks)]);
  }
  const learned = fitLearned(settled.records);
  let brief = compose(data, ratings, learned, settled.records, settled.picks, locked, 'full', results.length);
  brief = { ...brief, picks: await withInsights(brief.picks, data, brief.analyses, signal) };

  // A concurrent run (e.g. a quick refresh) may have locked the day while this one was computing.
  // Re-check so the first stored set always wins.
  if (!locked) {
    const latest = await loadJson<string[]>(LOCKED_KEY, []);
    if (latest.includes(data.date)) {
      const stored = await loadPicks();
      brief = { ...brief, picks: frozenPicks(stored, data.date), picksLocked: true };
      return { ...brief, track: trackRecord(settled.records, stored) };
    }
  }

  // Remember what we predicted so tomorrow's results can grade it.
  const upcoming = data.fixtures.filter(
    (fixture) => fixture.status === 'NOT STARTED' && Date.parse(fixture.utcDate) > Date.now(),
  );
  const newRecords = upcoming.flatMap((fixture) => {
    const analysis = brief.analyses.get(fixture.id);
    return analysis ? [toRecord(fixture, analysis)] : [];
  });
  const mergedRecords = await logRecords(newRecords, settled.records);
  const hadInsight = (id: string) =>
    settled.picks.some((pick) => pick.date === data.date && pick.fixtureId === id && pick.insight);
  const gainedInsight = locked && brief.picks.some((pick) => pick.insight && !hadInsight(pick.fixtureId));
  if (!locked || gainedInsight) {
    const others = settled.picks.filter((pick) => pick.date !== data.date);
    await savePicks([...others, ...brief.picks.map(({ conservative: _c, edge: _e, ...pick }) => pick)]);
    if (!locked) await saveJson(LOCKED_KEY, [...lockedDays, data.date].slice(-60));
  }
  return { ...brief, track: trackRecord(mergedRecords, settled.picks) };
}
