import type { FootballMatch } from './football-data';
import type { PastResult } from './history';
import { outcomeOf } from './markets';

/**
 * Match-level risks a bet can be undone by even when the model is right: red cards, fatigue and
 * rotation. In 50 days of testing, football picks won 85% of the time without a red card in the
 * match and 76% with one (about 18% of top-league matches had one), and 30% for +/-1.5
 * handicaps. A match is only eligible when these risks can be measured and are low.
 */
export type RiskCheck = {
  ok: boolean;
  /** Why the match was rejected (empty when ok). */
  failures: string[];
  /** Plain-English findings to show with the pick. */
  notes: string[];
};

const RECENT_WINDOW = 10;
const MIN_MATCHES_WITH_CARDS = 5;
const MAX_COMBINED_RED_RATE = 0.25;
const MAX_TEAM_RED_RATE = 0.2;
const MIN_REST_DAYS = 4;

export type TeamHistory = Map<string, PastResult[]>;

export function buildTeamHistory(results: PastResult[]): TeamHistory {
  const map: TeamHistory = new Map();
  for (const result of [...results].sort((a, b) => a.utcDate.localeCompare(b.utcDate))) {
    for (const id of [result.homeTeamId, result.awayTeamId]) {
      const list = map.get(id) ?? [];
      list.push(result);
      map.set(id, list);
    }
  }
  return map;
}

function discipline(history: TeamHistory, teamId: string, before: string) {
  const games = (history.get(teamId) ?? []).filter((game) => game.utcDate < before);
  const withCards = games.filter((game) => game.cards).slice(-RECENT_WINDOW);
  if (withCards.length < MIN_MATCHES_WITH_CARDS) return undefined;
  const reds = withCards.reduce(
    (sum, game) => sum + (game.homeTeamId === teamId ? game.cards!.homeRed : game.cards!.awayRed),
    0,
  );
  const yellows = withCards.reduce(
    (sum, game) => sum + (game.homeTeamId === teamId ? game.cards!.homeYellow : game.cards!.awayYellow),
    0,
  );
  const last = games[games.length - 1];
  const restDays = last ? (Date.parse(before) - Date.parse(last.utcDate)) / 86_400_000 : undefined;
  return { redRate: reds / withCards.length, yellowRate: yellows / withCards.length, restDays, sample: withCards.length };
}

const FORM_WINDOW = 10;
const FORM_HALF_LIFE_GAMES = 6;
/** A game at the same venue as this fixture (home side at home, away side away) counts fully. */
const OTHER_VENUE_WEIGHT = 0.6;

export type HistorySupport = {
  /** Smoothed, recency- and venue-weighted share of recent games this bet would have won. */
  support: number;
  hits: number;
  games: number;
};

/**
 * How often this exact bet would have won in each team's last ten games from the downloaded
 * history, home team from its own side and away team from its own side. Recent games and games at
 * the same venue count more. Unlike the five-game check this needs no network, so it runs on
 * every bet of every match.
 */
export function historySupport(key: string, fixture: FootballMatch, history: TeamHistory): HistorySupport | undefined {
  let weightedHits = 0;
  let weightedGames = 0;
  let hits = 0;
  let games = 0;
  for (const side of ['home', 'away'] as const) {
    const teamId = side === 'home' ? fixture.homeTeamId : fixture.awayTeamId;
    const recent = (history.get(teamId) ?? []).filter((game) => game.utcDate < fixture.utcDate).slice(-FORM_WINDOW);
    recent.forEach((game, index) => {
      const atHome = game.homeTeamId === teamId;
      const goalsFor = atHome ? game.homeGoals : game.awayGoals;
      const goalsAgainst = atHome ? game.awayGoals : game.homeGoals;
      const won = side === 'home' ? outcomeOf(key, goalsFor, goalsAgainst) : outcomeOf(key, goalsAgainst, goalsFor);
      if (won === null) return;
      const age = recent.length - 1 - index;
      const weight = 0.5 ** (age / FORM_HALF_LIFE_GAMES) * (atHome === (side === 'home') ? 1 : OTHER_VENUE_WEIGHT);
      weightedGames += weight;
      games += 1;
      if (won) {
        weightedHits += weight;
        hits += 1;
      }
    });
  }
  if (!games) return undefined;
  return { support: (weightedHits + 1) / (weightedGames + 2), hits, games };
}

export function assessMatch(fixture: FootballMatch, history: TeamHistory): RiskCheck {
  const failures: string[] = [];
  const notes: string[] = [];
  const home = discipline(history, fixture.homeTeamId, fixture.utcDate);
  const away = discipline(history, fixture.awayTeamId, fixture.utcDate);

  if (!home || !away) {
    failures.push('Red-card risk cannot be measured: this competition does not publish card data for one of the teams.');
    return { ok: false, failures, notes };
  }

  const combined = home.redRate + away.redRate;
  notes.push(
    `Discipline: ${fixture.homeTeam} ${home.redRate.toFixed(2)} red cards a game, ${fixture.awayTeam} ${away.redRate.toFixed(2)} (last ${Math.min(home.sample, away.sample)}+ matches). Low risk of a sending-off.`,
  );
  if (combined >= MAX_COMBINED_RED_RATE || home.redRate >= MAX_TEAM_RED_RATE || away.redRate >= MAX_TEAM_RED_RATE) {
    failures.push('One of these teams is sent off often enough to make the result unreliable.');
  }

  for (const [name, side] of [[fixture.homeTeam, home], [fixture.awayTeam, away]] as const) {
    if (side.restDays !== undefined && side.restDays < MIN_REST_DAYS) {
      failures.push(`${name} play again after only ${Math.floor(side.restDays)} days, so rotation and fatigue are a risk.`);
    }
  }
  if (home.restDays !== undefined && away.restDays !== undefined) {
    notes.push(`Rest: ${fixture.homeTeam} ${Math.floor(home.restDays)} days, ${fixture.awayTeam} ${Math.floor(away.restDays)} days since their last match.`);
  }
  return { ok: failures.length === 0, failures, notes };
}
