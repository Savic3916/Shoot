import type { MatchAnalysis } from './analysis';
import type { FootballMatch } from './football-data';
import { allMeetings } from './h2h';
import { familyOf, formatPercent, outcomeOf } from './markets';

/**
 * Evidence behind a pick, gathered from the same free ESPN feed: last five matches, head to
 * head, league table, team news and key players. It is fetched once when the day's picks are
 * created and stored with them, so the reasoning never changes after the picks are locked.
 */
export type RecentGame = {
  date: string;
  opponent: string;
  venue: 'H' | 'A';
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
  competition: string;
};

export type NewsItem = {
  headline: string;
  published: string;
  kind: 'availability' | 'club' | 'general';
};

export type TeamInsight = {
  id: string;
  name: string;
  /** Oldest first. */
  games: RecentGame[];
  standing?: { rank: number; points: number; played: number; goalDiff: number; record: string };
  keyPlayers: { name: string; note: string }[];
  news: NewsItem[];
};

export type H2HGame = {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
};

export type Factor = {
  title: string;
  text: string;
  favours: 'home' | 'away' | 'neutral';
};

export type PickInsight = {
  home: TeamInsight;
  away: TeamInsight;
  h2h: H2HGame[];
  venue?: string;
  /** One-sentence summary of the call. */
  verdict: string;
  /** Why this specific bet, in plain language. */
  betReasons: string[];
  /** Wider picture of the match. */
  factors: Factor[];
};

const ROOT = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all';
const NEWS_WINDOW_MS = 21 * 86_400_000;
const AVAILABILITY =
  /injur|doubt|ruled out|sidelined|suspen|\bban(ned)?\b|fitness|setback|knock|hamstring|surgery|unavailable|absen|red card|illness|ankle|knee|muscle|\bmiss(es|ing)?\b|return(s|ing)? (from|to)/i;
const CLUB =
  /sack|crisis|future|doubts? over|\brow\b|tension|unrest|takeover|owners?|board|dispute|strike|financ|embargo|deduct|protest|resign|turmoil|\bmess\b|pressure|axed|interim|head coach|manager/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

async function getJson(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${ROOT}/${path}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error('invalid response');
  return payload;
}

function parseGames(summary: Record<string, unknown>, teamId: string): RecentGame[] {
  const entry = list(summary.lastFiveGames).find(
    (item) => isRecord(item.team) && String(item.team.id) === teamId,
  );
  const games: RecentGame[] = [];
  for (const event of list(entry?.events)) {
    const isHome = String(event.homeTeamId) === teamId;
    const homeGoals = num(event.homeTeamScore);
    const awayGoals = num(event.awayTeamScore);
    const opponent = isRecord(event.opponent) ? event.opponent.displayName : undefined;
    if (homeGoals === undefined || awayGoals === undefined || typeof opponent !== 'string') continue;
    const goalsFor = isHome ? homeGoals : awayGoals;
    const goalsAgainst = isHome ? awayGoals : homeGoals;
    games.push({
      date: String(event.gameDate ?? ''),
      opponent,
      venue: isHome ? 'H' : 'A',
      goalsFor,
      goalsAgainst,
      result: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
      competition: String(event.leagueAbbreviation ?? event.leagueName ?? ''),
    });
  }
  return games.sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
}

function parseH2H(summary: Record<string, unknown>): H2HGame[] {
  const series = list(summary.seasonseries).find((item) => item.type === 'head-to-head');
  const games: H2HGame[] = [];
  for (const event of list(series?.events)) {
    const competitors = list(event.competitors);
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    const homeName = isRecord(home?.team) ? home.team.displayName : undefined;
    const awayName = isRecord(away?.team) ? away.team.displayName : undefined;
    const homeGoals = num(home?.score);
    const awayGoals = num(away?.score);
    if (typeof homeName !== 'string' || typeof awayName !== 'string') continue;
    if (homeGoals === undefined || awayGoals === undefined) continue;
    games.push({ date: String(event.date ?? ''), home: homeName, away: awayName, homeGoals, awayGoals });
  }
  return games.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
}

function parseStanding(summary: Record<string, unknown>, teamId: string): TeamInsight['standing'] {
  for (const group of list(summary.standings && isRecord(summary.standings) ? summary.standings.groups : [])) {
    const entries = list(isRecord(group.standings) ? group.standings.entries : []);
    const entry = entries.find((item) => String(item.id) === teamId);
    if (!entry) continue;
    const stat = (abbr: string) => num(list(entry.stats).find((s) => s.abbreviation === abbr)?.value);
    const total = list(entry.stats).find((s) => s.abbreviation === 'Total');
    const rank = stat('R');
    const points = stat('P');
    if (rank === undefined || points === undefined) continue;
    return {
      rank,
      points,
      played: stat('GP') ?? 0,
      goalDiff: stat('GD') ?? 0,
      record: typeof total?.displayValue === 'string' ? total.displayValue : '',
    };
  }
  return undefined;
}

function parseKeyPlayers(summary: Record<string, unknown>, teamId: string): TeamInsight['keyPlayers'] {
  const entry = list(summary.leaders).find((item) => isRecord(item.team) && String(item.team.id) === teamId);
  const players: TeamInsight['keyPlayers'] = [];
  for (const category of list(entry?.leaders)) {
    const leader = list(category.leaders)[0];
    const athlete = isRecord(leader?.athlete) ? leader.athlete : undefined;
    const name = athlete?.displayName;
    if (typeof name !== 'string') continue;
    if (category.name === 'goalsLeaders') {
      players.push({ name, note: String(leader.displayValue ?? 'Top scorer').replace('Matches', 'Apps') });
    } else if (category.name === 'assistsLeaders') {
      players.push({ name, note: String(leader.displayValue ?? 'Top assister').replace('Matches', 'Apps') });
    }
  }
  return players.slice(0, 2);
}

function relevantNews(payload: Record<string, unknown>, team: { id: string; name: string }): NewsItem[] {
  const now = Date.now();
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const article of list(payload.articles)) {
    const headline = article.headline;
    const published = article.published;
    if (typeof headline !== 'string' || typeof published !== 'string') continue;
    if (now - Date.parse(published) > NEWS_WINDOW_MS || seen.has(headline)) continue;
    const teamTags = list(article.categories).filter((c) => c.type === 'team');
    const onlyThisTeam =
      teamTags.length === 1 && (String(teamTags[0].teamId) === team.id || teamTags[0].description === team.name);
    const mentionsTeam = headline.includes(team.name) || onlyThisTeam;
    // Roundup headlines tag several clubs; only keep articles where this team is the subject.
    if (!mentionsTeam) continue;
    seen.add(headline);
    items.push({
      headline,
      published,
      kind: AVAILABILITY.test(headline) ? 'availability' : CLUB.test(headline) ? 'club' : 'general',
    });
  }
  return items.slice(0, 5);
}

function tally(games: RecentGame[]) {
  const n = games.length;
  const sum = (pick: (g: RecentGame) => number) => games.reduce((total, g) => total + pick(g), 0);
  return {
    n,
    points: sum((g) => (g.result === 'W' ? 3 : g.result === 'D' ? 1 : 0)),
    form: games.map((g) => g.result).join(''),
    scored: n ? sum((g) => g.goalsFor) / n : 0,
    conceded: n ? sum((g) => g.goalsAgainst) / n : 0,
    cleanSheets: games.filter((g) => g.goalsAgainst === 0).length,
    failedToScore: games.filter((g) => g.goalsFor === 0).length,
    btts: games.filter((g) => g.goalsFor > 0 && g.goalsAgainst > 0).length,
    over25: games.filter((g) => g.goalsFor + g.goalsAgainst > 2).length,
    under25: games.filter((g) => g.goalsFor + g.goalsAgainst < 3).length,
  };
}

const oneDp = (value: number) => value.toFixed(1);

function buildFactors(
  fixture: FootballMatch,
  home: TeamInsight,
  away: TeamInsight,
  h2h: H2HGame[],
  analysis: MatchAnalysis,
): Factor[] {
  const factors: Factor[] = [];
  const h = tally(home.games);
  const a = tally(away.games);

  if (h.n >= 3 && a.n >= 3) {
    const diff = h.points / h.n - a.points / a.n;
    factors.push({
      title: 'Recent form',
      text:
        `${fixture.homeTeam} took ${h.points} of ${h.n * 3} points (${h.form}); ` +
        `${fixture.awayTeam} took ${a.points} of ${a.n * 3} (${a.form}).`,
      favours: diff >= 0.6 ? 'home' : diff <= -0.6 ? 'away' : 'neutral',
    });
    factors.push({
      title: 'Goals scored and conceded',
      text:
        `${fixture.homeTeam}: ${oneDp(h.scored)} scored, ${oneDp(h.conceded)} conceded per game. ` +
        `${fixture.awayTeam}: ${oneDp(a.scored)} scored, ${oneDp(a.conceded)} conceded.`,
      favours:
        h.scored - h.conceded - (a.scored - a.conceded) >= 0.8
          ? 'home'
          : h.scored - h.conceded - (a.scored - a.conceded) <= -0.8
            ? 'away'
            : 'neutral',
    });
  }

  const homeAtHome = home.games.filter((g) => g.venue === 'H');
  const awayOnRoad = away.games.filter((g) => g.venue === 'A');
  if (homeAtHome.length >= 2 && awayOnRoad.length >= 2) {
    const hh = tally(homeAtHome);
    const aa = tally(awayOnRoad);
    factors.push({
      title: 'Home and away split',
      text:
        `${fixture.homeTeam} at home: ${plural(hh.points, 'point')} from ${hh.n} games, ${oneDp(hh.scored)} scored a game. ` +
        `${fixture.awayTeam} away: ${plural(aa.points, 'point')} from ${aa.n} games, ${oneDp(aa.scored)} scored a game.`,
      favours: hh.points / hh.n - aa.points / aa.n >= 1 ? 'home' : hh.points / hh.n - aa.points / aa.n <= -1 ? 'away' : 'neutral',
    });
  }

  if (h2h.length >= 2) {
    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    let goals = 0;
    let btts = 0;
    for (const game of h2h) {
      goals += game.homeGoals + game.awayGoals;
      if (game.homeGoals > 0 && game.awayGoals > 0) btts += 1;
      const homeSideGoals = game.home === fixture.homeTeam ? game.homeGoals : game.awayGoals;
      const awaySideGoals = game.home === fixture.homeTeam ? game.awayGoals : game.homeGoals;
      if (homeSideGoals > awaySideGoals) homeWins += 1;
      else if (homeSideGoals < awaySideGoals) awayWins += 1;
      else draws += 1;
    }
    factors.push({
      title: 'Head to head',
      text:
        `Last ${h2h.length} meetings: ${fixture.homeTeam} ${homeWins}W, ${draws}D, ${awayWins}L. ` +
        `${oneDp(goals / h2h.length)} goals per game; both scored in ${btts} of ${h2h.length}.`,
      favours: homeWins - awayWins >= 2 ? 'home' : awayWins - homeWins >= 2 ? 'away' : 'neutral',
    });
  }

  if (home.standing && away.standing) {
    const gap = away.standing.rank - home.standing.rank;
    factors.push({
      title: 'League table',
      text:
        `${fixture.homeTeam} are ${ordinal(home.standing.rank)} (${home.standing.points} pts, GD ${signed(home.standing.goalDiff)}); ` +
        `${fixture.awayTeam} are ${ordinal(away.standing.rank)} (${away.standing.points} pts, GD ${signed(away.standing.goalDiff)}).`,
      favours: gap >= 4 ? 'home' : gap <= -4 ? 'away' : 'neutral',
    });
  }

  for (const [team, side] of [[fixture.homeTeam, home], [fixture.awayTeam, away]] as const) {
    const item = side.news.find((news) => news.kind === 'availability') ?? side.news.find((news) => news.kind === 'club');
    if (item) {
      factors.push({
        title: item.kind === 'availability' ? `${team}: availability` : `${team}: club situation`,
        text: item.headline,
        favours: 'neutral',
      });
    }
  }

  const p = analysis.probs;
  factors.push({
    title: 'Our prediction',
    text:
      `We expect ${fixture.homeTeam} ${analysis.predictedScore.home}–${analysis.predictedScore.away} ${fixture.awayTeam}. ` +
      `Chances: home win ${formatPercent(p.home)}, draw ${formatPercent(p.draw)}, away win ${formatPercent(p.away)}.`,
    favours: p.home - p.away >= 0.2 ? 'home' : p.away - p.home >= 0.2 ? 'away' : 'neutral',
  });
  return factors;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function ordinal(n: number) {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function betReasons(
  fixture: FootballMatch,
  key: string,
  home: TeamInsight,
  away: TeamInsight,
  h2h: H2HGame[],
  analysis: MatchAnalysis,
): string[] {
  const reasons: string[] = [];
  const h = tally(home.games);
  const a = tally(away.games);
  const have = h.n >= 3 && a.n >= 3;
  const xg = analysis.expectedGoals;
  const total = xg.home + xg.away;
  const family = familyOf(key);
  const homeName = fixture.homeTeam;
  const awayName = fixture.awayTeam;
  const meetings = h2h.length;
  const h2hGoals = meetings ? h2h.reduce((sum, g) => sum + g.homeGoals + g.awayGoals, 0) / meetings : undefined;

  if (family === 'goals') {
    const over = key.startsWith('o');
    const line = Number(key.slice(1)) / 10;
    if (have) {
      const all = [...home.games, ...away.games];
      const hits = all.filter((g) => (over ? g.goalsFor + g.goalsAgainst > line : g.goalsFor + g.goalsAgainst < line)).length;
      reasons.push(
        `In their last five games each, ${hits} of ${all.length} matches had ${over ? 'more' : 'fewer'} than ${line} goals.`,
      );
      reasons.push(
        over
          ? `${homeName} score ${oneDp(h.scored)} a game and ${awayName} score ${oneDp(a.scored)}, so both attacks are making chances.`
          : `${homeName} have kept ${plural(h.cleanSheets, 'clean sheet')} and ${awayName} ${a.cleanSheets} in their last five, so goals are not coming easily.`,
      );
    }
    reasons.push(`We expect roughly ${oneDp(total)} goals in this match.`);
    if (h2hGoals !== undefined) {
      reasons.push(`When these teams met before, games averaged ${oneDp(h2hGoals)} goals.`);
    }
  } else if (family === 'btts') {
    const yes = key === 'btts';
    if (have) {
      reasons.push(
        yes
          ? `Both teams scored in ${h.btts} of ${homeName}'s last ${h.n} games and ${a.btts} of ${awayName}'s last ${a.n}.`
          : `${homeName} failed to score in ${h.failedToScore} of their last ${h.n}; ${awayName} in ${a.failedToScore} of ${a.n}. One side often draws a blank.`,
      );
      reasons.push(
        yes
          ? `Neither defence is secure: ${homeName} concede ${oneDp(h.conceded)} a game, ${awayName} ${oneDp(a.conceded)}.`
          : `Clean sheets lately: ${homeName} ${h.cleanSheets}, ${awayName} ${a.cleanSheets}.`,
      );
    }
    reasons.push(`We give it ${formatPercent(yes ? analysis.probs.btts : analysis.probs.nobtts)} that this happens.`);
  } else if (family === 'handicap') {
    const side = key.startsWith('ah:') ? homeName : awayName;
    const line = Number(key.replace(/^(ah|ahA):/, ''));
    reasons.push(
      line > 0
        ? `${side} get a ${line}-goal head start, so they can lose by up to ${plural(Math.floor(line), 'goal')} and the bet still wins.`
        : `${side} must win by ${Math.ceil(Math.abs(line))} or more goals for this bet to win.`,
    );
    if (have) reasons.push(`Recent form: ${homeName} ${h.form}, ${awayName} ${a.form}.`);
    reasons.push(`Our most likely score is ${analysis.predictedScore.home}–${analysis.predictedScore.away}.`);
  } else {
    if (have) {
      reasons.push(
        `${homeName} earned ${h.points} of a possible ${h.n * 3} points recently (${h.form}); ${awayName} earned ${a.points} of ${a.n * 3} (${a.form}).`,
      );
    }
    if (home.standing && away.standing) {
      reasons.push(`${homeName} are ${ordinal(home.standing.rank)} in the table and ${awayName} ${ordinal(away.standing.rank)}.`);
    }
    reasons.push(
      `Chances: ${homeName} win ${formatPercent(analysis.probs.home)}, draw ${formatPercent(analysis.probs.draw)}, ${awayName} win ${formatPercent(analysis.probs.away)}.`,
    );
  }
  const agree = analysis.hasMarket && analysis.hasStats && analysis.disagreement < 0.06;
  reasons.push(
    agree
      ? 'The bookmaker odds and our own team ratings point the same way, which is what we look for.'
      : analysis.hasMarket
        ? 'This agrees with what the bookmaker odds imply.'
        : 'This is based on recent results only; no bookmaker odds were available for this match.',
  );
  return reasons;
}

function verdictFor(label: string, probability: number, analysis: MatchAnalysis, fixture: FootballMatch) {
  return (
    `${label} is our safest angle on ${fixture.homeTeam} v ${fixture.awayTeam}: ` +
    `${formatPercent(probability)} likely, with ${analysis.predictedScore.home}–${analysis.predictedScore.away} the most probable score.`
  );
}

type Feeds = [Record<string, unknown>, PromiseSettledResult<Record<string, unknown>>, PromiseSettledResult<Record<string, unknown>>];
const feedCache = new Map<string, Promise<Feeds | undefined>>();
const FEED_CACHE_SIZE = 400;

/**
 * Downloads a match's summary and both teams' news once; every bet on the same match reuses it,
 * so checking all bet types of a match costs no more requests than checking one.
 */
function matchFeeds(fixture: FootballMatch, signal?: AbortSignal): Promise<Feeds | undefined> {
  const cached = feedCache.get(fixture.id);
  if (cached) return cached;
  const request = Promise.allSettled([
    getJson(`summary?event=${fixture.id}`, signal),
    getJson(`news?team=${fixture.homeTeamId}&limit=20`, signal),
    getJson(`news?team=${fixture.awayTeamId}&limit=20`, signal),
  ]).then(([summary, home, away]): Feeds | undefined =>
    summary.status === 'fulfilled' ? [summary.value, home, away] : undefined,
  );
  feedCache.set(fixture.id, request);
  // A failed or aborted download is forgotten so the next run tries again.
  request.then((feeds) => { if (!feeds) feedCache.delete(fixture.id); });
  if (feedCache.size > FEED_CACHE_SIZE) feedCache.delete(feedCache.keys().next().value!);
  return request;
}

/** Fetches and assembles the evidence for one pick; resolves undefined if the feed is unreachable. */
export async function fetchInsight(
  fixture: FootballMatch,
  pick: { key: string; label: string; probability: number },
  analysis: MatchAnalysis,
  signal?: AbortSignal,
): Promise<PickInsight | undefined> {
  const raw = await matchFeeds(fixture, signal);
  if (!raw) return undefined;
  const [summary, homeNews, awayNews] = raw;

  const build = (id: string, name: string, news: PromiseSettledResult<Record<string, unknown>>): TeamInsight => ({
    id,
    name,
    games: parseGames(summary, id),
    standing: parseStanding(summary, id),
    keyPlayers: parseKeyPlayers(summary, id),
    news: news.status === 'fulfilled' ? relevantNews(news.value, { id, name }) : [],
  });
  const home = build(fixture.homeTeamId, fixture.homeTeam, homeNews);
  const away = build(fixture.awayTeamId, fixture.awayTeam, awayNews);
  // Every league meeting since 2003, not just the last few the summary lists.
  const h2h = await allMeetings(fixture, parseH2H(summary), signal);
  const venue = isRecord(summary.gameInfo) && isRecord(summary.gameInfo.venue)
    ? (summary.gameInfo.venue.fullName as string | undefined)
    : undefined;

  return {
    home,
    away,
    h2h,
    venue,
    verdict: verdictFor(pick.label, pick.probability, analysis, fixture),
    betReasons: betReasons(fixture, pick.key, home, away, h2h, analysis),
    factors: buildFactors(fixture, home, away, h2h, analysis),
  };
}

/**
 * How often this exact bet would have won in each team's last five games, counting the home
 * team's games from the home side and the away team's games from the away side. It is an
 * independent check on the model: a bet the model loves but recent form contradicts is dropped.
 */
export function formSupport(key: string, insight: PickInsight): { hits: number; n: number } {
  let hits = 0;
  let n = 0;
  for (const game of insight.home.games) {
    const won = outcomeOf(key, game.goalsFor, game.goalsAgainst);
    if (won !== null) {
      n += 1;
      if (won) hits += 1;
    }
  }
  for (const game of insight.away.games) {
    const won = outcomeOf(key, game.goalsAgainst, game.goalsFor);
    if (won !== null) {
      n += 1;
      if (won) hits += 1;
    }
  }
  return { hits, n };
}
