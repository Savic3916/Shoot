import type { RankedPlayer, TennisMatch } from './tennis-data';

/**
 * Elo ratings for tennis players, seeded from the published ranking and updated from every
 * completed singles match. Match odds come from the rating gap; set-level odds are derived from it
 * so a "wins at least one set" bet can be priced for heavy favourites.
 */
export type PlayerRating = { rating: number; matches: number };

export type RatingBook = Map<string, PlayerRating>;

const UNRANKED_RATING = 1150;
const K_BASE = 26;

export function seedRating(rank: number | undefined) {
  return rank === undefined ? UNRANKED_RATING : 1700 - 100 * Math.log(rank);
}

export function createBook(rankings: RankedPlayer[]): RatingBook {
  const book: RatingBook = new Map();
  for (const player of rankings) book.set(player.id, { rating: seedRating(player.rank), matches: 0 });
  return book;
}

function ensure(book: RatingBook, id: string): PlayerRating {
  let entry = book.get(id);
  if (!entry) {
    entry = { rating: UNRANKED_RATING, matches: 0 };
    book.set(id, entry);
  }
  return entry;
}

export function winProbability(ratingA: number, ratingB: number) {
  return 1 / (1 + 10 ** (-(ratingA - ratingB) / 400));
}

/** Applies one finished match to the book. Retirements and walkovers are ignored. */
export function applyResult(book: RatingBook, match: TennisMatch) {
  if (match.winnerIndex === undefined || match.retired) return;
  const winner = ensure(book, match.players[match.winnerIndex].id);
  const loser = ensure(book, match.players[match.winnerIndex === 0 ? 1 : 0].id);
  const expected = winProbability(winner.rating, loser.rating);
  const k = (n: number) => K_BASE * (1 + 1.5 / (1 + n / 6));
  const winnerShift = k(winner.matches) * (1 - expected);
  const loserShift = k(loser.matches) * (1 - expected);
  winner.rating += winnerShift;
  loser.rating -= loserShift;
  winner.matches += 1;
  loser.matches += 1;
}

function matchProbFromSet(p: number, bestOf: 3 | 5) {
  return bestOf === 3 ? p * p * (3 - 2 * p) : p ** 3 * (10 - 15 * p + 6 * p * p);
}

/** Per-set win probability that reproduces a given match win probability. */
export function setProbability(matchProb: number, bestOf: 3 | 5) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (matchProbFromSet(mid, bestOf) < matchProb) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** P(a player with this match win probability wins at least one set). */
export function atLeastOneSet(matchProb: number, bestOf: 3 | 5) {
  const p = setProbability(matchProb, bestOf);
  return 1 - (1 - p) ** (bestOf === 3 ? 2 : 3);
}

export type MatchForecast = {
  favouriteIndex: 0 | 1;
  /** Favourite's chance to win the match. */
  matchProb: number;
  /** Favourite's chance to win at least one set. */
  setProb: number;
  ratings: [number, number];
  matches: [number, number];
};

export function forecast(book: RatingBook, match: TennisMatch): MatchForecast {
  const a = ensure(book, match.players[0].id);
  const b = ensure(book, match.players[1].id);
  const pA = winProbability(a.rating, b.rating);
  const favouriteIndex: 0 | 1 = pA >= 0.5 ? 0 : 1;
  const matchProb = favouriteIndex === 0 ? pA : 1 - pA;
  return {
    favouriteIndex,
    matchProb,
    setProb: atLeastOneSet(matchProb, match.bestOf),
    ratings: [a.rating, b.rating],
    matches: [a.matches, b.matches],
  };
}

/** Sets won by each player, from games per set. */
export function setsWon(match: TennisMatch): [number, number] {
  let a = 0;
  let b = 0;
  for (const [x, y] of match.sets) {
    if (x > y) a += 1;
    else if (y > x) b += 1;
  }
  return [a, b];
}
