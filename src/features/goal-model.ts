/**
 * Bivariate Poisson score model with the Dixon-Coles low-score correction. Every market in the
 * app (1X2, totals, BTTS, handicaps) is priced from one score matrix so they stay consistent.
 */
export type ScoreMatrix = number[][];

const MAX_GOALS = 10;
const DIXON_COLES_RHO = -0.08;

function poisson(lambda: number): number[] {
  const pmf = [Math.exp(-lambda)];
  for (let k = 1; k <= MAX_GOALS; k += 1) pmf.push((pmf[k - 1] * lambda) / k);
  return pmf;
}

export function scoreMatrix(homeGoals: number, awayGoals: number): ScoreMatrix {
  const home = poisson(homeGoals);
  const away = poisson(awayGoals);
  const rho = DIXON_COLES_RHO;
  let sum = 0;
  const matrix = home.map((ph, h) =>
    away.map((pa, a) => {
      let tau = 1;
      if (h === 0 && a === 0) tau = 1 - homeGoals * awayGoals * rho;
      else if (h === 0 && a === 1) tau = 1 + homeGoals * rho;
      else if (h === 1 && a === 0) tau = 1 + awayGoals * rho;
      else if (h === 1 && a === 1) tau = 1 - rho;
      const p = ph * pa * Math.max(tau, 0);
      sum += p;
      return p;
    }),
  );
  return matrix.map((row) => row.map((p) => p / sum));
}

export function blendMatrices(a: ScoreMatrix, b: ScoreMatrix, weightA: number): ScoreMatrix {
  return a.map((row, h) => row.map((p, g) => weightA * p + (1 - weightA) * b[h][g]));
}

function sumWhere(matrix: ScoreMatrix, test: (home: number, away: number) => boolean) {
  let total = 0;
  matrix.forEach((row, h) => row.forEach((p, a) => { if (test(h, a)) total += p; }));
  return total;
}

export function resultProbs(matrix: ScoreMatrix) {
  return {
    home: sumWhere(matrix, (h, a) => h > a),
    draw: sumWhere(matrix, (h, a) => h === a),
    away: sumWhere(matrix, (h, a) => h < a),
  };
}

function splitQuarter(line: number): number[] {
  const twice = Math.round(line * 4) / 4;
  return Math.abs(twice * 2 - Math.round(twice * 2)) > 1e-9
    ? [twice - 0.25, twice + 0.25]
    : [twice];
}

/** P(total goals > line | no push). Handles half, whole and quarter lines. */
export function overProb(matrix: ScoreMatrix, line: number) {
  const parts = splitQuarter(line).map((value) => {
    const over = sumWhere(matrix, (h, a) => h + a > value);
    const under = sumWhere(matrix, (h, a) => h + a < value);
    return over / (over + under);
  });
  return parts.reduce((sum, value) => sum + value, 0) / parts.length;
}

/** P(one side scores at least `goals`). */
export function teamGoalsProb(matrix: ScoreMatrix, side: 'home' | 'away', goals: number) {
  return sumWhere(matrix, (h, a) => (side === 'home' ? h : a) >= goals);
}

export function bttsProb(matrix: ScoreMatrix) {
  return sumWhere(matrix, (h, a) => h > 0 && a > 0);
}

/** P(home covers `line` | no push); `line` is added to the home team's goals. */
export function handicapProb(matrix: ScoreMatrix, line: number) {
  const parts = splitQuarter(line).map((value) => {
    const win = sumWhere(matrix, (h, a) => h - a + value > 0);
    const lose = sumWhere(matrix, (h, a) => h - a + value < 0);
    return win / (win + lose);
  });
  return parts.reduce((sum, value) => sum + value, 0) / parts.length;
}

export type MarketTargets = {
  result?: { home: number; draw: number; away: number };
  total?: { line: number; over: number };
  handicap?: { line: number; home: number };
};

/**
 * Inverts bookmaker prices into the goal expectations that produce them. This is how the app
 * "learns" how the lines were built: it searches for the (home, away) goal rates whose score
 * matrix reproduces the de-vigged 1X2, over/under and handicap probabilities.
 */
export function fitExpectedGoals(targets: MarketTargets): { home: number; away: number; error: number } {
  const loss = (home: number, away: number) => {
    const matrix = scoreMatrix(home, away);
    let error = 0;
    if (targets.result) {
      const probs = resultProbs(matrix);
      error += (probs.home - targets.result.home) ** 2;
      error += (probs.draw - targets.result.draw) ** 2;
      error += (probs.away - targets.result.away) ** 2;
    }
    if (targets.total) error += (overProb(matrix, targets.total.line) - targets.total.over) ** 2;
    if (targets.handicap) {
      error += (handicapProb(matrix, targets.handicap.line) - targets.handicap.home) ** 2;
    }
    // Weak prior keeps a 1X2-only fit from drifting to implausible totals.
    return error + 0.0004 * (home + away - 2.7) ** 2;
  };

  let best = { home: 1.4, away: 1.1, error: Infinity };
  const search = (centerH: number, centerA: number, span: number, step: number) => {
    for (let h = centerH - span; h <= centerH + span + 1e-9; h += step) {
      for (let a = centerA - span; a <= centerA + span + 1e-9; a += step) {
        if (h < 0.1 || a < 0.1 || h > 5 || a > 5) continue;
        const error = loss(h, a);
        if (error < best.error) best = { home: h, away: a, error };
      }
    }
  };
  search(2.5, 2.5, 2.4, 0.15);
  search(best.home, best.away, 0.15, 0.03);
  search(best.home, best.away, 0.03, 0.006);
  return best;
}
