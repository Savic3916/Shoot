import { createServer } from 'node:http';

const PORT = 4000;
const ESPN_ROOT = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const CACHE_TTL_MS = 2 * 60_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const SCOREBOARD_CONCURRENCY = 6;
const fixtureCache = new Map();
const teamFormCache = new Map();
const requestCounts = new Map();
const LEAGUES = [
  'uefa.champions',
  'uefa.europa',
  'uefa.europa.conf',
  'uefa.nations',
  'eng.1',
  'eng.2',
  'eng.3',
  'eng.4',
  'eng.fa',
  'eng.league_cup',
  'esp.1',
  'esp.2',
  'esp.copa_del_rey',
  'ger.1',
  'ger.2',
  'ger.dfb_pokal',
  'ita.1',
  'ita.2',
  'ita.coppa_italia',
  'fra.1',
  'fra.2',
  'fra.coupe_de_france',
  'ned.1',
  'por.1',
  'sco.1',
  'bel.1',
  'tur.1',
  'bra.1',
  'arg.1',
  'mex.1',
  'usa.1',
  'conmebol.libertadores',
  'conmebol.sudamericana',
  'aus.1',
  'jpn.1',
];

function send(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTimezone(value) {
  if (!value || value.length > 60) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isRateLimited(request) {
  const address = request.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const current = requestCounts.get(address);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestCounts.set(address, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

async function mapConcurrent(values, concurrency, mapper) {
  const result = new Array(values.length);
  let index = 0;
  async function worker() {
    while (index < values.length) {
      const current = index;
      index += 1;
      result[current] = await mapper(values[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}

async function getLeagueScoreboard(league, date) {
  const url = new URL(`${ESPN_ROOT}/${league}/scoreboard`);
  url.searchParams.set('dates', date.replaceAll('-', ''));
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`${league} scoreboard request failed (${response.status}).`);
  }
  const payload = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    throw new Error(`${league} returned a malformed scoreboard.`);
  }
  const leagueName = records(payload.leagues)[0]?.name;
  return {
    league,
    leagueName: typeof leagueName === 'string' ? leagueName : league,
    events: records(payload.events),
  };
}

function participant(competitors, homeAway) {
  return competitors.find((entry) => entry.homeAway === homeAway);
}

function score(value) {
  if (isRecord(value)) {
    return score(value.displayValue ?? value.value);
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function eventStatus(event) {
  const competition = records(event.competitions)[0];
  const type = competition?.status?.type;
  if (type?.completed === true || type?.state === 'post') return 'FINISHED';
  if (type?.state === 'in') return 'LIVE';
  if (type?.state === 'pre') return 'NOT STARTED';
  return typeof type?.detail === 'string'
    ? type.detail
    : typeof type?.name === 'string'
      ? type.name
      : 'UNKNOWN';
}

function formResults(form, utcDate) {
  if (typeof form !== 'string') return [];
  const outcomes = form.toUpperCase().match(/[WDL]/g) ?? [];
  return outcomes.map((outcome, index) => ({
    utcDate: `${utcDate}#${index}`,
    opponent: 'Recent form',
    goalsFor: null,
    goalsAgainst: null,
    outcome,
  }));
}

function normalizeEvent(event, leagueName, leagueId) {
  const competition = records(event.competitions)[0];
  const competitors = records(competition?.competitors);
  const home = participant(competitors, 'home');
  const away = participant(competitors, 'away');
  const eventTime = typeof event.date === 'string' ? Date.parse(event.date) : NaN;
  const utcDate = Number.isFinite(eventTime) ? new Date(eventTime).toISOString() : null;
  const id = typeof event.id === 'string' || typeof event.id === 'number'
    ? String(event.id)
    : null;
  if (
    !home ||
    !away ||
    !isRecord(home.team) ||
    !isRecord(away.team) ||
    utcDate === null ||
    id === null
  ) {
    return undefined;
  }
  const homeId = String(home.team.id ?? '');
  const awayId = String(away.team.id ?? '');
  const homeName = home.team.displayName ?? home.team.name;
  const awayName = away.team.displayName ?? away.team.name;
  if (!homeId || !awayId || typeof homeName !== 'string' || typeof awayName !== 'string') {
    return undefined;
  }
  return {
    id,
    utcDate,
    status: eventStatus(event),
    competition: leagueName,
    leagueId,
    homeTeam: homeName,
    awayTeam: awayName,
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeGoals: score(home.score),
    awayGoals: score(away.score),
    odds: [],
    unavailable: [],
    lineupsPublished: false,
    expectedPlayers: [],
    homeForm: formResults(home.form, utcDate),
    awayForm: formResults(away.form, utcDate),
  };
}

async function getTeamSchedule(leagueId, teamId, date) {
  const cacheKey = `${leagueId}:${teamId}`;
  const cached = teamFormCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  const url = new URL(`${ESPN_ROOT}/${leagueId}/teams/${teamId}/schedule`);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`${leagueId} history for team ${teamId} failed (${response.status}).`);
  }
  const payload = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    throw new Error(`${leagueId} returned malformed team history for team ${teamId}.`);
  }

  const results = records(payload.events)
    .filter((event) => {
      const timestamp = typeof event.date === 'string' ? Date.parse(event.date) : NaN;
      return Number.isFinite(timestamp) && event.date < date;
    })
    .flatMap((event) => {
      const competition = records(event.competitions)[0];
      if (competition?.status?.type?.completed !== true &&
          competition?.status?.type?.state !== 'post') {
        return [];
      }
      const competitors = records(competition.competitors);
      const team = competitors.find((entry) => String(entry.team?.id ?? '') === teamId);
      const opponent = competitors.find((entry) => String(entry.team?.id ?? '') !== teamId);
      if (!team || !opponent) return [];
      const goalsFor = score(team.score);
      const goalsAgainst = score(opponent.score);
      if (goalsFor === null || goalsAgainst === null) return [];
      const eventTime = Date.parse(event.date);
      return [{
        utcDate: new Date(eventTime).toISOString(),
        opponent: String(opponent.team?.displayName ?? opponent.team?.name ?? 'Opponent'),
        goalsFor,
        goalsAgainst,
        outcome: goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L',
      }];
    })
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
    .slice(0, 8);
  teamFormCache.set(cacheKey, { results, expiresAt: Date.now() + 30 * 60_000 });
  return results;
}

async function matchday(date) {
  const cached = fixtureCache.get(date);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const results = await mapConcurrent(LEAGUES, SCOREBOARD_CONCURRENCY, async (league) => {
    try {
      return { scoreboard: await getLeagueScoreboard(league, date) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown feed error.';
      console.error(`[espn:${league}] ${message}`);
      return { warning: `${league}: ${message}` };
    }
  });
  const scoreboards = results.flatMap((result) => result.scoreboard ? [result.scoreboard] : []);
  const warnings = results.flatMap((result) => result.warning ? [result.warning] : []);
  if (!scoreboards.length) {
    throw new Error(`The free football feed could not be reached. ${warnings.slice(0, 3).join(' ')}`);
  }

  const fixtures = scoreboards
    .flatMap((scoreboard) =>
      scoreboard.events
        .map((event) => normalizeEvent(event, scoreboard.leagueName, scoreboard.league))
        .filter(Boolean),
    )
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const teamPairs = new Map();
  for (const fixture of fixtures) {
    teamPairs.set(`${fixture.leagueId}:${fixture.homeTeamId}`, {
      leagueId: fixture.leagueId,
      teamId: fixture.homeTeamId,
    });
    teamPairs.set(`${fixture.leagueId}:${fixture.awayTeamId}`, {
      leagueId: fixture.leagueId,
      teamId: fixture.awayTeamId,
    });
  }
  const schedules = await mapConcurrent([...teamPairs.values()], SCOREBOARD_CONCURRENCY, async (team) => {
    try {
      return {
        key: `${team.leagueId}:${team.teamId}`,
        results: await getTeamSchedule(team.leagueId, team.teamId, date),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown team history error.';
      console.error(`[espn:${team.leagueId}:team:${team.teamId}] ${message}`);
      return { key: `${team.leagueId}:${team.teamId}`, results: [], warning: true };
    }
  });
  const scheduleMap = new Map(schedules.map((entry) => [entry.key, entry.results]));
  const historyWarningCount = schedules.filter((entry) => entry.warning).length;
  const form = {};
  for (const fixture of fixtures) {
    const homeForm = scheduleMap.get(`${fixture.leagueId}:${fixture.homeTeamId}`);
    const awayForm = scheduleMap.get(`${fixture.leagueId}:${fixture.awayTeamId}`);
    const resolvedHomeForm =
      homeForm && homeForm.length >= fixture.homeForm.length ? homeForm : fixture.homeForm;
    const resolvedAwayForm =
      awayForm && awayForm.length >= fixture.awayForm.length ? awayForm : fixture.awayForm;
    if ((form[fixture.homeTeamId]?.length ?? 0) < resolvedHomeForm.length) {
      form[fixture.homeTeamId] = resolvedHomeForm;
    }
    if ((form[fixture.awayTeamId]?.length ?? 0) < resolvedAwayForm.length) {
      form[fixture.awayTeamId] = resolvedAwayForm;
    }
    delete fixture.leagueId;
    delete fixture.homeForm;
    delete fixture.awayForm;
  }
  const data = {
    source: 'espn',
    date,
    fixtures,
    form,
    players: {},
    coverageWarnings: [
      ...warnings,
      ...(historyWarningCount
        ? [`Recent scores were unavailable for ${historyWarningCount} team(s); their W/D/L form is shown when available.`]
        : []),
    ],
  };
  fixtureCache.set(date, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    send(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, { status: 'ok', provider: 'espn-public-feed' });
    return;
  }
  if (request.method !== 'GET' || url.pathname !== '/api/matches') {
    send(response, 404, { error: 'Route not found.' });
    return;
  }
  if (isRateLimited(request)) {
    send(response, 429, { error: 'Too many requests. Please wait a minute and try again.' });
    return;
  }

  const date = url.searchParams.get('date');
  const timezone = url.searchParams.get('timezone') ?? 'UTC';
  if (!validDate(date)) {
    send(response, 400, { error: 'Provide a valid date in YYYY-MM-DD format.' });
    return;
  }
  if (!validTimezone(timezone)) {
    send(response, 400, { error: 'Provide a valid IANA timezone.' });
    return;
  }

  try {
    const data = await matchday(date);
    send(response, 200, data, { 'Cache-Control': 'public, max-age=120' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load football data.';
    console.error(`[espn] ${message}`);
    send(response, 502, { error: message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sideline free football data server listening on port ${PORT}`);
});
