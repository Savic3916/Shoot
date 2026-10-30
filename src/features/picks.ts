import type { MatchAnalysis } from './analysis';
import type { FootballMatch } from './football-data';
import type { LoggedPick } from './learning';
import { FAMILY_LABEL, familyOf, formatPercent, type MarketFamily } from './markets';

/** The day's slip is built to pay at least this much, using as few legs as it takes. */
export const SLIP_MIN_ODDS = 1.5;
const SLIP_MAX_LEGS = 10;
const SLIP_POOL = 40;
/**
 * Confidence bars tried in order. The slip is built at the strictest bar that can reach the target
 * odds, so a day is only ever filled with weaker picks when stronger ones cannot do the job.
 */
export const CONFIDENCE_LADDER = [0.78, 0.72, 0.66, 0.6];
export const CONFIDENCE_FLOOR = CONFIDENCE_LADDER[CONFIDENCE_LADDER.length - 1];
const SHORTLIST_SIZE = 80;
const MAX_PER_FIXTURE = 2;
const MIN_PRICE = 1.05;
const ESTIMATED_MARGIN = 0.05;
const SKIPPED = new Set(['draw', 'dc12']);
const AVAILABLE_ON_BOOKIE = /^(home|away|dc1x|dcx2|btts|nobtts|[ou](15|25|35|45))$/;

export type Pick = LoggedPick & {
  /** Probability after penalising model disagreement and thin evidence. */
  conservative: number;
  edge?: number;
};

export function tierFor(conservative: number) {
  if (conservative >= 0.85) return 'STRONG';
  if (conservative >= 0.78) return 'SOLID';
  return 'LEAN';
}

export type Candidate = Pick & { score: number };

export function scoreOf(conservative: number, edge?: number) {
  return conservative + (edge === undefined ? 0 : 0.3 * Math.max(-0.08, Math.min(0.12, edge)));
}

/**
 * Stage one of selection: every match of the day is considered, whatever its kick-off time, and
 * the most probable selections are shortlisted. A selection scores on its calibrated probability,
 * reduced when the bookmaker and stats models disagree or only one source exists. The shortlist
 * is then checked against each team's recent games before the final three are chosen.
 */
export function rankCandidates(
  date: string,
  fixtures: FootballMatch[],
  analyses: Map<string, MatchAnalysis>,
  limit = SHORTLIST_SIZE,
  isEligible: (fixture: FootballMatch) => boolean = () => true,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const fixture of fixtures) {
    const analysis = analyses.get(fixture.id);
    if (!analysis || analysis.quality < 0.5 || !isEligible(fixture)) continue;

    for (const line of analysis.lines) {
      // Only bets SportyBet lists on virtually every match: 1X2, double chance, GG/NG and
      // over/under 1.5-4.5. Handicaps, odd total lines, team-to-score and draw-no-bet are left out
      // (they were also unreliable in testing, and are often missing from the bookie).
      if (SKIPPED.has(line.key) || !AVAILABLE_ON_BOOKIE.test(line.key)) continue;

      const m = analysis.marketProbs?.[line.key];
      const s = analysis.statProbs?.[line.key];
      let conservative = line.probability;
      if (m !== undefined && s !== undefined) conservative -= 0.75 * Math.abs(m - s);
      else if (m === undefined) conservative -= 0.06; // stats only: no market cross-check
      if (conservative < CONFIDENCE_FLOOR) continue;

      const priceIsEstimate = !line.bookOdds;
      const odds = line.bookOdds ?? Math.max(1.01, (1 - ESTIMATED_MARGIN) / line.probability);
      if (odds < MIN_PRICE) continue;

      const edge = line.edge;
      const score = scoreOf(conservative, edge);
      const predicted = `${analysis.predictedScore.home}-${analysis.predictedScore.away}`;
      const reasons = [
        `We rate this ${formatPercent(line.probability)} likely.`,
        edge === undefined
          ? `No bookmaker lists this exact bet, so ${odds.toFixed(2)} is our own estimate of a fair price.`
          : `The bookmaker pays ${odds.toFixed(2)} for it.`,
        ...analysis.reasons,
      ];

      candidates.push({
        date,
        fixtureId: fixture.id,
        utcDate: fixture.utcDate,
        home: fixture.homeTeam,
        away: fixture.awayTeam,
        competition: fixture.competition,
        country: fixture.country,
        key: line.key,
        label: line.label,
        family: FAMILY_LABEL[familyOf(line.key)],
        predictedScore: predicted,
        probability: line.probability,
        odds,
        priceIsEstimate,
        tier: tierFor(conservative),
        reasons,
        conservative,
        edge,
        score,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const shortlist: Candidate[] = [];
  const perFixture = new Map<string, number>();
  for (const candidate of candidates) {
    const used = perFixture.get(candidate.fixtureId) ?? 0;
    if (used >= MAX_PER_FIXTURE) continue;
    perFixture.set(candidate.fixtureId, used + 1);
    shortlist.push(candidate);
    if (shortlist.length === limit) break;
  }
  return shortlist;
}

/**
 * Builds the day's slip. A slip pays the product of its legs' odds but only wins if every leg
 * wins, so for a given target payout the safest slip uses the fewest and most probable legs.
 * Every subset of up to five matches from the verified pool is scored by the chance all legs win
 * (using the conservative probabilities); the best subset that reaches the target odds wins.
 * If no subset reaches the target, the highest-paying safe subset is returned instead.
 */
export function buildSlip(candidates: Candidate[]): Pick[] {
  const pool = [...candidates].sort((a, b) => b.conservative - a.conservative).slice(0, SLIP_POOL);
  type Best = { legs: Candidate[]; odds: number; chance: number; families: number };
  let bestHit: Best | undefined;
  let bestMiss: Best | undefined;

  // Candidates are tried best-first, so a cap on combinations keeps a huge pool of low prices quick.
  let budget = 400_000;
  const visit = (start: number, legs: Candidate[], odds: number, chance: number) => {
    if (budget-- <= 0) return;
    if (legs.length) {
      const families = new Set(legs.map((leg) => familyOf(leg.key))).size;
      const entry: Best = { legs, odds, chance, families };
      if (odds >= SLIP_MIN_ODDS) {
        const better =
          !bestHit ||
          chance > bestHit.chance + 1e-9 ||
          (Math.abs(chance - bestHit.chance) <= 1e-9 && families > bestHit.families);
        if (better) bestHit = entry;
      } else if (!bestMiss || odds > bestMiss.odds) {
        bestMiss = entry;
      }
    }
    // Once the target is reached, extra legs only lower the chance of winning.
    if (legs.length === SLIP_MAX_LEGS || (legs.length && odds >= SLIP_MIN_ODDS)) return;
    for (let i = start; i < pool.length; i += 1) {
      const next = pool[i];
      if (legs.some((leg) => leg.fixtureId === next.fixtureId)) continue;
      visit(i + 1, [...legs, next], odds * next.odds, chance * next.conservative);
    }
  };
  visit(0, [], 1, 1);

  const chosen = (bestHit ?? bestMiss)?.legs ?? [];
  return chosen
    .sort((a, b) => b.conservative - a.conservative)
    .map(({ score: _score, ...pick }) => pick);
}

export function combinedStats(picks: Pick[]) {
  return {
    odds: picks.reduce((product, pick) => product * pick.odds, 1),
    // Product of single-pick chances; assumes the matches are independent.
    chance: picks.reduce((product, pick) => product * pick.conservative, 1),
  };
}
