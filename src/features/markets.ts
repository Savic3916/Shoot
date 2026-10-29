import {
  bttsProb,
  handicapProb,
  overProb,
  resultProbs,
  teamGoalsProb,
  type ScoreMatrix,
} from './goal-model';

/** Market keys: home | draw | away | dc1x | dcx2 | dc12 | o15 | u25 | btts | nobtts | ah:-0.5 | ahA:0.5 */
export type MarketGroup = 'result' | 'goals' | 'btts';

export const OVER_LINES = [1.5, 2.5, 3.5, 4.5, 5.5];
export const HANDICAP_LINES = [-2.5, -1.5, 1.5, 2.5];

export type MarketFamily = 'result' | 'goals' | 'btts' | 'handicap' | 'team';

export const FAMILY_LABEL: Record<MarketFamily, string> = {
  result: 'MATCH RESULT',
  goals: 'TOTAL GOALS',
  btts: 'BOTH TEAMS TO SCORE',
  handicap: 'HANDICAP',
  team: 'TEAM GOALS',
};

export function familyOf(key: string): MarketFamily {
  if (key.startsWith('ah')) return 'handicap';
  if (/^(hs|as)\d$/.test(key)) return 'team';
  if (key === 'btts' || key === 'nobtts') return 'btts';
  if (key.startsWith('o') || key.startsWith('u')) return 'goals';
  return 'result';
}

export function overKey(line: number) {
  return `o${String(line).replace('.', '')}`;
}

export function underKey(line: number) {
  return `u${String(line).replace('.', '')}`;
}

export function groupOf(key: string): MarketGroup {
  if (key === 'btts' || key === 'nobtts') return 'btts';
  if (/^(hs|as)\d$/.test(key)) return 'goals';
  if (key.startsWith('o') || key.startsWith('u')) return 'goals';
  return 'result';
}

/** Probability of every supported market from one score matrix. */
export function marketProbs(
  matrix: ScoreMatrix,
  extraTotalLine?: number,
  handicapLine?: number,
): Record<string, number> {
  const result = resultProbs(matrix);
  const probs: Record<string, number> = {
    home: result.home,
    draw: result.draw,
    away: result.away,
    dc1x: result.home + result.draw,
    dcx2: result.away + result.draw,
    dc12: result.home + result.away,
    btts: bttsProb(matrix),
  };
  probs.nobtts = 1 - probs.btts;
  // Draw no bet (stake back on a draw) and team-to-score markets.
  probs.dnbH = result.home / (result.home + result.away);
  probs.dnbA = result.away / (result.home + result.away);
  probs.hs1 = teamGoalsProb(matrix, 'home', 1);
  probs.as1 = teamGoalsProb(matrix, 'away', 1);
  probs.hs2 = teamGoalsProb(matrix, 'home', 2);
  probs.as2 = teamGoalsProb(matrix, 'away', 2);
  const lines = new Set(OVER_LINES);
  if (extraTotalLine !== undefined) lines.add(extraTotalLine);
  for (const line of lines) {
    const over = overProb(matrix, line);
    probs[overKey(line)] = over;
    probs[underKey(line)] = 1 - over;
  }
  const handicaps = new Set(HANDICAP_LINES);
  if (handicapLine !== undefined) handicaps.add(handicapLine);
  for (const line of handicaps) {
    const home = handicapProb(matrix, line);
    probs[`ah:${line}`] = home;
    probs[`ahA:${-line}`] = 1 - home;
  }
  return probs;
}

/** true = won, false = lost, null = void (handicap push or unknown key). */
export function outcomeOf(key: string, homeGoals: number, awayGoals: number): boolean | null {
  const diff = homeGoals - awayGoals;
  const total = homeGoals + awayGoals;
  switch (key) {
    case 'home': return diff > 0;
    case 'draw': return diff === 0;
    case 'away': return diff < 0;
    case 'dc1x': return diff >= 0;
    case 'dcx2': return diff <= 0;
    case 'dc12': return diff !== 0;
    case 'btts': return homeGoals > 0 && awayGoals > 0;
    case 'nobtts': return homeGoals === 0 || awayGoals === 0;
    case 'dnbH': return diff === 0 ? null : diff > 0;
    case 'dnbA': return diff === 0 ? null : diff < 0;
    case 'hs1': return homeGoals >= 1;
    case 'as1': return awayGoals >= 1;
    case 'hs2': return homeGoals >= 2;
    case 'as2': return awayGoals >= 2;
  }
  const line = Number(key.replace(/^(o|u|ah:|ahA:)/, ''));
  if (key.startsWith('ah:') || key.startsWith('ahA:')) {
    if (!Number.isFinite(line)) return null;
    const score = key.startsWith('ah:') ? diff + line : -diff + line;
    return score === 0 ? null : score > 0;
  }
  const match = key.match(/^([ou])(\d+)$/);
  if (!match) return null;
  const goalLine = Number(match[2]) / 10;
  if (total === goalLine) return null;
  return match[1] === 'o' ? total > goalLine : total < goalLine;
}

export function logit(p: number) {
  const clamped = Math.min(0.995, Math.max(0.005, p));
  return Math.log(clamped / (1 - clamped));
}

export function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

export function formatPercent(p: number) {
  return `${Math.round(p * 100)}%`;
}
