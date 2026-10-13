import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 4000);
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN;
const API_ROOT = 'https://api.sportmonks.com/v3/football';
const FIXTURE_INCLUDE = [
  'participants',
  'scores',
  'league',
  'odds',
  'sidelined.player',
  'sidelined.type',
  'lineups',
  ...(process.env.SPORTMONKS_EXPECTED_LINEUPS === 'true' ? ['expectedLineups'] : []),
].join(';');
const fixtureCache = new Map();
const teamFormCache = new Map();
const requestCounts = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_FIXTURE_PAGES = 30;
const MAX_FORM_FIXTURES = 30;

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

function apiErrorMessage(payload, status) {
  const firstError = records(payload?.errors)[0];
  const message = firstError && typeof firstError.detail === 'string' ? firstError.detail : null;
  if (status === 401 || status === 403) {
    return 'Sportmonks rejected the token or this subscription lacks access. Check your token, league coverage, and odds add-on.';
  }
  if (status === 429) return 'Sportmonks API rate limit reached. Wait a moment and try again.';
  return message ?? `Sportmonks request failed (${status}).`;
}

async function providerRequest(path, parameters = {}) {
  const url = new URL(`${API_ROOT}${path}`);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: API_TOKEN },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(payload, response.status));
  if (!isRecord(payload)) throw new Error('Sportmonks returned a malformed response.');
  if (records(payload.errors).length > 0) {
    throw new Error(apiErrorMessage(payload, response.status));
  }
  return payload;
}

function participantsFor(fixture) {
  const participants = records(fixture.participants);
  const home = participants.find(
    (participant) => participant.meta?.location === 'home',
  ) ?? participants[0];
  const away = participants.find(
    (participant) => participant.meta?.location === 'away',
  ) ?? participants[1];
  if (
    !home ||
    !away ||
    (typeof home.id !== 'number' && typeof home.id !== 'string') ||
    (typeof away.id !== 'number' && typeof away.id !== 'string')
  ) {
    return undefined;
  }
  return {
    home,
    away,
    homeId: String(home.id),
    awayId: String(away.id),
  };
}

function fixtureDate(fixture) {
  if (typeof fixture.starting_at_timestamp === 'number') {
    return new Date(fixture.starting_at_timestamp * 1000).toISOString();
  }
  if (typeof fixture.starting_at === 'string') {
    const timestamp = Date.parse(`${fixture.starting_at.replace(' ', 'T')}Z`);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return undefined;
}

function scoreMap(fixture, participants) {
  const scores = records(fixture.scores);
  const getGoals = (teamId) => {
    const teamScores = scores.filter(
      (score) =>
        (score.score?.participant === 'home' &&
          (score.participant_id === undefined || String(score.participant_id) === teamId)) ||
        (score.score?.participant === 'away' &&
          (score.participant_id === undefined || String(score.participant_id) === teamId)),
    );
    const chosen =
      teamScores.find((score) => score.description === 'CURRENT') ??
      teamScores.find((score) => ['2ND_HALF', 'FULLTIME', 'FULL_TIME'].includes(score.description));
    const goals = chosen?.score?.goals;
    return typeof goals === 'number' ? goals : null;
  };
  return {
    homeGoals: getGoals(participants.homeId),
    awayGoals: getGoals(participants.awayId),
  };
}

function normalizedOdds(fixture) {
  return records(fixture.odds).flatMap((odd) => {
    const price = Number(odd.value);
    if (!Number.isFinite(price) || price <= 1 || price > 100) return [];
    const market = odd.market_description ?? odd.market?.name;
    const selection = odd.label ?? odd.name;
    if (typeof market !== 'string' || typeof selection !== 'string') return [];
    const bookmaker = odd.bookmaker?.name ?? odd.bookmaker_name ?? odd.bookmaker?.id ?? odd.bookmaker_id;
    return [{
      market,
      marketId: typeof odd.market_id === 'number' ? odd.market_id : null,
      selection,
      decimal: price,
      bookmaker: bookmaker === undefined ? 'Unknown' : String(bookmaker),
      updatedAt:
        typeof odd.latest_bookmaker_update === 'string'
          ? odd.latest_bookmaker_update
          : typeof odd.updated_at === 'string'
            ? odd.updated_at
            : null,
    }];
  });
}

function normalizeFixture(fixture) {
  const participants = participantsFor(fixture);
  const utcDate = fixtureDate(fixture);
  if (!participants || !utcDate || typeof fixture.id !== 'number') return undefined;
  const goals = scoreMap(fixture, participants);
  const sidelined = records(fixture.sidelined).flatMap((entry) => {
    const name = entry.player?.display_name ?? entry.player?.common_name ?? entry.player?.name;
    const reason = entry.type?.name ?? entry.sideline?.category ?? 'Unavailable';
    const category = entry.sideline?.category ?? 'unavailable';
    if (typeof name !== 'string') return [];
    return [{ name, reason: String(reason), category: String(category) }];
  });
  const stateId = Number(fixture.state_id);
  const status = typeof fixture.state?.name === 'string'
    ? fixture.state.name
    : typeof fixture.state?.short_name === 'string'
      ? fixture.state.short_name
      : stateId === 1
        ? 'NOT STARTED'
        : stateId === 5
          ? 'FINISHED'
          : String(fixture.state_id ?? 'UNKNOWN');
  const competition = typeof fixture.league?.name === 'string' ? fixture.league.name : 'Football';
  const expectedLineups = records(fixture.expectedLineups ?? fixture.expected_lineups);
  return {
    id: String(fixture.id),
    utcDate,
    status,
    competition,
    homeTeam: String(participants.home.name ?? participants.home.short_code ?? 'Home'),
    awayTeam: String(participants.away.name ?? participants.away.short_code ?? 'Away'),
    homeTeamId: participants.homeId,
    awayTeamId: participants.awayId,
    homeGoals: goals.homeGoals,
    awayGoals: goals.awayGoals,
    odds: normalizedOdds(fixture),
    unavailable: sidelined,
    lineupsPublished: records(fixture.lineups).length > 0,
    expectedPlayers: expectedLineups.flatMap((player) => {
      const name = player.player_name ?? player.player?.display_name ?? player.player?.name;
      return typeof name === 'string' ? [name] : [];
    }),
  };
}

async function getFixtures(date, timezone) {
  const cacheKey = `${date}:${timezone}`;
  const cached = fixtureCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.fixtures;

  const fixtures = [];
  let cursor;
  for (let page = 1; page <= MAX_FIXTURE_PAGES; page += 1) {
    const payload = await providerRequest(`/fixtures/date/${date}`, {
      include: FIXTURE_INCLUDE,
      ...(cursor ? { cursor } : { per_page: 50 }),
      timezone,
    });
    fixtures.push(...records(payload.data));
    if (payload.pagination?.has_more !== true) {
      const normalized = fixtures.map(normalizeFixture).filter(Boolean);
      fixtureCache.set(cacheKey, { fixtures: normalized, expiresAt: Date.now() + 3 * 60_000 });
      return normalized;
    }
    if (typeof payload.pagination.next_cursor !== 'string') {
      throw new Error('Sportmonks indicated more fixtures but did not return a pagination cursor.');
    }
    cursor = payload.pagination.next_cursor;
  }
  throw new Error('This date has more fixtures than the configured API page limit. Narrow the provider coverage or raise MAX_FIXTURE_PAGES.');
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

async function getTeamForm(teamId, date, timezone) {
  const key = `${teamId}:${date}:${timezone}`;
  const cached = teamFormCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  const start = new Date(`${date}T12:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 90);
  const from = start.toISOString().slice(0, 10);
  const payload = await providerRequest(`/fixtures/between/${from}/${date}/${teamId}`, {
    include: 'participants;scores;lineups.details.type',
    order: 'desc',
    per_page: 10,
    timezone,
  });
  const playerStats = new Map();
  const completedFixtures = records(payload.data).filter((fixture) => {
    const stateName = String(fixture.state?.name ?? fixture.state?.short_name ?? '').toLowerCase();
    return Number(fixture.state_id) === 5 || stateName.includes('finished');
  }).slice(0, 8);
  const results = completedFixtures.flatMap((fixture) => {
    const participants = participantsFor(fixture);
    const utcDate = fixtureDate(fixture);
    if (!participants || !utcDate) return [];
    const goals = scoreMap(fixture, participants);
    if (goals.homeGoals === null || goals.awayGoals === null) return [];
    const isHome = participants.homeId === teamId;
    const goalsFor = isHome ? goals.homeGoals : goals.awayGoals;
    const goalsAgainst = isHome ? goals.awayGoals : goals.homeGoals;
    const opponent = isHome ? participants.away.name : participants.home.name;
    for (const lineup of records(fixture.lineups)) {
      if (String(lineup.team_id) !== teamId) continue;
      const playerId = lineup.player_id;
      const playerName = lineup.player_name ?? lineup.player?.display_name ?? lineup.player?.name;
      if ((typeof playerId !== 'number' && typeof playerId !== 'string') || typeof playerName !== 'string') {
        continue;
      }
      const id = String(playerId);
      const summary = playerStats.get(id) ?? {
        id,
        name: playerName,
        appearances: 0,
        goals: 0,
        assists: 0,
        minutes: 0,
        ratingTotal: 0,
        ratingCount: 0,
      };
      summary.appearances += 1;
      for (const detail of records(lineup.details)) {
        const type = String(detail.type?.developer_name ?? detail.type?.name ?? detail.type?.code ?? '').toLowerCase();
        const rawValue = detail.value;
        const value = typeof rawValue === 'number'
          ? rawValue
          : typeof rawValue?.total === 'number'
            ? rawValue.total
            : typeof rawValue?.average === 'number'
              ? rawValue.average
              : null;
        if (value === null) continue;
        if (type.includes('goal') && !type.includes('conced')) summary.goals += value;
        if (type.includes('assist')) summary.assists += value;
        if (type.includes('minute')) summary.minutes += value;
        if (type.includes('rating')) {
          summary.ratingTotal += value;
          summary.ratingCount += 1;
        }
      }
      playerStats.set(id, summary);
    }
    return [{
      utcDate,
      opponent: typeof opponent === 'string' ? opponent : 'Opponent',
      goalsFor,
      goalsAgainst,
    }];
  });
  const players = [...playerStats.values()]
    .map(({ ratingTotal, ratingCount, ...player }) => ({
      ...player,
      averageRating: ratingCount ? ratingTotal / ratingCount : null,
    }))
    .sort((a, b) => b.goals + b.assists - (a.goals + a.assists))
    .slice(0, 8);
  const data = { results, players };
  teamFormCache.set(key, { results: data, expiresAt: Date.now() + 30 * 60_000 });
  return data;
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

async function matchday(date, timezone) {
  const fixtures = await getFixtures(date, timezone);
  const potentialFixtures = fixtures
    .filter((fixture) =>
      fixture.odds.some((odd) => odd.market.toLowerCase().includes('double chance')),
    )
    .sort((a, b) => b.odds.length - a.odds.length)
    .slice(0, MAX_FORM_FIXTURES);
  const teamIds = [...new Set(potentialFixtures.flatMap((fixture) => [
    fixture.homeTeamId,
    fixture.awayTeamId,
  ]))];
  const teamEntries = await mapConcurrent(teamIds, 5, async (teamId) => [
    teamId,
    await getTeamForm(teamId, date, timezone),
  ]);
  const form = Object.fromEntries(teamEntries.map(([teamId, data]) => [teamId, data.results]));
  const players = Object.fromEntries(teamEntries.map(([teamId, data]) => [teamId, data.players]));
  return { source: 'sportmonks', date, fixtures, form, players };
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    send(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, { status: 'ok', provider: 'sportmonks', configured: Boolean(API_TOKEN) });
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
  if (!API_TOKEN) {
    send(response, 503, { error: 'Set SPORTMONKS_API_TOKEN in .env to enable licensed match data.' });
    return;
  }

  try {
    const data = await matchday(date, timezone);
    send(response, 200, data, { 'Cache-Control': 'public, max-age=180' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load football data.';
    console.error(`[sportmonks] ${message}`);
    send(response, 502, { error: message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sideline data server listening on port ${PORT}`);
});
