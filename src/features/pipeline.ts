import { analyseFixture, toRecord, type MatchAnalysis } from './analysis';
import type { FootballMatch, MatchdayData } from './football-data';
import { getRecentResults } from './history';
import { fetchInsight, formSupport } from './insight';
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
import { choosePicks, rankCandidates, scoreOf, tierFor, type Candidate, type Pick } from './picks';
import { fitRatings, type Ratings } from './ratings';
import { isMajorCompetition, summariseCoverage } from './competitions';
import { assessMatch, buildTeamHistory, type TeamHistory } from './risk';
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
  /** Every match of the day that was analysed, grouped by country or region. */
  coverage: { country: string; matches: number }[];
};

function hasStarted(fixture: FootballMatch) {
  return fixture.status !== 'NOT STARTED' || Date.parse(fixture.utcDate) <= Date.now();
}

function analyseAll(data: MatchdayData, ratings: Ratings | undefined, learned: Learned) {
  const analyses = new Map<string, MatchAnalysis>();
  for (const fixture of data.fixtures) {
    // Prices of a match in play or finished reflect the score, not the pre-match picture, so
    // those matches are analysed from team ratings alone. Kick-off time never excludes a match.
    const analysis = analyseFixture(hasStarted(fixture) ? { ...fixture, market: undefined } : fixture, ratings, learned);
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

/**
 * Shortlists the most probable bets of the day, gathers each team's recent form, head to head and
 * news for every one, and keeps only bets that recent form does not contradict. Odds of the final
 * three therefore rest on two independent views: the model and what actually happened lately.
 */
async function selectVerifiedPicks(
  data: MatchdayData,
  analyses: Map<string, MatchAnalysis>,
  history: TeamHistory,
  signal?: AbortSignal,
): Promise<Pick[]> {
  // Red-card and fatigue risk are checked before anything else: a match whose risk cannot be
  // measured, or is high, is never offered however good the numbers look.
  const risks = new Map(data.fixtures.map((fixture) => [fixture.id, assessMatch(fixture, history)]));
  const shortlist = rankCandidates(
    data.date,
    data.fixtures,
    analyses,
    14,
    (fixture) => risks.get(fixture.id)?.ok === true && isMajorCompetition(fixture),
  );
  const checked = await Promise.all(
    shortlist.map(async (candidate): Promise<Candidate | undefined> => {
      const fixture = data.fixtures.find((item) => item.id === candidate.fixtureId);
      const analysis = analyses.get(candidate.fixtureId);
      if (!fixture || !analysis) return undefined;
      const insight = await fetchInsight(fixture, candidate, analysis, signal).catch(() => undefined);
      if (!insight) {
        const conservative = candidate.conservative - 0.04; // unverified against recent form
        return { ...candidate, conservative, tier: tierFor(conservative), score: scoreOf(conservative, candidate.edge) };
      }
      // Team news: a reported injury, suspension or club problem rules the match out.
      const flagged = [...insight.home.news, ...insight.away.news].find(
        (item) => item.kind === 'availability' || item.kind === 'club',
      );
      if (flagged) return undefined;
      insight.betReasons.splice(
        Math.max(0, insight.betReasons.length - 1),
        0,
        ...(risks.get(candidate.fixtureId)?.notes ?? []),
        'No injury, suspension or club-trouble headlines for either team in the last three weeks.',
      );
      const { hits, n } = formSupport(candidate.key, insight);
      let conservative = candidate.conservative;
      if (n >= 6) {
        const support = (hits + 1) / (n + 2);
        if (support < 0.55) return undefined; // recent form contradicts the model
        conservative = 0.75 * conservative + 0.25 * support;
        insight.betReasons.splice(
          Math.max(0, insight.betReasons.length - 1),
          0,
          `Check: this exact bet would have won in ${hits} of the last ${n} games played by these two teams.`,
        );
      } else {
        conservative -= 0.02; // too little recent data to confirm
      }
      if (conservative < 0.7) return undefined;
      return { ...candidate, insight, conservative, tier: tierFor(conservative), score: scoreOf(conservative, candidate.edge) };
    }),
  );
  return choosePicks(checked.filter((item): item is Candidate => item !== undefined));
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
  const picks = locked ? frozenPicks(stored, data.date) : [];
  return {
    analyses,
    picks,
    picksLocked: locked,
    picksReady: locked || stage === 'full',
    learned,
    track: trackRecord(records, stored),
    stage,
    historyMatches,
    coverage: summariseCoverage(data.fixtures),
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
  if (locked) {
    brief = { ...brief, picks: await withInsights(brief.picks, data, brief.analyses, signal) };
  } else {
    brief = { ...brief, picks: await selectVerifiedPicks(data, brief.analyses, buildTeamHistory(results), signal) };
  }

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
