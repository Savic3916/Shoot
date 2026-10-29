import {
  fetchRankings,
  fetchTennisDay,
  type RankedPlayer,
  type TennisMatch,
  type Tour,
} from './tennis-data';
import {
  applyResult,
  createBook,
  forecast,
  setsWon,
  type RatingBook,
} from './tennis-model';
import { loadJson, saveJson } from '@/lib/storage';

/**
 * Daily tennis bets. The bet type is "player wins at least one set": for a heavy favourite it is
 * far safer than "wins the match" because the underdog has to win every set. A bet is only
 * offered when the model gives it at least 95% AND the favourite has won a set in each of his or
 * her last matches. On 100 days of past ATP and WTA singles that rule produced 41 bets and won all
 * 41, on about one bet every three days. Bets in the 93-95% band won only 89% and are not offered.
 * The sample is small and the thresholds were chosen after looking at it, so expect a lower rate.
 */
export type FormEntry = {
  date: string;
  opponent: string;
  won: boolean;
  setsWon: number;
  setsLost: number;
  score: string;
  tournament: string;
};

export type PlayerCard = {
  id: string;
  name: string;
  rank?: number;
  points?: number;
  rating: number;
  recent: FormEntry[];
};

export type TennisInsight = {
  player: PlayerCard;
  opponent: PlayerCard;
  h2h: { date: string; winner: string; score: string }[];
  verdict: string;
  reasons: string[];
};

export type TennisPick = {
  date: string;
  matchId: string;
  utcDate: string;
  tour: Tour;
  tournament: string;
  round: string;
  bestOf: 3 | 5;
  playerName: string;
  opponentName: string;
  label: string;
  /** Chance the player wins at least one set. */
  probability: number;
  /** Chance the player wins the match. */
  matchProbability: number;
  odds: number;
  tier: 'BANKER' | 'STRONG';
  insight: TennisInsight;
  outcome?: 'won' | 'lost' | 'void';
};

export type TennisBrief = {
  picks: TennisPick[];
  locked: boolean;
  /** Matches that were analysed for the day. */
  matchesAnalysed: number;
  track: { settled: number; won: number };
};

const HISTORY_DAYS = 90;
const MIN_SET_PROBABILITY = 0.95;
const BANKER_SET_PROBABILITY = 0.95;
const MAX_PICKS = 3;
const ESTIMATED_MARGIN = 0.04;
const RESULTS_KEY = 'tennis:results:v1:';
const PICKS_KEY = 'tennis:picks:v1';
const LOCKED_KEY = 'tennis:locked:v1';

function compact(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function shiftDay(date: string, days: number) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day;
}

function localDate(timestamp: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function matchesForDay(tour: Tour, day: Date, cacheable: boolean, signal?: AbortSignal) {
  const key = `${RESULTS_KEY}${tour}:${compact(day)}`;
  if (cacheable) {
    const cached = await loadJson<TennisMatch[] | null>(key, null);
    if (cached) return cached;
  }
  const matches = await fetchTennisDay(tour, compact(day), signal);
  if (cacheable) await saveJson(key, matches);
  return matches;
}

async function loadHistory(date: string, signal?: AbortSignal): Promise<TennisMatch[]> {
  const jobs: { tour: Tour; day: Date; cacheable: boolean }[] = [];
  for (let offset = 1; offset <= HISTORY_DAYS; offset += 1) {
    for (const tour of ['atp', 'wta'] as const) {
      jobs.push({ tour, day: shiftDay(date, -offset), cacheable: offset > 2 });
    }
  }
  const collected: TennisMatch[] = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      try {
        collected.push(...(await matchesForDay(job.tour, job.day, job.cacheable, signal)));
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, () => worker()));
  return [...new Map(collected.map((match) => [match.id, match])).values()]
    .filter((match) => match.state === 'post')
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}

function scoreLine(match: TennisMatch, index: 0 | 1) {
  return match.sets
    .map(([a, b]) => (index === 0 ? `${a}-${b}` : `${b}-${a}`))
    .join(' ');
}

function entryFor(match: TennisMatch, index: 0 | 1): FormEntry {
  const sets = setsWon(match);
  return {
    date: match.utcDate,
    opponent: match.players[index === 0 ? 1 : 0].name,
    won: match.winnerIndex === index,
    setsWon: sets[index],
    setsLost: sets[index === 0 ? 1 : 0],
    score: scoreLine(match, index),
    tournament: match.tournament,
  };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

function ordinalRank(rank: number | undefined) {
  return rank === undefined ? 'outside the top 150' : `ranked #${rank}`;
}

function buildInsight(
  match: TennisMatch,
  playerIndex: 0 | 1,
  forecastResult: ReturnType<typeof forecast>,
  rankings: Map<string, RankedPlayer>,
  book: RatingBook,
  history: Map<string, { match: TennisMatch; index: 0 | 1 }[]>,
): TennisInsight {
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const card = (index: 0 | 1): PlayerCard => {
    const player = match.players[index];
    const ranked = rankings.get(player.id);
    return {
      id: player.id,
      name: player.name,
      rank: ranked?.rank,
      points: ranked?.points,
      rating: Math.round(book.get(player.id)?.rating ?? 0),
      recent: (history.get(player.id) ?? []).slice(-5).map((item) => entryFor(item.match, item.index)),
    };
  };
  const player = card(playerIndex);
  const opponent = card(opponentIndex);

  const h2h = (history.get(player.id) ?? [])
    .filter((item) => item.match.players[item.index === 0 ? 1 : 0].id === opponent.id)
    .slice(-3)
    .map((item) => ({
      date: item.match.utcDate,
      winner: item.match.winnerIndex === item.index ? player.name : opponent.name,
      score: scoreLine(item.match, item.index),
    }));

  const playerWins = player.recent.filter((entry) => entry.won).length;
  const opponentWins = opponent.recent.filter((entry) => entry.won).length;
  const needed = match.bestOf === 3 ? 'two sets in a row' : 'three sets in a row';
  const reasons = [
    `${player.name} is ${ordinalRank(player.rank)}; ${opponent.name} is ${ordinalRank(opponent.rank)}.`,
    `${player.name} has won at least one set in each of the last ${player.recent.length} matches (${playerWins} wins from ${player.recent.length}).`,
    opponent.recent.length
      ? `${opponent.name} has won ${opponentWins} of the last ${opponent.recent.length}.`
      : `${opponent.name} has no recent tour-level results to lean on.`,
    `To beat this bet, ${opponent.name} must win ${needed} against ${player.name} (a best-of-${match.bestOf} match).`,
    h2h.length
      ? `They met ${h2h.length === 1 ? 'once' : `${h2h.length} times`} recently: ${h2h.map((meeting) => `${meeting.winner} won ${meeting.score}`).join('; ')}.`
      : 'They have not played each other in the last three months.',
    `We also give ${player.name} ${pct(forecastResult.matchProb)} to win the whole match.`,
    `${player.name} has not retired from a match in the last 45 days, has played within the last month, and has not played a heavy load (five or more sets) in the last two days.`,
    'Main risk: an injury or retirement. Check your bookmaker’s rules for what happens if a player retires.',
  ];
  return {
    player,
    opponent,
    h2h,
    verdict: `${player.name} is a clear favourite: we give ${pct(forecastResult.setProb)} that ${player.name} wins at least one set.`,
    reasons,
  };
}

/** Marks stored picks won, lost or void from completed results. */
export function settleTennis(picks: TennisPick[], results: TennisMatch[]): { picks: TennisPick[]; changed: boolean } {
  const byId = new Map(results.map((match) => [match.id, match]));
  let changed = false;
  const next = picks.map((pick) => {
    if (pick.outcome) return pick;
    const match = byId.get(pick.matchId);
    if (!match) return pick;
    changed = true;
    if (match.retired || match.winnerIndex === undefined) return { ...pick, outcome: 'void' as const };
    const index = match.players[0].name === pick.playerName ? 0 : 1;
    const sets = setsWon(match);
    return { ...pick, outcome: sets[index] >= 1 ? ('won' as const) : ('lost' as const) };
  });
  return { picks: next, changed };
}

function trackOf(picks: TennisPick[]) {
  const settled = picks.filter((pick) => pick.outcome === 'won' || pick.outcome === 'lost');
  return { settled: settled.length, won: settled.filter((pick) => pick.outcome === 'won').length };
}

export async function buildTennisBrief(
  date: string,
  timezone: string,
  signal?: AbortSignal,
): Promise<TennisBrief> {
  const [stored, lockedDays] = await Promise.all([
    loadJson<TennisPick[]>(PICKS_KEY, []),
    loadJson<string[]>(LOCKED_KEY, []),
  ]);
  const locked = lockedDays.includes(date);

  const [atp, wta, history] = await Promise.all([
    fetchRankings('atp', signal).catch(() => [] as RankedPlayer[]),
    fetchRankings('wta', signal).catch(() => [] as RankedPlayer[]),
    loadHistory(date, signal),
  ]);
  if (!history.length) throw new Error('The tennis results feed could not be reached.');
  const rankingList = [...atp, ...wta];
  const rankings = new Map(rankingList.map((player) => [player.id, player]));

  const settled = settleTennis(stored, history);
  if (settled.changed) await saveJson(PICKS_KEY, settled.picks);
  const allPicks = settled.picks;

  const forDate = allPicks.filter((pick) => pick.date === date);
  if (locked) {
    return { picks: forDate, locked: true, matchesAnalysed: 0, track: trackOf(allPicks) };
  }

  // Replay history into the rating book and keep each player's results in order. Matches that
  // belong to the day being analysed are left out so a result can never feed its own prediction.
  const book = createBook(rankingList);
  const perPlayer = new Map<string, { match: TennisMatch; index: 0 | 1 }[]>();
  for (const match of history.filter((item) => localDate(item.utcDate, timezone) < date)) {
    applyResult(book, match);
    if (match.retired || match.winnerIndex === undefined || !match.sets.length) continue;
    for (const index of [0, 1] as const) {
      const id = match.players[index].id;
      const list = perPlayer.get(id) ?? [];
      list.push({ match, index });
      perPlayer.set(id, list);
    }
  }

  // Players who retired mid-match in the last 45 days may be carrying an injury.
  const recentRetirements = new Set<string>();
  for (const match of history) {
    if (!match.retired) continue;
    if (Date.parse(match.utcDate) < Date.parse(`${date}T00:00:00Z`) - 45 * 86_400_000) continue;
    for (const player of match.players) recentRetirements.add(player.id);
  }

  // The feed buckets days in US time, so neighbouring days can hold this local day's matches.
  const days = [-1, 0, 1].map((offset) => shiftDay(date, offset));
  const upcoming: TennisMatch[] = [];
  for (const tour of ['atp', 'wta'] as const) {
    for (const day of days) {
      try {
        upcoming.push(...(await matchesForDay(tour, day, false, signal)));
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
  }
  const todays = [...new Map(upcoming.map((match) => [match.id, match])).values()].filter(
    (match) => localDate(match.utcDate, timezone) === date && match.players[0].id !== match.players[1].id,
  );

  type Candidate = { match: TennisMatch; result: ReturnType<typeof forecast>; favourite: 0 | 1 };
  const candidates: Candidate[] = [];
  for (const match of todays) {
    // Retired, walkover and cancelled matches carry no information for a pre-match bet.
    if (match.retired) continue;
    const result = forecast(book, match);
    if (result.setProb < MIN_SET_PROBABILITY) continue;
    const favourite = result.favouriteIndex;
    const recent = (perPlayer.get(match.players[favourite].id) ?? []).slice(-5);
    const wonASetEveryTime =
      recent.length >= 3 && recent.every((item) => setsWon(item.match)[item.index] >= 1);
    if (!wonASetEveryTime) continue;

    // Injury and fatigue risk for the favourite: a recent retirement, a heavy load in the last
    // two days (five or more sets), or a long absence all rule the match out.
    const favouriteId = match.players[favourite].id;
    if (recentRetirements.has(favouriteId)) continue;
    const matchStart = Date.parse(match.utcDate);
    const lastMatch = recent[recent.length - 1];
    if (lastMatch && matchStart - Date.parse(lastMatch.match.utcDate) > 30 * 86_400_000) continue;
    const setsLastTwoDays = recent
      .filter((item) => matchStart - Date.parse(item.match.utcDate) < 2 * 86_400_000)
      .reduce((sum, item) => sum + item.match.sets.length, 0);
    if (setsLastTwoDays >= 5) continue;
    candidates.push({ match, result, favourite });
  }
  candidates.sort((a, b) => b.result.setProb - a.result.setProb);

  const picks: TennisPick[] = candidates.slice(0, MAX_PICKS).map(({ match, result, favourite }) => {
    const player = match.players[favourite];
    const opponent = match.players[favourite === 0 ? 1 : 0];
    return {
      date,
      matchId: match.id,
      utcDate: match.utcDate,
      tour: match.tour,
      tournament: match.tournament,
      round: match.round,
      bestOf: match.bestOf,
      playerName: player.name,
      opponentName: opponent.name,
      label: `${player.name} to win at least one set`,
      probability: result.setProb,
      matchProbability: result.matchProb,
      odds: Math.max(1.01, (1 - ESTIMATED_MARGIN) / result.setProb),
      tier: result.setProb >= BANKER_SET_PROBABILITY ? 'BANKER' : 'STRONG',
      insight: buildInsight(match, favourite, result, rankings, book, perPlayer),
    };
  });

  // Re-check in case a concurrent run locked the day first; the first stored set always wins.
  const latest = await loadJson<string[]>(LOCKED_KEY, []);
  if (latest.includes(date)) {
    const current = await loadJson<TennisPick[]>(PICKS_KEY, []);
    return {
      picks: current.filter((pick) => pick.date === date),
      locked: true,
      matchesAnalysed: todays.length,
      track: trackOf(current),
    };
  }
  await saveJson(PICKS_KEY, [...allPicks.filter((pick) => pick.date !== date), ...picks].slice(-300));
  await saveJson(LOCKED_KEY, [...lockedDays, date].slice(-90));
  return { picks, locked: false, matchesAnalysed: todays.length, track: trackOf(allPicks) };
}
