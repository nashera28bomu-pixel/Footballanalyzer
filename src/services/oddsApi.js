const axios = require('axios');

const BASE_URL = 'https://api.the-odds-api.com/v4';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000
});

// Cache odds for 10 minutes to preserve free tier quota
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

async function getWorldCupOdds() {
  const key = 'wc_odds';
  const cached = getCache(key);
  if (cached) return cached;

  const res = await client.get('/sports/soccer_fifa_world_cup/odds', {
    params: {
      apiKey: process.env.ODDS_API_KEY,
      regions: 'eu,uk',
      markets: 'h2h',
      oddsFormat: 'decimal',
      dateFormat: 'iso'
    }
  });

  setCache(key, res.data);
  return res.data;
}

async function getMatchOdds(homeTeam, awayTeam) {
  const all = await getWorldCupOdds();
  if (!all || !Array.isArray(all)) return null;

  // Find matching event
  const event = all.find(e => {
    const h = e.home_team.toLowerCase();
    const a = e.away_team.toLowerCase();
    const ht = homeTeam.toLowerCase();
    const at = awayTeam.toLowerCase();
    return (h.includes(ht) || ht.includes(h)) &&
           (a.includes(at) || at.includes(a));
  });

  return event || null;
}

// Format odds nicely for display
function formatOdds(event) {
  if (!event) return null;

  const bookmakers = event.bookmakers || [];
  if (bookmakers.length === 0) return null;

  // Prefer Bet365 > Pinnacle > first available
  const preferred = bookmakers.find(b => b.key === 'bet365') ||
                    bookmakers.find(b => b.key === 'pinnacle') ||
                    bookmakers[0];

  const market = preferred.markets.find(m => m.key === 'h2h');
  if (!market) return null;

  const outcomes = market.outcomes;
  const home = outcomes.find(o => o.name === event.home_team);
  const away = outcomes.find(o => o.name === event.away_team);
  const draw = outcomes.find(o => o.name === 'Draw');

  return {
    bookmaker: preferred.title,
    home: { team: event.home_team, odds: home ? home.price.toFixed(2) : 'N/A' },
    draw: { odds: draw ? draw.price.toFixed(2) : 'N/A' },
    away: { team: event.away_team, odds: away ? away.price.toFixed(2) : 'N/A' },
    commenceTime: event.commence_time
  };
}

// Get best value picks from all odds (3 picks)
async function getHotPicks() {
  const key = 'hot_picks';
  const cached = getCache(key);
  if (cached) return cached;

  const all = await getWorldCupOdds();
  if (!all || !Array.isArray(all)) return [];

  const picks = [];

  for (const event of all) {
    const bookmakers = event.bookmakers || [];
    if (bookmakers.length === 0) continue;

    // Average odds across bookmakers
    const allOdds = { home: [], draw: [], away: [] };

    for (const bm of bookmakers) {
      const market = bm.markets.find(m => m.key === 'h2h');
      if (!market) continue;
      for (const o of market.outcomes) {
        if (o.name === event.home_team) allOdds.home.push(o.price);
        else if (o.name === event.away_team) allOdds.away.push(o.price);
        else allOdds.draw.push(o.price);
      }
    }

    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const homeAvg = avg(allOdds.home);
    const drawAvg = avg(allOdds.draw);
    const awayAvg = avg(allOdds.away);

    // Find lowest odds (favourite = most confident pick)
    let best, bestOdds, outcome;
    if (homeAvg > 0 && homeAvg <= drawAvg && homeAvg <= awayAvg) {
      best = event.home_team;
      bestOdds = homeAvg;
      outcome = 'home_win';
    } else if (awayAvg > 0 && awayAvg < homeAvg) {
      best = event.away_team;
      bestOdds = awayAvg;
      outcome = 'away_win';
    } else {
      best = 'Draw';
      bestOdds = drawAvg;
      outcome = 'draw';
    }

    picks.push({
      matchId: event.id,
      home: event.home_team,
      away: event.away_team,
      pick: best,
      odds: bestOdds.toFixed(2),
      outcome,
      commenceTime: event.commence_time,
      bookmakerCount: bookmakers.length
    });
  }

  // Sort by confidence (lowest odds = most likely) and take top 3
  picks.sort((a, b) => parseFloat(a.odds) - parseFloat(b.odds));
  const top3 = picks.slice(0, 3);

  setCache(key, top3);
  return top3;
}

module.exports = {
  getWorldCupOdds,
  getMatchOdds,
  formatOdds,
  getHotPicks
};
