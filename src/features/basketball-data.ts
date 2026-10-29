import { americanToDecimal } from './odds';

/**
 * NBA feed from ESPN's free scoreboard (DraftKings spread, total and moneyline for upcoming games)
 * plus the league injury report.
 */
export type BasketballTeam = { id: string; name: string; abbreviation: string };

export type BasketballOdds = {
  /** Expected home margin implied by the spread (positive = home favoured). */
  homeMargin: number;
  total?: number;
  homeMoneyline?: number;
  awayMoneyline?: number;
};

export type BasketballGame = {
  id: string;
  utcDate: string;
  state: 'pre' | 'in' | 'post';
  home: BasketballTeam;
  away: BasketballTeam;
  homeScore?: number;
  awayScore?: number;
  odds?: BasketballOdds;
};

export type InjuryEntry = { athleteId: string; name: string; status: string; comment: string };

const ROOT = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parseOdds(raw: Record<string, unknown> | undefined): BasketballOdds | undefined {
  if (!raw) return undefined;
  const spread = Number(raw.spread);
  const homeOdds = isRecord(raw.homeTeamOdds) ? raw.homeTeamOdds : undefined;
  const awayOdds = isRecord(raw.awayTeamOdds) ? raw.awayTeamOdds : undefined;
  if (!Number.isFinite(spread) || !homeOdds || !awayOdds) return undefined;
  const homeFavoured = homeOdds.favorite === true;
  const awayFavoured = awayOdds.favorite === true;
  if (!homeFavoured && !awayFavoured) return undefined;
  const moneyline = isRecord(raw.moneyline) ? raw.moneyline : undefined;
  const close = (side: unknown) =>
    isRecord(side) && isRecord(side.close) ? americanToDecimal(side.close.odds) : undefined;
  const total = Number(raw.overUnder);
  return {
    homeMargin: homeFavoured ? Math.abs(spread) : -Math.abs(spread),
    total: Number.isFinite(total) && total > 0 ? total : undefined,
    homeMoneyline: close(moneyline?.home),
    awayMoneyline: close(moneyline?.away),
  };
}

export async function fetchNbaDay(yyyymmdd: string, signal?: AbortSignal): Promise<BasketballGame[]> {
  const endpoint = new URL(`${ROOT}/scoreboard`);
  endpoint.searchParams.set('dates', yyyymmdd);
  endpoint.searchParams.set('limit', '100');
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error('invalid basketball response');
  const games: BasketballGame[] = [];
  for (const event of list(payload.events)) {
    const competition = list(event.competitions)[0];
    const competitors = list(competition?.competitors);
    const home = competitors.find((item) => item.homeAway === 'home');
    const away = competitors.find((item) => item.homeAway === 'away');
    const team = (entry: Record<string, unknown> | undefined): BasketballTeam | undefined => {
      const info = isRecord(entry?.team) ? entry.team : undefined;
      return info && info.id !== undefined
        ? {
            id: String(info.id),
            name: String(info.displayName ?? info.name ?? ''),
            abbreviation: String(info.abbreviation ?? ''),
          }
        : undefined;
    };
    const homeTeam = team(home);
    const awayTeam = team(away);
    const date = typeof event.date === 'string' ? Date.parse(event.date) : NaN;
    if (!homeTeam || !awayTeam || !Number.isFinite(date)) continue;
    const statusType = isRecord(competition?.status) && isRecord(competition.status.type) ? competition.status.type : {};
    const state = statusType.state === 'post' ? 'post' : statusType.state === 'in' ? 'in' : 'pre';
    const homeScore = Number(home?.score);
    const awayScore = Number(away?.score);
    games.push({
      id: String(event.id),
      utcDate: new Date(date).toISOString(),
      state,
      home: homeTeam,
      away: awayTeam,
      homeScore: state === 'post' && Number.isFinite(homeScore) ? homeScore : undefined,
      awayScore: state === 'post' && Number.isFinite(awayScore) ? awayScore : undefined,
      odds: parseOdds(list(competition?.odds)[0]),
    });
  }
  return games;
}

/** Team id -> players listed on the injury report. */
export async function fetchInjuries(signal?: AbortSignal): Promise<Map<string, InjuryEntry[]>> {
  const response = await fetch(`${ROOT}/injuries`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  const map = new Map<string, InjuryEntry[]>();
  for (const team of list(isRecord(payload) ? payload.injuries : [])) {
    const entries: InjuryEntry[] = [];
    for (const item of list(team.injuries)) {
      const athlete = isRecord(item.athlete) ? item.athlete : undefined;
      if (!athlete) continue;
      entries.push({
        athleteId: String(athlete.id ?? ''),
        name: String(athlete.displayName ?? `${athlete.firstName ?? ''} ${athlete.lastName ?? ''}`.trim()),
        status: String(item.status ?? ''),
        comment: String(item.shortComment ?? ''),
      });
    }
    map.set(String(team.id), entries);
  }
  return map;
}

/** Top scorers, rebounders and assist leaders for each team, to spot an absent key player. */
export async function fetchKeyPlayers(gameId: string, signal?: AbortSignal): Promise<Map<string, string[]>> {
  const response = await fetch(`${ROOT}/summary?event=${gameId}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  const map = new Map<string, string[]>();
  for (const entry of list(isRecord(payload) ? payload.leaders : [])) {
    const teamId = isRecord(entry.team) ? String(entry.team.id) : '';
    const ids: string[] = [];
    for (const category of list(entry.leaders)) {
      for (const leader of list(category.leaders).slice(0, 2)) {
        if (isRecord(leader.athlete) && leader.athlete.id !== undefined) ids.push(String(leader.athlete.id));
      }
    }
    map.set(teamId, ids);
  }
  return map;
}
