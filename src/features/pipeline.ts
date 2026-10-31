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
import {
  CONFIDENCE_FLOOR,
  chooseDay,
  rankCandidates,
  scoreOf,
  tierFor,
  type Candidate,
  type Pick,
} from './picks';
import { fitRatings, type Ratings } from './ratings';
import { isEligibleCompetition } from './competitions';
import { assessMatch, buildTeamHistory, historySupport, type TeamHistory } from './risk';
import { loadJson, saveJson } from '@/lib/storage';

const LOCKED_KEY = 'learn:locked-days:v2';
/** Results needed (both teams together) before the history check may veto or move a bet. */
const MIN_FORM_GAMES = 10;
const MIN_FORM_SUPPORT = 0.55;
const FORM_WEIGHT = 0.25;

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
  /** While the day's games are being checked one by one: how far along, and the best found so far. */
  progress?: Progress;
};

export type Progress = {
  done: number;
  total: number;
  best?: { label: string; match: string; chance: number };
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
    .map((pick) => ({ ...pick, conservative: pick.conservative ?? pick.probability }));
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
  onProgress?: (progress: Progress) => void,
): Promise<Pick[]> {
  // Red-card and fatigue risk are measured for every match up front.
  const byId = new Map(data.fixtures.map((fixture) => [fixture.id, fixture]));
  const formChecked = new Set<string>();
  const keyOf = (candidate: Candidate) => `${candidate.fixtureId}:${candidate.key}`;
  const risks = new Map(data.fixtures.map((fixture) => [fixture.id, assessMatch(fixture, history)]));
  const shortlist = rankCandidates(
    data.date,
    data.fixtures,
    analyses,
    Infinity,
    isEligibleCompetition,
  ).flatMap((candidate): Candidate[] => {
    // Risk lowers a match's chance instead of removing it, so every match is compared; a match
    // whose risk cannot be measured is marked down less than one with a known high risk.
    const risk = risks.get(candidate.fixtureId);
    const penalty = risk?.ok ? 0 : risk?.failures.some((f) => f.startsWith('Red-card risk cannot')) ? 0.03 : 0.08;
    let conservative = candidate.conservative - penalty;
    // Every bet of every match is checked against both teams' last ten results before anything is
    // downloaded: a bet recent results contradict is dropped, one they back is moved toward them.
    const fixture = byId.get(candidate.fixtureId);
    const form = fixture ? historySupport(candidate.key, fixture, history) : undefined;
    const reasons = [...candidate.reasons];
    if (form && form.games >= MIN_FORM_GAMES) {
      if (form.support < MIN_FORM_SUPPORT) return [];
      conservative = (1 - FORM_WEIGHT) * conservative + FORM_WEIGHT * form.support;
      formChecked.add(keyOf(candidate));
      reasons.push(`Check: this exact bet would have won in ${form.hits} of the last ${form.games} games played by these two teams.`);
    }
    if (conservative < CONFIDENCE_FLOOR) return [];
    return [{ ...candidate, reasons, conservative, tier: tierFor(conservative), score: scoreOf(conservative, candidate.edge) }];
  });
  // Every candidate is checked, a few at a time so the free feeds are not flooded.
  const checkOne = async (candidate: Candidate): Promise<Candidate | undefined> => {
    const fixture = byId.get(candidate.fixtureId);
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
    if (formChecked.has(keyOf(candidate))) {
      // Already weighed against the longer downloaded history; the five-game check would count
      // the same games twice.
      const check = candidate.reasons.find((reason) => reason.startsWith('Check:'));
      if (check) insight.betReasons.splice(Math.max(0, insight.betReasons.length - 1), 0, check);
    } else if (n >= 6) {
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
    if (conservative < CONFIDENCE_FLOOR) return undefined;
    return { ...candidate, insight, conservative, tier: tierFor(conservative), score: scoreOf(conservative, candidate.edge) };
  };
  const checked: (Candidate | undefined)[] = [];
  for (let i = 0; i < shortlist.length; i += 10) {
    checked.push(...(await Promise.all(shortlist.slice(i, i + 10).map(checkOne))));
    // Running best: every game checked so far is compared, so a stronger bet further down the
    // list replaces an earlier one.
    const top = checked.reduce<Candidate | undefined>(
      (held, item) => (item && (!held || item.conservative > held.conservative) ? item : held),
      undefined,
    );
    onProgress?.({
      done: Math.min(i + 10, shortlist.length),
      total: shortlist.length,
      best: top && { label: top.label, match: `${top.home} vs ${top.away}`, chance: top.conservative },
    });
  }
  const verified = checked.filter((item): item is Candidate => item !== undefined);
  const picks = chooseDay(verified);
  if (picks.length) return picks;
  // Last resort so no day is empty: every match is considered again without the form, news and
  // risk filters, and the strongest picks are marked down for being unverified.
  // Days far ahead often have no bookmaker prices yet, so the evidence bar drops too; the slip is
  // then built from the best of whatever exists and its low chance is shown honestly.
  const fallback = rankCandidates(data.date, data.fixtures, analyses, Infinity, undefined, 0.4, 0).map((candidate): Candidate => {
    const conservative = candidate.conservative - 0.04;
    return { ...candidate, conservative, tier: tierFor(conservative), score: scoreOf(conservative, candidate.edge) };
  });
  return chooseDay(fallback);
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
  // A day only counts as locked if it has picks in the current main/add-on format; an empty day or
  // one saved by an older version is worked out again.
  const locked = lockedDays.includes(data.date) && picks0.some((pick) => pick.date === data.date && pick.role);
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
    brief = { ...brief, picks: await selectVerifiedPicks(data, brief.analyses, buildTeamHistory(results), signal, (progress) =>
        onStage({ ...brief, picksReady: false, progress }),
      ),
    };
  }

  // A concurrent run (e.g. a quick refresh) may have locked the day while this one was computing.
  // Re-check so the first stored set always wins.
  if (!locked) {
    const latest = await loadJson<string[]>(LOCKED_KEY, []);
    const stored = latest.includes(data.date) ? await loadPicks() : [];
    if (stored.some((pick) => pick.date === data.date && pick.role)) {
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
    await savePicks([...others, ...brief.picks.map(({ edge: _e, ...pick }) => pick)]);
    // Only a day that has picks is locked; an empty day is worked out again next time.
    if (!locked && brief.picks.length) {
      await saveJson(LOCKED_KEY, [...new Set([...lockedDays, data.date])].slice(-60));
    }
  }
  return { ...brief, track: trackRecord(mergedRecords, settled.picks) };
}
