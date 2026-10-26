import { analyseFixture, toRecord, type MatchAnalysis } from './analysis';
import type { MatchdayData } from './football-data';
import { getRecentResults } from './history';
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

export type Brief = {
  analyses: Map<string, MatchAnalysis>;
  picks: Pick[];
  /** True when the day's picks were generated earlier and frozen once a match kicked off. */
  picksLocked: boolean;
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

function frozenPicks(stored: LoggedPick[], date: string): Pick[] | undefined {
  const forDate = stored.filter((pick) => pick.date === date);
  if (!forDate.some((pick) => Date.parse(pick.utcDate) <= Date.now())) return undefined;
  return forDate.map((pick) => ({ ...pick, conservative: pick.probability }));
}

function compose(
  data: MatchdayData,
  ratings: Ratings | undefined,
  learned: Learned,
  records: MatchRecord[],
  stored: LoggedPick[],
  stage: Brief['stage'],
  historyMatches: number,
): Brief {
  const analyses = analyseAll(data, ratings, learned);
  const frozen = frozenPicks(stored, data.date);
  return {
    analyses,
    picks: frozen ?? selectDailyPicks(data.date, data.fixtures, analyses),
    picksLocked: Boolean(frozen),
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
  const [records0, picks0] = await Promise.all([loadRecords(), loadPicks()]);
  const learned0 = records0.length ? fitLearned(records0) : DEFAULT_LEARNED;
  onStage(compose(data, undefined, learned0, records0, picks0, 'market', 0));

  const results = await getRecentResults(data.date, signal);
  const ratings = fitRatings(results);
  const settled = settle(records0, picks0, results);
  if (settled.changed) {
    await Promise.all([saveRecords(settled.records), savePicks(settled.picks)]);
  }
  const learned = fitLearned(settled.records);
  const brief = compose(data, ratings, learned, settled.records, settled.picks, 'full', results.length);

  // Remember what we predicted so tomorrow's results can grade it.
  const upcoming = data.fixtures.filter(
    (fixture) => fixture.status === 'NOT STARTED' && Date.parse(fixture.utcDate) > Date.now(),
  );
  const newRecords = upcoming.flatMap((fixture) => {
    const analysis = brief.analyses.get(fixture.id);
    return analysis ? [toRecord(fixture, analysis)] : [];
  });
  const mergedRecords = await logRecords(newRecords, settled.records);
  if (!brief.picksLocked) {
    const others = settled.picks.filter((pick) => pick.date !== data.date);
    await savePicks([...others, ...brief.picks.map(({ conservative: _c, edge: _e, ...pick }) => pick)]);
  }
  return { ...brief, track: trackRecord(mergedRecords, settled.picks) };
}
