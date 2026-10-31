import type { PastResult } from './history';

export type TeamRating = { attack: number; defense: number; weight: number };

export type Ratings = {
  teams: Map<string, TeamRating>;
  leagueGoals: Map<string, { home: number; away: number }>;
  globalGoals: { home: number; away: number };
};

const HALF_LIFE_DAYS = 21;
const SHRINKAGE = 3;
const MIN_WEIGHT = 2.5;
const ITERATIONS = 30;
/**
 * Share of each match's goals replaced by the goals its shots were worth. Shots are a steadier
 * measure of how well a side played than the handful of goals that happened to go in.
 */
export const SHOT_WEIGHT = 0.5;
/** An off-target shot is worth this fraction of a shot on target. */
const OFF_TARGET_VALUE = 0.12;

/**
 * Each match's score with part of the goals replaced by what its shots were worth. The goals one
 * shot on target is worth is measured across every match with shot data, so it needs no tuning.
 */
function shotAdjusted(results: PastResult[], shotWeight: number): PastResult[] {
  const withShots = results.filter((result) => result.shots);
  const shotValue = (result: PastResult, side: 'home' | 'away') => {
    const shots = result.shots!;
    const onTarget = side === 'home' ? shots.homeOnTarget : shots.awayOnTarget;
    const total = side === 'home' ? shots.home : shots.away;
    return onTarget + OFF_TARGET_VALUE * Math.max(0, total - onTarget);
  };
  const goals = withShots.reduce((sum, result) => sum + result.homeGoals + result.awayGoals, 0);
  const value = withShots.reduce((sum, result) => sum + shotValue(result, 'home') + shotValue(result, 'away'), 0);
  if (shotWeight <= 0 || withShots.length < 50 || value <= 0) return results;
  const goalsPerShot = goals / value;
  return results.map((result) =>
    result.shots
      ? {
          ...result,
          homeGoals: (1 - shotWeight) * result.homeGoals + shotWeight * goalsPerShot * shotValue(result, 'home'),
          awayGoals: (1 - shotWeight) * result.awayGoals + shotWeight * goalsPerShot * shotValue(result, 'away'),
        }
      : result,
  );
}

/**
 * Time-weighted attack/defence ratings fitted from recent results. A team's attack is its goals
 * scored relative to what an average side would score against the same opposition (and the same
 * for defence), shrunk toward 1.0 so teams with few matches are not over-trusted.
 */
export function fitRatings(results: PastResult[], now = Date.now(), shotWeight = SHOT_WEIGHT): Ratings {
  const weighted = shotAdjusted(results, shotWeight).map((result) => ({
    result,
    weight: 0.5 ** ((now - Date.parse(result.utcDate)) / 86_400_000 / HALF_LIFE_DAYS),
  }));

  const sums = new Map<string, { home: number; away: number; weight: number }>();
  let globalHome = 0;
  let globalAway = 0;
  let globalWeight = 0;
  for (const { result, weight } of weighted) {
    const entry = sums.get(result.leagueId) ?? { home: 0, away: 0, weight: 0 };
    entry.home += weight * result.homeGoals;
    entry.away += weight * result.awayGoals;
    entry.weight += weight;
    sums.set(result.leagueId, entry);
    globalHome += weight * result.homeGoals;
    globalAway += weight * result.awayGoals;
    globalWeight += weight;
  }
  const globalGoals = globalWeight
    ? { home: globalHome / globalWeight, away: globalAway / globalWeight }
    : { home: 1.4, away: 1.15 };
  const leagueGoals = new Map<string, { home: number; away: number }>();
  for (const [league, entry] of sums) {
    // Leagues with few matches borrow from the global average.
    const mix = entry.weight / (entry.weight + 10);
    leagueGoals.set(league, {
      home: mix * (entry.home / entry.weight) + (1 - mix) * globalGoals.home,
      away: mix * (entry.away / entry.weight) + (1 - mix) * globalGoals.away,
    });
  }

  const teams = new Map<string, TeamRating>();
  const ensure = (id: string) => {
    if (!teams.has(id)) teams.set(id, { attack: 1, defense: 1, weight: 0 });
    return teams.get(id)!;
  };
  for (const { result, weight } of weighted) {
    ensure(result.homeTeamId).weight += weight;
    ensure(result.awayTeamId).weight += weight;
  }

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const attackNum = new Map<string, number>();
    const attackDen = new Map<string, number>();
    const defenseNum = new Map<string, number>();
    const defenseDen = new Map<string, number>();
    const add = (map: Map<string, number>, id: string, value: number) =>
      map.set(id, (map.get(id) ?? 0) + value);

    for (const { result, weight } of weighted) {
      const base = leagueGoals.get(result.leagueId) ?? globalGoals;
      const home = teams.get(result.homeTeamId)!;
      const away = teams.get(result.awayTeamId)!;
      add(attackNum, result.homeTeamId, weight * result.homeGoals);
      add(attackDen, result.homeTeamId, weight * base.home * away.defense);
      add(defenseNum, result.homeTeamId, weight * result.awayGoals);
      add(defenseDen, result.homeTeamId, weight * base.away * away.attack);
      add(attackNum, result.awayTeamId, weight * result.awayGoals);
      add(attackDen, result.awayTeamId, weight * base.away * home.defense);
      add(defenseNum, result.awayTeamId, weight * result.homeGoals);
      add(defenseDen, result.awayTeamId, weight * base.home * home.attack);
    }

    let attackTotal = 0;
    let defenseTotal = 0;
    for (const [id, rating] of teams) {
      rating.attack = ((attackNum.get(id) ?? 0) + SHRINKAGE) / ((attackDen.get(id) ?? 0) + SHRINKAGE);
      rating.defense = ((defenseNum.get(id) ?? 0) + SHRINKAGE) / ((defenseDen.get(id) ?? 0) + SHRINKAGE);
      attackTotal += rating.attack;
      defenseTotal += rating.defense;
    }
    // Pin the scale so ratings stay comparable between iterations.
    const attackMean = attackTotal / teams.size;
    const defenseMean = defenseTotal / teams.size;
    for (const rating of teams.values()) {
      rating.attack /= attackMean;
      rating.defense /= defenseMean;
    }
  }

  return { teams, leagueGoals, globalGoals };
}

export type StatExpectation = {
  home: number;
  away: number;
  homeWeight: number;
  awayWeight: number;
};

export function expectedGoalsFromRatings(
  ratings: Ratings,
  homeTeamId: string,
  awayTeamId: string,
  leagueId: string,
): StatExpectation | undefined {
  const home = ratings.teams.get(homeTeamId);
  const away = ratings.teams.get(awayTeamId);
  if (!home || !away || home.weight < MIN_WEIGHT || away.weight < MIN_WEIGHT) return undefined;
  const base = ratings.leagueGoals.get(leagueId) ?? ratings.globalGoals;
  const clamp = (value: number) => Math.min(4, Math.max(0.2, value));
  return {
    home: clamp(base.home * home.attack * away.defense),
    away: clamp(base.away * away.attack * home.defense),
    homeWeight: home.weight,
    awayWeight: away.weight,
  };
}
