import {
  fetchInjuries,
  fetchKeyPlayers,
  fetchNbaDay,
  type BasketballGame,
  type InjuryEntry,
} from './basketball-data';
import { devig } from './odds';
import { loadJson, saveJson } from '@/lib/storage';

/**
 * Basketball (NBA) bets. The bet is "favourite +L": a wide
 * handicap that only loses if the favourite is beaten by L points or more. The bookmaker spread is
 * used as the expected margin (it already holds most public information); the work here is risk
 * selection: lopsided games only, no back-to-backs, no absent key players, and a spread that
 * agrees with the moneyline.
 *
 * Last season's 833 test games finished more than 26 points from even a basic Elo prediction only
 * 2.5% of the time (more than 24 points: 4.2%). Bookmaker lines are sharper than that model, so
 * lines set about 25 points from the spread have a small miss rate. This is not guaranteed.
 */
export type BasketballPick = {
  date: string;
  gameId: string;
  utcDate: string;
  home: string;
  away: string;
  favourite: string;
  underdog: string;
  favouriteIsHome: boolean;
  /** Head start given to the favourite, e.g. 17.5. */
  line: number;
  label: string;
  /** Expected margin by which the favourite wins. */
  expectedMargin: number;
  total?: number;
  probability: number;
  odds: number;
  reasons: string[];
  outcome?: 'won' | 'lost' | 'void';
};

export type BasketballBrief = {
  picks: BasketballPick[];
  gamesChecked: number;
  track: { settled: number; won: number };
};

const SIGMA = 13; // conservative: bookmaker margins miss by ~12, our own model by ~15
const Z_TARGET = 1.96; // about 97.5% before rounding the line up
const MAX_LINE = 20.5; // beyond this, bookmakers rarely offer the alternate spread
const MIN_FAVOURITE_MARGIN = 5;
const MAX_PICKS = 3;
const ESTIMATED_MARGIN = 0.03;
const MAX_MONEYLINE_DISAGREEMENT = 0.06;
const PICKS_KEY = 'basketball:picks:v1';
const LOCKED_KEY = 'basketball:locked:v1';
const BLOCKING_STATUS = /out|doubtful|questionable|day-to-day|suspend/i;

function normalCdf(x: number) {
  // Abramowitz-Stegun approximation.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

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

function trackOf(picks: BasketballPick[]) {
  const settled = picks.filter((pick) => pick.outcome === 'won' || pick.outcome === 'lost');
  return { settled: settled.length, won: settled.filter((pick) => pick.outcome === 'won').length };
}

async function settleStored(picks: BasketballPick[], signal?: AbortSignal) {
  const open = picks.filter((pick) => !pick.outcome && Date.parse(pick.utcDate) < Date.now() - 6 * 3_600_000);
  if (!open.length) return { picks, changed: false };
  const days = [...new Set(open.map((pick) => pick.date))];
  const results = new Map<string, BasketballGame>();
  for (const day of days) {
    for (const offset of [-1, 0, 1]) {
      try {
        for (const game of await fetchNbaDay(compact(shiftDay(day, offset)), signal)) results.set(game.id, game);
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
  }
  let changed = false;
  const next = picks.map((pick) => {
    const game = results.get(pick.gameId);
    if (pick.outcome || !game || game.state !== 'post' || game.homeScore === undefined || game.awayScore === undefined) {
      return pick;
    }
    changed = true;
    const homeMargin = game.homeScore - game.awayScore;
    const favouriteMargin = pick.favouriteIsHome ? homeMargin : -homeMargin;
    const net = favouriteMargin + pick.line;
    return { ...pick, outcome: net === 0 ? ('void' as const) : net > 0 ? ('won' as const) : ('lost' as const) };
  });
  return { picks: next, changed };
}

function playedYesterdayOrTwiceInFour(teamId: string, recent: BasketballGame[], gameTime: string) {
  const start = Date.parse(gameTime);
  const played = recent
    .filter((game) => game.state === 'post' && (game.home.id === teamId || game.away.id === teamId))
    .map((game) => Date.parse(game.utcDate))
    .filter((time) => time < start)
    .sort((a, b) => b - a);
  const lastGapDays = played.length ? (start - played[0]) / 86_400_000 : undefined;
  const gamesInThreeDays = played.filter((time) => start - time < 3.2 * 86_400_000).length;
  return { backToBack: lastGapDays !== undefined && lastGapDays < 1.6, heavyWeek: gamesInThreeDays >= 2, lastGapDays };
}

export async function buildBasketballBrief(
  date: string,
  timezone: string,
  signal?: AbortSignal,
): Promise<BasketballBrief> {
  const [stored, lockedDays] = await Promise.all([
    loadJson<BasketballPick[]>(PICKS_KEY, []),
    loadJson<string[]>(LOCKED_KEY, []),
  ]);
  const settled = await settleStored(stored, signal);
  if (settled.changed) await saveJson(PICKS_KEY, settled.picks);
  const allPicks = settled.picks;
  if (lockedDays.includes(date)) {
    return {
      picks: allPicks.filter((pick) => pick.date === date),
      gamesChecked: 0,
      track: trackOf(allPicks),
    };
  }

  const fetched: BasketballGame[] = [];
  for (const offset of [-1, 0, 1]) {
    try {
      fetched.push(...(await fetchNbaDay(compact(shiftDay(date, offset)), signal)));
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  const todays = [...new Map(fetched.map((game) => [game.id, game])).values()].filter(
    (game) => localDate(game.utcDate, timezone) === date,
  );
  if (!fetched.length) throw new Error('The basketball feed could not be reached.');

  const recent: BasketballGame[] = [];
  for (let back = 1; back <= 7; back += 1) {
    try {
      recent.push(...(await fetchNbaDay(compact(shiftDay(date, -back)), signal)));
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  const injuries = await fetchInjuries(signal).catch(() => new Map<string, InjuryEntry[]>());

  type Candidate = BasketballPick & { rank: number };
  const candidates: Candidate[] = [];
  for (const game of todays) {
    // Prices of a game in play reflect the score, so only pre-game prices are used.
    if (game.state !== 'pre' || !game.odds?.total) continue;
    const odds = game.odds;
    const favouriteIsHome = odds.homeMargin >= 0;
    const margin = Math.abs(odds.homeMargin);
    if (margin < MIN_FAVOURITE_MARGIN) continue;
    const favourite = favouriteIsHome ? game.home : game.away;
    const underdog = favouriteIsHome ? game.away : game.home;

    // The spread and the moneyline come from the same market and must tell the same story.
    if (odds.homeMoneyline && odds.awayMoneyline) {
      const [homeWin] = devig([odds.homeMoneyline, odds.awayMoneyline]);
      const fromSpread = normalCdf(odds.homeMargin / 12);
      if (Math.abs(homeWin - fromSpread) > MAX_MONEYLINE_DISAGREEMENT) continue;
    }

    const lineRaw = Z_TARGET * SIGMA - margin;
    const line = Math.ceil(lineRaw - 0.5) + 0.5;
    if (line > MAX_LINE || line < 0.5) continue;
    const probability = normalCdf((margin + line) / SIGMA);

    const reasons: string[] = [];
    let rejected = false;
    for (const team of [game.home, game.away]) {
      const load = playedYesterdayOrTwiceInFour(team.id, recent, game.utcDate);
      if (load.backToBack || load.heavyWeek) {
        rejected = true;
        break;
      }
      const list = injuries.get(team.id) ?? [];
      if (list.filter((entry) => /out/i.test(entry.status)).length >= 3) {
        rejected = true;
        break;
      }
    }
    if (rejected) continue;

    // Key players (top scorers, rebounders, passers) must not be on the injury report.
    let keyPlayers: Map<string, string[]>;
    try {
      keyPlayers = await fetchKeyPlayers(game.id, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      continue; // cannot verify who is playing, so the game is not offered
    }
    const absentStar = [game.home, game.away].some((team) => {
      const stars = new Set(keyPlayers.get(team.id) ?? []);
      return (injuries.get(team.id) ?? []).some((entry) => stars.has(entry.athleteId) && BLOCKING_STATUS.test(entry.status));
    });
    if (absentStar || ![game.home, game.away].every((team) => (keyPlayers.get(team.id) ?? []).length)) continue;

    reasons.push(
      `The bookmaker makes ${favourite.name} about ${margin.toFixed(1)}-point favourites over ${underdog.name}. This bet gives ${favourite.name} a ${line}-point head start, so ${underdog.name} would have to win by ${Math.ceil(line)} or more points for it to lose.`,
      'Last season, only about 4 in 100 NBA games finished more than 26 points away from even a basic prediction, and bookmaker lines are sharper than that.',
      'The spread and the moneyline agree with each other, so the market is not sending mixed signals.',
      'Neither team played in the last day or two, so tired legs and rest days are not a worry.',
      "None of either team's leading scorers, rebounders or passers is on the injury report.",
      `Expected total points: ${odds.total}. A blowout is possible, which is why the head start is so large.`,
      'Risk: late injury news or an unusual blowout. Alternate spread lines this wide may not be offered by every bookmaker, so check yours.',
    );
    candidates.push({
      date,
      gameId: game.id,
      utcDate: game.utcDate,
      home: game.home.name,
      away: game.away.name,
      favourite: favourite.name,
      underdog: underdog.name,
      favouriteIsHome,
      line,
      label: `${favourite.name} +${line}`,
      expectedMargin: margin,
      total: odds.total,
      probability,
      odds: Math.max(1.01, (1 - ESTIMATED_MARGIN) / probability),
      reasons,
      // Smaller required head start = more likely to be offered; then the stronger favourite.
      rank: -line * 10 + margin,
    });
  }
  candidates.sort((a, b) => b.rank - a.rank);
  const picks: BasketballPick[] = candidates.slice(0, MAX_PICKS).map(({ rank: _rank, ...pick }) => pick);

  const latest = await loadJson<string[]>(LOCKED_KEY, []);
  if (latest.includes(date)) {
    const current = await loadJson<BasketballPick[]>(PICKS_KEY, []);
    return { picks: current.filter((pick) => pick.date === date), gamesChecked: todays.length, track: trackOf(current) };
  }
  await saveJson(PICKS_KEY, [...allPicks.filter((pick) => pick.date !== date), ...picks].slice(-300));
  // Lock once a pick exists or no game is left to price; otherwise later prices may still qualify.
  if (picks.length || !todays.some((game) => game.state === 'pre')) {
    await saveJson(LOCKED_KEY, [...lockedDays, date].slice(-90));
  }
  return { picks, gamesChecked: todays.length, track: trackOf(allPicks) };
}
