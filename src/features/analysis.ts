import type { FootballMatch } from './football-data';
import {
  blendMatrices,
  fitExpectedGoals,
  scoreMatrix,
  type MarketTargets,
  type ScoreMatrix,
} from './goal-model';
import { applyScale, LEARN_KEYS, type Learned, type MatchRecord } from './learning';
import { formatPercent, groupOf, marketProbs, overKey, underKey } from './markets';
import { devig, overround } from './odds';
import { expectedGoalsFromRatings, type Ratings } from './ratings';

export type MarketLine = {
  key: string;
  label: string;
  probability: number;
  fairOdds: number;
  /** Bookmaker price when the feed carries this exact market. */
  bookOdds?: number;
  /** Expected return per unit staked at the bookmaker price; > 0 means the model sees value. */
  edge?: number;
};

export type MatchAnalysis = {
  fixtureId: string;
  expectedGoals: { home: number; away: number };
  /** Single most likely scoreline from the blended score model. */
  predictedScore: { home: number; away: number };
  hasMarket: boolean;
  hasStats: boolean;
  /** Calibrated probabilities for every supported market. */
  probs: Record<string, number>;
  /** Blended probabilities before calibration; this is what the learning loop grades. */
  rawProbs: Record<string, number>;
  marketProbs?: Record<string, number>;
  statProbs?: Record<string, number>;
  lines: MarketLine[];
  /** 0..1: how much independent evidence backs the numbers. */
  quality: number;
  /** Largest gap between bookmaker-implied and stats-implied probability on a core market. */
  disagreement: number;
  margin?: number;
  movement?: { homePp: number; overPp?: number };
  reasons: string[];
};

const AH_MIN_PROBABILITY = 0.05;

function labelFor(key: string, fixture: FootballMatch): string {
  const { homeTeam, awayTeam } = fixture;
  switch (key) {
    case 'home': return `${homeTeam} to win`;
    case 'draw': return 'Draw';
    case 'away': return `${awayTeam} to win`;
    case 'dc1x': return `${homeTeam} or draw`;
    case 'dcx2': return `${awayTeam} or draw`;
    case 'dc12': return 'No draw';
    case 'btts': return 'Both teams to score';
    case 'nobtts': return 'Both teams NOT to score';
  }
  const goals = key.match(/^([ou])(\d+)$/);
  if (goals) return `${goals[1] === 'o' ? 'Over' : 'Under'} ${Number(goals[2]) / 10} goals`;
  const handicap = key.match(/^(ah|ahA):(-?[\d.]+)$/);
  if (handicap) {
    const line = Number(handicap[2]);
    const team = handicap[1] === 'ah' ? homeTeam : awayTeam;
    return `${team} ${line > 0 ? '+' : ''}${line}`;
  }
  return key;
}

export function analyseFixture(
  fixture: FootballMatch,
  ratings: Ratings | undefined,
  learned: Learned,
): MatchAnalysis | undefined {
  const market = fixture.market;
  const reasons: string[] = [];

  // 1. Bookmaker side: de-vig the prices and invert them into goal expectations.
  let marketMatrix: ScoreMatrix | undefined;
  let marketXg: { home: number; away: number } | undefined;
  let margin: number | undefined;
  let movement: MatchAnalysis['movement'];
  let handicapLine: number | undefined;
  let totalLine: number | undefined;
  if (market) {
    const targets: MarketTargets = {};
    if (market.moneyline) {
      const fair = devig([market.moneyline.home, market.moneyline.draw, market.moneyline.away]);
      targets.result = { home: fair[0], draw: fair[1], away: fair[2] };
      margin = overround([market.moneyline.home, market.moneyline.draw, market.moneyline.away]);
      if (market.openMoneyline) {
        const open = devig([market.openMoneyline.home, market.openMoneyline.draw, market.openMoneyline.away]);
        movement = { homePp: (fair[0] - open[0]) * 100 };
      }
    }
    if (market.total) {
      totalLine = market.total.line;
      targets.total = { line: market.total.line, over: devig([market.total.over, market.total.under])[0] };
      if (market.total.openOver && market.total.openUnder) {
        const open = devig([market.total.openOver, market.total.openUnder])[0];
        movement = { homePp: movement?.homePp ?? 0, overPp: (targets.total.over - open) * 100 };
      }
    }
    if (market.spread) {
      handicapLine = market.spread.line;
      targets.handicap = { line: market.spread.line, home: devig([market.spread.home, market.spread.away])[0] };
    }
    if (targets.result || targets.total) {
      const fit = fitExpectedGoals(targets);
      marketXg = { home: fit.home, away: fit.away };
      marketMatrix = scoreMatrix(fit.home, fit.away);
    }
  }

  // 2. Stats side: team ratings fitted from recent results.
  const stat = ratings
    ? expectedGoalsFromRatings(ratings, fixture.homeTeamId, fixture.awayTeamId, fixture.leagueId)
    : undefined;
  const statMatrix = stat ? scoreMatrix(stat.home, stat.away) : undefined;
  if (!marketMatrix && !statMatrix) return undefined;

  const marketP = marketMatrix ? marketProbs(marketMatrix, totalLine, handicapLine) : undefined;
  const statP = statMatrix ? marketProbs(statMatrix, totalLine, handicapLine) : undefined;
  const blended = marketMatrix && statMatrix
    ? blendMatrices(marketMatrix, statMatrix, learned.weightMarket)
    : (marketMatrix ?? statMatrix)!;
  const rawP = marketProbs(blended, totalLine, handicapLine);
  let predictedScore = { home: 1, away: 1 };
  let bestCell = -1;
  blended.forEach((row, h) => row.forEach((p, a) => {
    if (p > bestCell) {
      bestCell = p;
      predictedScore = { home: h, away: a };
    }
  }));

  // 3. Calibrate with what the app has learned from graded results.
  const probs: Record<string, number> = {};
  for (const [key, p] of Object.entries(rawP)) {
    probs[key] = applyScale(p, learned.scale[groupOf(key)]);
  }

  let disagreement = 0;
  if (marketP && statP) {
    for (const key of ['home', 'draw', 'away', 'o25', 'btts']) {
      disagreement = Math.max(disagreement, Math.abs(marketP[key] - statP[key]));
    }
  }
  const statDepth = stat ? Math.min(stat.homeWeight, stat.awayWeight) : 0;
  const quality = Math.max(
    0,
    Math.min(
      1,
      (marketMatrix ? 0.78 : 0.4) +
        (statMatrix ? 0.08 + Math.min(0.12, statDepth * 0.02) : 0) -
        disagreement * 1.2,
    ),
  );

  // 4. Bookmaker prices for the exact markets the feed carries, and value versus our number.
  const book: Record<string, number> = {};
  if (market?.moneyline) {
    book.home = market.moneyline.home;
    book.draw = market.moneyline.draw;
    book.away = market.moneyline.away;
  }
  if (market?.total) {
    book[overKey(market.total.line)] = market.total.over;
    book[underKey(market.total.line)] = market.total.under;
  }
  if (market?.spread) {
    book[`ah:${market.spread.line}`] = market.spread.home;
    book[`ahA:${-market.spread.line}`] = market.spread.away;
  }

  const lines: MarketLine[] = Object.entries(probs)
    .filter(([key, p]) => {
      if (key.startsWith('ah')) return p > AH_MIN_PROBABILITY && p < 1 - AH_MIN_PROBABILITY;
      return true;
    })
    .map(([key, probability]) => {
      const bookOdds = book[key];
      return {
        key,
        label: labelFor(key, fixture),
        probability,
        fairOdds: 1 / probability,
        bookOdds,
        edge: bookOdds ? probability * bookOdds - 1 : undefined,
      };
    });

  // 5. Plain-language reasoning.
  if (marketXg) {
    reasons.push(`Bookmaker odds point to about ${(marketXg.home + marketXg.away).toFixed(1)} goals in this match.`);
  }
  if (stat) {
    reasons.push(`Recent results of both teams suggest about ${(stat.home + stat.away).toFixed(1)} goals.`);
  } else if (ratings) {
    reasons.push('There are too few recent results for one of these teams to rate them from form.');
  }
  if (marketP && statP) {
    reasons.push(
      disagreement < 0.06
        ? 'Bookmaker odds and recent form agree.'
        : `Bookmaker odds and recent form disagree by up to ${formatPercent(disagreement)}, so extra caution.`,
    );
  }
  if (movement && Math.abs(movement.homePp) >= 2) {
    reasons.push(`Money has moved ${movement.homePp > 0 ? 'toward' : 'away from'} the home side since the odds opened.`);
  }
  if (movement?.overPp !== undefined && Math.abs(movement.overPp) >= 3) {
    reasons.push(`The goals market has shifted toward ${movement.overPp > 0 ? 'more' : 'fewer'} goals.`);
  }

  return {
    fixtureId: fixture.id,
    predictedScore,
    expectedGoals: marketXg ?? { home: stat!.home, away: stat!.away },
    hasMarket: Boolean(marketMatrix),
    hasStats: Boolean(statMatrix),
    probs,
    rawProbs: rawP,
    marketProbs: marketP,
    statProbs: statP,
    lines,
    quality,
    disagreement,
    margin,
    movement,
    reasons,
  };
}

/** Log row used by the learning loop; only upcoming matches are recorded. */
export function toRecord(fixture: FootballMatch, analysis: MatchAnalysis): MatchRecord {
  const probs: MatchRecord['probs'] = {};
  for (const key of LEARN_KEYS) {
    probs[key] = {
      b: analysis.rawProbs[key],
      m: analysis.marketProbs?.[key],
      s: analysis.statProbs?.[key],
    };
  }
  return {
    id: fixture.id,
    utcDate: fixture.utcDate,
    home: fixture.homeTeam,
    away: fixture.awayTeam,
    competition: fixture.competition,
    probs,
  };
}
