const axios = require('axios');

const BASE_URL = 'https://api.football-data.org/v4';
const WC_ID = 2000; // FIFA World Cup competition ID

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Auth-Token': process.env.FOOTBALL_API_KEY
  },
  timeout: 10000
});

// Cache to avoid hammering the API (10 min cache)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const LIVE_CACHE_TTL = 60 * 1000; // 1 minute for live data

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

async function getMatches(dateFrom, dateTo, status = null) {
  const key = `matches_${dateFrom}_${dateTo}_${status}`;
  const cached = getCache(key);
  if (cached) return cached;

  const params = { competitions: WC_ID };
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;
  if (status) params.status = status;

  const res = await client.get('/matches', { params });
  const data = res.data;
  const ttl = status === 'LIVE' ? LIVE_CACHE_TTL : CACHE_TTL;
  setCache(key, data, ttl);
  return data;
}

async function getLiveMatches() {
  const key = 'live_matches';
  const cached = getCache(key);
  if (cached) return cached;

  const res = await client.get(`/competitions/${WC_ID}/matches`, {
    params: { status: 'LIVE' }
  });
  setCache(key, res.data, LIVE_CACHE_TTL);
  return res.data;
}

async function getTodayMatches() {
  const now = new Date();
  // Use UTC date but we display in EAT — fetch slightly wider window
  const from = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 21 * 60 * 60 * 1000);
  const dateFrom = from.toISOString().split('T')[0];
  const dateTo = to.toISOString().split('T')[0];
  return getMatches(dateFrom, dateTo);
}

async function getYesterdayMatches() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStr = yesterday.toISOString().split('T')[0];
  return getMatches(dateStr, dateStr);
}

async function getUpcomingMatches(days = 7) {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const dateFrom = now.toISOString().split('T')[0];
  const dateTo = future.toISOString().split('T')[0];
  return getMatches(dateFrom, dateTo, 'SCHEDULED');
}

async function getStandings() {
  const key = 'standings';
  const cached = getCache(key);
  if (cached) return cached;

  const res = await client.get(`/competitions/${WC_ID}/standings`);
  setCache(key, res.data, CACHE_TTL);
  return res.data;
}

async function getMatch(matchId) {
  const key = `match_${matchId}`;
  const cached = getCache(key);
  if (cached) return cached;

  const res = await client.get(`/matches/${matchId}`);
  setCache(key, res.data, LIVE_CACHE_TTL);
  return res.data;
}

async function getH2H(matchId) {
  const key = `h2h_${matchId}`;
  const cached = getCache(key);
  if (cached) return cached;

  const res = await client.get(`/matches/${matchId}/head2head`, {
    params: { limit: 10 }
  });
  setCache(key, res.data, CACHE_TTL);
  return res.data;
}

async function getTeam(teamId) {
  const key = `team_${teamId}`;
  const cached = getCache(key);
  if (cached) return cached;

  const res = await client.get(`/teams/${teamId}`);
  setCache(key, res.data, CACHE_TTL);
  return res.data;
}

async function searchTeam(name) {
  const key = `search_${name.toLowerCase()}`;
  const cached = getCache(key);
  if (cached) return cached;

  // Get all WC teams then filter
  const res = await client.get(`/competitions/${WC_ID}/teams`);
  const teams = res.data.teams || [];
  const match = teams.find(t =>
    t.name.toLowerCase().includes(name.toLowerCase()) ||
    t.shortName.toLowerCase().includes(name.toLowerCase()) ||
    t.tla.toLowerCase().includes(name.toLowerCase())
  );
  setCache(key, match || null, CACHE_TTL);
  return match || null;
}

async function getAllWCTeams() {
  const key = 'all_wc_teams';
  const cached = getCache(key);
  if (cached) return cached;

  const res = await client.get(`/competitions/${WC_ID}/teams`);
  setCache(key, res.data, CACHE_TTL);
  return res.data;
}

// Clear live cache (called by cron)
function clearLiveCache() {
  for (const [key] of cache) {
    if (key.startsWith('live_') || key.startsWith('match_')) {
      cache.delete(key);
    }
  }
}

module.exports = {
  getMatches,
  getLiveMatches,
  getTodayMatches,
  getYesterdayMatches,
  getUpcomingMatches,
  getStandings,
  getMatch,
  getH2H,
  getTeam,
  searchTeam,
  getAllWCTeams,
  clearLiveCache
};
