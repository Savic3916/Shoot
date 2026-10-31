import { getRecentResults, LEAGUES, type Game, type League } from './basketball-data';
import { devig } from './odds';
import { loadJson, saveJson } from '@/lib/storage';

/** The day's slip must pay at least this; above the ceiling extra price only costs chance. */
export const TARGET_ODDS = 1.5;
const MAX_SLIP_ODDS = 1.85;
/** Below this a leg adds almost nothing to the price but still carries the bookmaker's margin. */
const MIN_LEG_ODDS = 1.1;
/** A pair replaces the single only when it is clearly more likely, since two games mean two risks. */
const PAIR_ADVANTAGE = 0.02;
const HISTORY_DAYS = 30;
/** Rating shrinkage, in games: a team with few results stays close to average. */
const PRIOR_GAMES = 4;
/** Margins beyond this are treated as this, so garbage-time blowouts do not inflate a rating. */
const MARGIN_CAP = 25;
const SLIPS_KEY = 'hoops:slips:v1';

export type HoopPick = {
  date: string;
  gameId: string;
  league: string;
  utcDate: string;
  homeTeam: string;
  awayTeam: string;
  /** The team backed to win. */
  team: string;
  opponent: string;
  pickIsHome: boolean;
  odds: number;
  provider: string;
  /** Chance the pick wins after every penalty; this is the number the slip is chosen on. */
  chance: number;
  /** Bookmaker's chance with its margin removed. */
  marketChance: number;
  /** Chance from our own ratings of recent scores, when both teams have played enough. */
  statsChance?: number;
  /** Points the backed team is expected to win by, from the bookmaker's handicap. */
  spread?: number;
  teamRecord?: string;
  opponentRecord?: string;
  reasons: string[];
  result?: 'won' | 'lost';
};

export type DaySlip = {
  date: string;
  kind: 'single' | 'pair';
  picks: HoopPick[];
  odds: number;
  chance: number;
};

export type TrackRecord = { settled: number; won: number; expected: number };

export type HoopsDay = {
  slip?: DaySlip;
  /** True when the slip was fixed earlier; refreshing never changes it. */
  locked: boolean;
  games: number;
  /** Upcoming games with bookmaker prices. */
  priced: number;
  /** Bets that survived the checks and were compared. */
  candidates: number;
  /** Best single and best pair found, so the choice between them can be shown. */
  bestSingle?: number;
  bestPair?: number;
  track: TrackRecord;
};

type Rating = { value: number; games: number };

/** Normal cumulative distribution (Abramowitz-Stegun 7.1.26 via erf). */
function normalCdf(x: number) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Points-per-game strength of every team from recent final scores: each team's rating is the
 * margin it wins by against an average opponent on neutral ground, recent games counting more.
 */
export function fitRatings(results: Game[], league: League, asOf: number): Map<string, Rating> {
  const games = results
    .filter((game) => game.league.slug === league.slug && game.homeScore !== null && game.awayScore !== null)
    .map((game) => ({
      home: game.homeTeamId,
      away: game.awayTeamId,
      margin: Math.max(-MARGIN_CAP, Math.min(MARGIN_CAP, (game.homeScore ?? 0) - (game.awayScore ?? 0))) - league.homeEdge,
      weight: Math.exp(-(asOf - Date.parse(game.utcDate)) / (20 * 86_400_000)),
    }));
  const ratings = new Map<string, Rating>();
  for (const game of games) {
    for (const id of [game.home, game.away]) {
      ratings.set(id, { value: 0, games: (ratings.get(id)?.games ?? 0) + 1 });
    }
  }
  // Gauss-Seidel on the weighted least-squares problem with a pull toward zero.
  for (let pass = 0; pass < 40; pass++) {
    const sums = new Map<string, { residual: number; weight: number }>();
    for (const game of games) {
      const home = ratings.get(game.home)!.value;
      const away = ratings.get(game.away)!.value;
      const h = sums.get(game.home) ?? { residual: 0, weight: 0 };
      const a = sums.get(game.away) ?? { residual: 0, weight: 0 };
      sums.set(game.home, { residual: h.residual + game.weight * (game.margin + away), weight: h.weight + game.weight });
      sums.set(game.away, { residual: a.residual + game.weight * (home - game.margin), weight: a.weight + game.weight });
    }
    for (const [id, sum] of sums) {
      const entry = ratings.get(id)!;
      ratings.set(id, { ...entry, value: sum.residual / (sum.weight + PRIOR_GAMES) });
    }
  }
  return ratings;
}

function playedWithin(results: Game[], teamId: string, before: string, hours: number) {
  const tip = Date.parse(before);
  return results.some((game) => {
    if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) return false;
    const gap = tip - Date.parse(game.utcDate);
    return gap > 0 && gap <= hours * 3_600_000;
  });
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** The favourite of one game, with its chance checked against our ratings and the schedule. */
function assessGame(date: string, game: Game, ratings: Map<string, Rating>, results: Game[]): HoopPick | undefined {
  if (!game.moneyline) return undefined;
  const [homeFair, awayFair] = devig([game.moneyline.home, game.moneyline.away]);
  const pickIsHome = homeFair >= awayFair;
  const marketChance = pickIsHome ? homeFair : awayFair;
  const odds = pickIsHome ? game.moneyline.home : game.moneyline.away;
  if (odds < MIN_LEG_ODDS) return undefined;

  const team = pickIsHome ? game.homeTeam : game.awayTeam;
  const opponent = pickIsHome ? game.awayTeam : game.homeTeam;
  const teamId = pickIsHome ? game.homeTeamId : game.awayTeamId;
  const opponentId = pickIsHome ? game.awayTeamId : game.homeTeamId;
  const reasons = [`${game.moneyline.provider} pays ${odds.toFixed(2)}; with its margin removed that means ${pct(marketChance)} likely.`];
  if (game.homeSpread !== undefined) {
    const spread = pickIsHome ? game.homeSpread : -game.homeSpread;
    reasons.push(`The handicap has ${team} winning by about ${Math.abs(spread)} points.`);
  }

  let chance = marketChance;
  let statsChance: number | undefined;
  const home = ratings.get(game.homeTeamId);
  const away = ratings.get(game.awayTeamId);
  const games = Math.min(home?.games ?? 0, away?.games ?? 0);
  if (home && away && games >= 3) {
    const homeWin = normalCdf((home.value - away.value + game.league.homeEdge) / game.league.sigma);
    statsChance = pickIsHome ? homeWin : 1 - homeWin;
    // Early in a season the ratings rest on few games, so they count for less.
    const trust = Math.min(1, games / 10);
    if (statsChance < 0.5 && trust >= 0.5) return undefined; // recent scores say the favourite is not one
    chance -= 0.6 * trust * Math.max(0, marketChance - statsChance);
    reasons.push(
      statsChance >= marketChance - 0.03
        ? `Our ratings from the last ${HISTORY_DAYS} days of scores agree: ${pct(statsChance)} likely.`
        : `Our ratings from recent scores are less sure (${pct(statsChance)}), so the chance is marked down.`,
    );
  } else {
    chance -= 0.03;
    reasons.push('Too few games this season to cross-check with our own ratings, so the chance is marked down a little.');
  }

  const tiredTeam = playedWithin(results, teamId, game.utcDate, 30);
  const tiredOpponent = playedWithin(results, opponentId, game.utcDate, 30);
  if (tiredTeam && !tiredOpponent) {
    chance -= 0.02;
    reasons.push(`${team} played yesterday and ${opponent} is rested.`);
  } else if (tiredOpponent && !tiredTeam) {
    reasons.push(`${opponent} played yesterday; ${team} is rested.`);
  }

  return {
    date,
    gameId: game.id,
    league: game.league.name,
    utcDate: game.utcDate,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    team,
    opponent,
    pickIsHome,
    odds,
    provider: game.moneyline.provider,
    chance,
    marketChance,
    statsChance,
    spread: game.homeSpread === undefined ? undefined : pickIsHome ? game.homeSpread : -game.homeSpread,
    teamRecord: pickIsHome ? game.homeRecord : game.awayRecord,
    opponentRecord: pickIsHome ? game.awayRecord : game.homeRecord,
    reasons,
  };
}

function bestSingle(pool: HoopPick[]) {
  return pool
    .filter((pick) => pick.odds >= TARGET_ODDS && pick.odds <= MAX_SLIP_ODDS)
    .sort((a, b) => b.chance - a.chance)[0];
}

function bestPair(pool: HoopPick[]) {
  let best: [HoopPick, HoopPick] | undefined;
  let bestChance = 0;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const odds = pool[i].odds * pool[j].odds;
      const chance = pool[i].chance * pool[j].chance;
      if (odds >= TARGET_ODDS && odds <= MAX_SLIP_ODDS && chance > bestChance) {
        best = [pool[i], pool[j]];
        bestChance = chance;
      }
    }
  }
  return best;
}

function toSlip(date: string, picks: HoopPick[]): DaySlip {
  return {
    date,
    kind: picks.length === 1 ? 'single' : 'pair',
    picks,
    odds: picks.reduce((product, pick) => product * pick.odds, 1),
    // Product of single chances; games on the same day are treated as independent.
    chance: picks.reduce((product, pick) => product * pick.chance, 1),
  };
}

/** Grades stored picks from finished games and returns the updated list. */
function settle(slips: DaySlip[], results: Game[]) {
  const byId = new Map(results.map((game) => [game.id, game]));
  let changed = false;
  const updated = slips.map((slip) => ({
    ...slip,
    picks: slip.picks.map((pick) => {
      const game = byId.get(pick.gameId);
      if (pick.result || !game || game.homeScore === null || game.awayScore === null) return pick;
      changed = true;
      const homeWon = game.homeScore > game.awayScore;
      return { ...pick, result: homeWon === pick.pickIsHome ? ('won' as const) : ('lost' as const) };
    }),
  }));
  return { slips: updated, changed };
}

function trackRecord(slips: DaySlip[]): TrackRecord {
  const settled = slips.filter((slip) => slip.picks.every((pick) => pick.result));
  return {
    settled: settled.length,
    won: settled.filter((slip) => slip.picks.every((pick) => pick.result === 'won')).length,
    expected: settled.length ? settled.reduce((sum, slip) => sum + slip.chance, 0) / settled.length : 0,
  };
}

/**
 * The day's basketball slip: the single favourite paying 1.50+ that is most likely to win, or two
 * favourites that together pay 1.50+ when that pair is clearly more likely. Once chosen, the slip is
 * stored and never changes for that day.
 */
export async function buildHoopsDay(date: string, games: Game[], signal?: AbortSignal): Promise<HoopsDay> {
  const leagues = LEAGUES.filter((league) => games.some((game) => game.league.slug === league.slug));
  const stored = await loadJson<DaySlip[]>(SLIPS_KEY, []);
  // Leagues of earlier picks still waiting for a result are downloaded too, so they can be graded.
  const ungraded = new Set(stored.flatMap((slip) => slip.picks.filter((pick) => !pick.result).map((pick) => pick.league)));
  const fetched = LEAGUES.filter((league) => leagues.includes(league) || ungraded.has(league.name));
  const results = await getRecentResults(date, fetched, HISTORY_DAYS, signal);
  const settled = settle(stored, results);
  let slips = settled.slips;
  const upcoming = games.filter((game) => game.status === 'NOT STARTED' && Date.parse(game.utcDate) > Date.now());
  const priced = upcoming.filter((game) => game.moneyline).length;
  const existing = slips.find((slip) => slip.date === date);

  let day: Omit<HoopsDay, 'track'>;
  if (existing) {
    day = { slip: existing, locked: true, games: games.length, priced, candidates: 0 };
  } else {
    const ratings = new Map(leagues.map((league) => [league.slug, fitRatings(results, league, Date.parse(`${date}T12:00:00Z`))]));
    const pool = upcoming.flatMap((game) => assessGame(date, game, ratings.get(game.league.slug) ?? new Map(), results) ?? []);
    const single = bestSingle(pool);
    const pair = bestPair(pool);
    const pairChance = pair ? pair[0].chance * pair[1].chance : 0;
    const picks = single && single.chance >= pairChance - PAIR_ADVANTAGE ? [single] : pair;
    const slip = picks ? toSlip(date, picks) : undefined;
    if (slip) slips = [...slips.filter((item) => item.date !== date), slip].slice(-120);
    day = {
      slip,
      locked: false,
      games: games.length,
      priced,
      candidates: pool.length,
      bestSingle: single?.chance,
      bestPair: pair ? pairChance : undefined,
    };
  }
  if (settled.changed || (day.slip && !existing)) await saveJson(SLIPS_KEY, slips);
  return { ...day, track: trackRecord(slips) };
}
