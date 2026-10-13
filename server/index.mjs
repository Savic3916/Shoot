import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 4000);
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const API_ROOT = 'https://api.football-data.org/v4';
const LEAGUES = new Set(['PL', 'PD', 'BL1', 'SA', 'FL1']);
const cache = new Map();
const requestCounts = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

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

function matchesResponse(payload) {
  if (!payload || !Array.isArray(payload.matches)) {
    throw new Error('Football data provider returned an invalid matches response.');
  }

  return payload.matches.map((match) => {
    const homeTeam = match.homeTeam?.name;
    const awayTeam = match.awayTeam?.name;
    const fullTime = match.score?.fullTime;
    if (
      typeof match.id !== 'number' ||
      typeof match.utcDate !== 'string' ||
      typeof match.status !== 'string' ||
      typeof homeTeam !== 'string' ||
      typeof awayTeam !== 'string' ||
      !fullTime
    ) {
      throw new Error('Football data provider returned a malformed match.');
    }

    return {
      id: match.id,
      utcDate: match.utcDate,
      status: match.status,
      homeTeam,
      awayTeam,
      homeGoals: typeof fullTime.home === 'number' ? fullTime.home : null,
      awayGoals: typeof fullTime.away === 'number' ? fullTime.away : null,
    };
  });
}

async function fetchCompetitionMatches(competition, dateFrom, dateTo, status) {
  const query = new URLSearchParams({ dateFrom, dateTo });
  if (status) query.set('status', status);
  const response = await fetch(`${API_ROOT}/competitions/${competition}/matches?${query}`, {
    headers: { 'X-Auth-Token': API_KEY },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('The football data API rate limit was reached. Please wait and try again.');
    }
    throw new Error(`Football data API request failed (${response.status}).`);
  }
  return response.json();
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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

async function getMatchday(competition, date) {
  const key = `${competition}:${date}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const dateFrom = new Date(`${date}T00:00:00.000Z`);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - 120);
  const historyStart = dateFrom.toISOString().slice(0, 10);
  const [fixturesPayload, historyPayload] = await Promise.all([
    fetchCompetitionMatches(competition, date, date, undefined),
    fetchCompetitionMatches(competition, historyStart, date, 'FINISHED'),
  ]);
  const data = {
    competition: fixturesPayload.competition?.name ?? competition,
    fixtures: matchesResponse(fixturesPayload),
    history: matchesResponse(historyPayload),
  };
  cache.set(key, { data, expiresAt: Date.now() + 3 * 60_000 });
  return data;
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    send(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') {
    send(response, 200, { status: 'ok' });
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

  const competition = url.searchParams.get('competition');
  const date = url.searchParams.get('date');
  if (!competition || !LEAGUES.has(competition)) {
    send(response, 400, { error: 'Choose a supported competition: PL, PD, BL1, SA, or FL1.' });
    return;
  }
  if (!date || !validDate(date)) {
    send(response, 400, { error: 'Provide a valid date in YYYY-MM-DD format.' });
    return;
  }
  if (!API_KEY) {
    send(response, 503, { error: 'Set FOOTBALL_DATA_API_KEY in .env to enable live match data.' });
    return;
  }

  try {
    const data = await getMatchday(competition, date);
    send(response, 200, data, { 'Cache-Control': 'public, max-age=180' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load football data.';
    console.error(`[football-data] ${message}`);
    send(response, 502, { error: message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Match data server listening on port ${PORT}`);
});
