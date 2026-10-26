import type { MatchAnalysis } from './analysis';
import type { FootballMatch } from './football-data';
import type { LoggedPick } from './learning';
import { formatPercent } from './markets';

const PICK_COUNT = 3;
const MIN_CONSERVATIVE_PROBABILITY = 0.6;
const MIN_PRICE = 1.2;
const ESTIMATED_MARGIN = 0.05;
const MAX_PER_KEY = 2;
const PICKABLE = new Set(['home', 'away', 'dc1x', 'dcx2', 'o15', 'o25', 'u25', 'u35', 'btts']);

export type Pick = LoggedPick & {
  /** Probability after penalising model disagreement and thin evidence. */
  conservative: number;
  edge?: number;
};

function tierFor(conservative: number) {
  if (conservative >= 0.75) return 'STRONG';
  if (conservative >= 0.68) return 'SOLID';
  return 'LEAN';
}

function isUpcoming(fixture: FootballMatch) {
  return fixture.status === 'NOT STARTED' && Date.parse(fixture.utcDate) > Date.now();
}

/**
 * Picks the three strongest selections of the day. A selection scores on its calibrated
 * probability, reduced when the bookmaker and stats models disagree or only one source exists,
 * and nudged up when the bookmaker price offers value. No selection is guaranteed to win:
 * the output is the best-supported option available, with the evidence attached.
 */
export function selectDailyPicks(
  date: string,
  fixtures: FootballMatch[],
  analyses: Map<string, MatchAnalysis>,
): Pick[] {
  type Candidate = Pick & { score: number };
  const candidates: Candidate[] = [];

  for (const fixture of fixtures) {
    const analysis = analyses.get(fixture.id);
    if (!analysis || !isUpcoming(fixture) || analysis.quality < 0.5) continue;

    for (const line of analysis.lines) {
      const allowed = PICKABLE.has(line.key) || (line.key.startsWith('ah') && line.bookOdds);
      if (!allowed) continue;

      const m = analysis.marketProbs?.[line.key];
      const s = analysis.statProbs?.[line.key];
      let conservative = line.probability;
      if (m !== undefined && s !== undefined) conservative -= 0.5 * Math.abs(m - s);
      else if (m === undefined) conservative -= 0.06; // stats only: no market cross-check
      if (conservative < MIN_CONSERVATIVE_PROBABILITY) continue;

      const priceIsEstimate = !line.bookOdds;
      const odds = line.bookOdds ?? Math.max(1.01, (1 - ESTIMATED_MARGIN) / line.probability);
      if (odds < MIN_PRICE) continue;

      const edge = line.edge;
      const score = conservative + (edge === undefined ? 0 : 0.3 * Math.max(-0.08, Math.min(0.12, edge)));
      const reasons = [...analysis.reasons.slice(0, 3)];
      reasons.unshift(
        `Model gives ${formatPercent(line.probability)} (fair price ${line.fairOdds.toFixed(2)})` +
          (edge !== undefined
            ? `; bookmaker pays ${odds.toFixed(2)} (${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}% expected value).`
            : `; no bookmaker price in the feed, so ${odds.toFixed(2)} is an estimate.`),
      );
      if (m !== undefined && s !== undefined) {
        reasons.push(`Bookmaker-implied ${formatPercent(m)} vs stats-implied ${formatPercent(s)}.`);
      }

      candidates.push({
        date,
        fixtureId: fixture.id,
        utcDate: fixture.utcDate,
        home: fixture.homeTeam,
        away: fixture.awayTeam,
        competition: fixture.competition,
        key: line.key,
        label: line.label,
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
  const chosen: Candidate[] = [];
  const perKey = new Map<string, number>();
  for (const candidate of candidates) {
    if (chosen.some((pick) => pick.fixtureId === candidate.fixtureId)) continue;
    const family = candidate.key.replace(/^(ah|ahA).*/, 'ah');
    if ((perKey.get(family) ?? 0) >= MAX_PER_KEY) continue;
    perKey.set(family, (perKey.get(family) ?? 0) + 1);
    chosen.push(candidate);
    if (chosen.length === PICK_COUNT) break;
  }
  return chosen.map(({ score: _score, ...pick }) => pick);
}

export function combinedStats(picks: Pick[]) {
  return {
    odds: picks.reduce((product, pick) => product * pick.odds, 1),
    // Product of single-pick chances; assumes the matches are independent.
    chance: picks.reduce((product, pick) => product * pick.probability, 1),
  };
}
