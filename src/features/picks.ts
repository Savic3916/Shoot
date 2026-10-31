import type { MatchAnalysis } from './analysis';
import type { FootballMatch } from './football-data';
import type { LoggedPick } from './learning';
import { FAMILY_LABEL, familyOf, formatPercent, type MarketFamily } from './markets';

/** The day's slip must pay at least this much; above the ceiling the extra price only costs chance. */
export const TARGET_ODDS = 1.5;
const MAX_SLIP_ODDS = 1.8;
const MAX_LEGS = 3;
/** Legs considered when searching combinations (C(45,3) is still under 15,000 slips). */
const COMBO_POOL = 45;
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
 * Searches every single bet, pair and triple across different matches and keeps the slip paying at
 * least the target with the highest chance that all of its legs win. Long odds on one match and
 * short odds on several are therefore compared on equal terms instead of assuming a format.
 */
export function chooseDay(pool: Candidate[]): Pick[] {
  const legs = [...pool].sort((a, b) => b.conservative - a.conservative).slice(0, COMBO_POOL);

  type Slip = { items: Candidate[]; odds: number; chance: number };
  const slips: Slip[] = [];
  const extend = (items: Candidate[], start: number) => {
    if (items.length) {
      slips.push({
        items,
        odds: items.reduce((product, item) => product * item.odds, 1),
        chance: items.reduce((product, item) => product * item.conservative, 1),
      });
    }
    if (items.length === MAX_LEGS) return;
    for (let i = start; i < legs.length; i++) {
      if (items.some((item) => item.fixtureId === legs[i].fixtureId)) continue;
      extend([...items, legs[i]], i + 1);
    }
  };
  extend([], 0);
  if (!slips.length) return [];

  // Prefer the slip that reaches the target with the best chance; otherwise get as close as the
  // pool allows, relaxing the price in steps rather than returning nothing.
  const byChance = (a: Slip, b: Slip) => b.chance - a.chance || a.items.length - b.items.length;
  for (const floor of [TARGET_ODDS, 1.4, 1.3, 1.2, 0]) {
    const fits = slips.filter((slip) => slip.odds >= floor && slip.odds <= MAX_SLIP_ODDS).sort(byChance);
    if (fits.length) {
      return fits[0].items.map(({ score: _score, ...pick }): Pick => ({ ...pick, role: 'main' }));
    }
  }
  const top = [...slips].sort((a, b) => b.odds - a.odds)[0];
  return top.items.map(({ score: _score, ...pick }): Pick => ({ ...pick, role: 'main' }));
}

export function combinedStats(picks: Pick[]) {
  return {
    odds: picks.reduce((product, pick) => product * pick.odds, 1),
    // Product of single-pick chances; assumes the matches are independent.
    chance: picks.reduce((product, pick) => product * pick.conservative, 1),
  };
}
