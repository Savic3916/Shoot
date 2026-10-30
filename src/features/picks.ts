import type { MatchAnalysis } from './analysis';
import type { FootballMatch } from './football-data';
import type { LoggedPick } from './learning';
import { FAMILY_LABEL, familyOf, formatPercent, type MarketFamily } from './markets';

/** The day's main bet is one game paying inside this band; an optional add-on pays inside the other. */
export const MAIN_ODDS: [number, number] = [1.2, 1.3];
export const ADDON_ODDS: [number, number] = [1.1, 1.15];
/** Lowest chance a bet may have to be offered (the strongest bet inside the band always wins). */
export const CONFIDENCE_FLOOR = 0.6;
const SHORTLIST_SIZE = Infinity;
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
  minProbability = CONFIDENCE_FLOOR,
  minQuality = 0.5,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const fixture of fixtures) {
    const analysis = analyses.get(fixture.id);
    if (!analysis || analysis.quality < minQuality || !isEligible(fixture)) continue;

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
      if (conservative < minProbability) continue;

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
 * Picks the single most probable game paying inside the odds band. A bet that pays more than its
 * band is only the fallback when nothing fits, and a bet that pays less never is: a higher price
 * with a lower chance is a different bet, not a safer one.
 */
export function bestSingle(pool: Candidate[], [low, high]: [number, number], strict = false): Candidate | undefined {
  const byChance = (a: Candidate, b: Candidate) => b.conservative - a.conservative || b.odds - a.odds;
  const inBand = pool.filter((item) => item.odds >= low && item.odds <= high).sort(byChance);
  if (inBand.length || strict) return inBand[0];
  const above = pool.filter((item) => item.odds > high).sort(byChance);
  return above[0] ?? [...pool].sort((a, b) => b.odds - a.odds)[0];
}

/**
 * The day's bets: one main game, plus (if a different game pays inside the add-on band) an
 * optional add-on. Every game of the day was already scored, so the best one overall wins.
 */
export function chooseDay(pool: Candidate[]): Pick[] {
  const strip = ({ score: _score, ...pick }: Candidate, role: 'main' | 'addon'): Pick => ({ ...pick, role });
  const main = bestSingle(pool, MAIN_ODDS);
  if (!main) return [];
  const addon = bestSingle(
    pool.filter((item) => item.fixtureId !== main.fixtureId),
    ADDON_ODDS,
    true,
  );
  return [strip(main, 'main'), ...(addon ? [strip(addon, 'addon')] : [])];
}

export function combinedStats(picks: Pick[]) {
  return {
    odds: picks.reduce((product, pick) => product * pick.odds, 1),
    // Product of single-pick chances; assumes the matches are independent.
    chance: picks.reduce((product, pick) => product * pick.conservative, 1),
  };
}
