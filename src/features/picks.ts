import type { MatchAnalysis } from './analysis';
import type { FootballMatch } from './football-data';
import type { LoggedPick } from './learning';
import { FAMILY_LABEL, familyOf, formatPercent, type MarketFamily } from './markets';

const PICK_COUNT = 3;
const MIN_CONSERVATIVE_PROBABILITY = 0.55;
const MIN_PRICE = 1.3;
const ESTIMATED_MARGIN = 0.05;
const SKIPPED = new Set(['draw', 'dc12']);

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
      // ±0.5 handicaps are just "win" / "win or draw" under another name.
      if (SKIPPED.has(line.key) || /^ahA?:-?0\.5$/.test(line.key)) continue;

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
      const predicted = `${analysis.predictedScore.home}-${analysis.predictedScore.away}`;
      const reasons = [...analysis.reasons.slice(0, 3)];
      reasons.unshift(
        `Most likely score ${predicted}, expected goals ${analysis.expectedGoals.home.toFixed(1)}–${analysis.expectedGoals.away.toFixed(1)}.`,
      );
      reasons.splice(1, 0,
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

  // One selection per market family (result, goals, both-teams, handicap) and per match, so the
  // three bets are genuinely different views of the day rather than three "home win"s.
  candidates.sort((a, b) => b.score - a.score);
  const chosen: Candidate[] = [];
  const families = new Set<MarketFamily>();
  const take = (strict: boolean) => {
    for (const candidate of candidates) {
      if (chosen.length === PICK_COUNT) return;
      const family = familyOf(candidate.key);
      if (chosen.some((pick) => pick.fixtureId === candidate.fixtureId)) continue;
      if (strict && families.has(family)) continue;
      families.add(family);
      chosen.push(candidate);
    }
  };
  take(true);
  take(false);
  return chosen.map(({ score: _score, ...pick }) => pick);
}

export function combinedStats(picks: Pick[]) {
  return {
    odds: picks.reduce((product, pick) => product * pick.odds, 1),
    // Product of single-pick chances; assumes the matches are independent.
    chance: picks.reduce((product, pick) => product * pick.probability, 1),
  };
}
