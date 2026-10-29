/**
 * Tennis feed: ESPN's free ATP and WTA scoreboards (singles only) and the published rankings.
 * Prices are not included for tennis, so every price shown in the app is the model's own.
 */
export type Tour = 'atp' | 'wta';

export type TennisPlayer = { id: string; name: string };

export type TennisMatch = {
  id: string;
  tour: Tour;
  utcDate: string;
  tournament: string;
  round: string;
  bestOf: 3 | 5;
  players: [TennisPlayer, TennisPlayer];
  /** 'pre' not started, 'in' playing, 'post' finished. */
  state: 'pre' | 'in' | 'post';
  /** Set when the match finished normally (no retirement or walkover). */
  winnerIndex?: 0 | 1;
  /** Games per set from each player's side, e.g. [[6,3],[4,6],[6,2]]. */
  sets: [number, number][];
  retired: boolean;
};

export type RankedPlayer = { id: string; name: string; rank: number; points: number };

const ROOT = 'https://site.api.espn.com/apis/site/v2/sports/tennis';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parseMatch(
  tour: Tour,
  event: Record<string, unknown>,
  competition: Record<string, unknown>,
  isMens: boolean,
): TennisMatch | undefined {
  const competitors = list(competition.competitors).sort((a, b) => Number(a.order) - Number(b.order));
  if (competitors.length !== 2) return undefined;
  const players = competitors.map((competitor) => {
    const athlete = isRecord(competitor.athlete) ? competitor.athlete : undefined;
    const name = athlete?.displayName ?? athlete?.fullName;
    const id = competitor.id ?? athlete?.guid;
    // Undecided draw slots come through as "TBD", "Qualifier" or a bye; they are not real players.
    return typeof name === 'string' && id !== undefined && !/^(tbd|tba|bye|qualifier|winner|loser)/i.test(name.trim())
      ? { id: String(id), name }
      : undefined;
  });
  if (!players[0] || !players[1]) return undefined;

  const statusType = isRecord(competition.status) && isRecord(competition.status.type) ? competition.status.type : {};
  const state = statusType.state === 'post' ? 'post' : statusType.state === 'in' ? 'in' : 'pre';
  const statusName = String(statusType.name ?? '');
  const retired = /RETIRED|WALKOVER|DEFAULT|CANCEL|POSTPONED|SUSPEND/i.test(statusName);

  const lines = competitors.map((competitor) => list(competitor.linescores).map((line) => Number(line.value)));
  const sets: [number, number][] = [];
  for (let i = 0; i < Math.min(lines[0].length, lines[1].length); i += 1) {
    if (Number.isFinite(lines[0][i]) && Number.isFinite(lines[1][i])) sets.push([lines[0][i], lines[1][i]]);
  }
  const winnerIndex = competitors[0].winner === true ? 0 : competitors[1].winner === true ? 1 : undefined;
  const date = typeof competition.date === 'string' ? Date.parse(competition.date) : NaN;
  if (!Number.isFinite(date)) return undefined;
  const major = event.major === true;

  return {
    id: String(competition.id),
    tour,
    utcDate: new Date(date).toISOString(),
    tournament: typeof event.shortName === 'string' ? event.shortName : String(event.name ?? 'Tennis'),
    round: isRecord(competition.round) && typeof competition.round.displayName === 'string'
      ? competition.round.displayName
      : '',
    bestOf: major && isMens ? 5 : 3,
    players: [players[0], players[1]],
    state,
    winnerIndex: state === 'post' && !retired ? winnerIndex : undefined,
    sets,
    retired,
  };
}

export async function fetchTennisDay(tour: Tour, yyyymmdd: string, signal?: AbortSignal): Promise<TennisMatch[]> {
  const endpoint = new URL(`${ROOT}/${tour}/scoreboard`);
  endpoint.searchParams.set('dates', yyyymmdd);
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error('invalid tennis response');
  const matches: TennisMatch[] = [];
  for (const event of list(payload.events)) {
    for (const group of list(event.groupings)) {
      const slug = isRecord(group.grouping) ? String(group.grouping.slug ?? '') : '';
      if (slug !== 'mens-singles' && slug !== 'womens-singles') continue;
      for (const competition of list(group.competitions)) {
        const match = parseMatch(tour, event, competition, slug === 'mens-singles');
        if (match) matches.push(match);
      }
    }
  }
  return matches;
}

export async function fetchRankings(tour: Tour, signal?: AbortSignal): Promise<RankedPlayer[]> {
  const response = await fetch(`${ROOT}/${tour}/rankings`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  const ranks = isRecord(payload) ? list(list(payload.rankings)[0]?.ranks) : [];
  const players: RankedPlayer[] = [];
  for (const entry of ranks) {
    const athlete = isRecord(entry.athlete) ? entry.athlete : undefined;
    const rank = Number(entry.current);
    if (!athlete || !Number.isFinite(rank)) continue;
    players.push({
      id: String(athlete.id ?? ''),
      name: String(athlete.displayName ?? ''),
      rank,
      points: Number(entry.points) || 0,
    });
  }
  return players;
}
