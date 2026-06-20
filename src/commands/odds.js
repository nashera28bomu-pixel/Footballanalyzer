const oddsApi = require('../services/oddsApi');
const footballApi = require('../services/footballApi');
const { formatMatchTime, formatMatchDate, isToday, isTomorrow } = require('../utils/time');
const { getBackMenu } = require('../utils/menu');
const { Markup } = require('telegraf');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// the-odds-api bookmaker keys → Kenyan/Africa display name
// Betika, Pepeta, Sportybet KE, SportPesa are not on the-odds-api (they're regional).
// We show international bookmakers available in Kenya and note the KE sites separately.
const BOOKMAKER_MAP = {
  'bet365':       { name: 'Bet365',     flag: '🌍', ke: false },
  'betway':       { name: 'Betway',     flag: '🇰🇪', ke: true  }, // Betway KE is active
  '1xbet':        { name: '1xBet',      flag: '🇰🇪', ke: true  }, // 1xBet KE active
  'unibet':       { name: 'Unibet',     flag: '🌍', ke: false },
  'pinnacle':     { name: 'Pinnacle',   flag: '🌍', ke: false },
  'draftkings':   { name: 'DraftKings', flag: '🌍', ke: false },
  'fanduel':      { name: 'FanDuel',    flag: '🌍', ke: false },
  'betfair':      { name: 'Betfair',    flag: '🌍', ke: false },
  'williamhill':  { name: 'William Hill',flag: '🌍', ke: false },
  'bwin':         { name: 'Bwin',       flag: '🌍', ke: false },
  'marathonbet':  { name: 'MarathonBet',flag: '🌍', ke: false },
  'coral':        { name: 'Coral',      flag: '🌍', ke: false },
  'ladbrokes':    { name: 'Ladbrokes',  flag: '🌍', ke: false },
  'betvictor':    { name: 'BetVictor',  flag: '🌍', ke: false },
  'paddypower':   { name: 'Paddy Power',flag: '🌍', ke: false },
};

function getBookmakerOdds(event, bmKey) {
  const bm = (event.bookmakers || []).find(b => b.key === bmKey);
  if (!bm) return null;
  const market = bm.markets?.find(m => m.key === 'h2h');
  if (!market) return null;
  const home = market.outcomes.find(o => o.name === event.home_team);
  const away = market.outcomes.find(o => o.name === event.away_team);
  const draw = market.outcomes.find(o => o.name === 'Draw');
  if (!home || !away) return null;
  return {
    home: home.price.toFixed(2),
    draw: draw ? draw.price.toFixed(2) : 'N/A',
    away: away.price.toFixed(2)
  };
}

function getBestOddsPerOutcome(event) {
  const homeTeam = event.home_team;
  const awayTeam = event.away_team;

  let bestHome = { odds: 0, bm: '' };
  let bestDraw = { odds: 0, bm: '' };
  let bestAway = { odds: 0, bm: '' };

  for (const bm of (event.bookmakers || [])) {
    const market = bm.markets?.find(m => m.key === 'h2h');
    if (!market) continue;
    const bmInfo = BOOKMAKER_MAP[bm.key];
    const name = bmInfo?.name || bm.title;

    for (const o of market.outcomes) {
      if (o.name === homeTeam && o.price > bestHome.odds) bestHome = { odds: o.price, bm: name };
      else if (o.name === awayTeam && o.price > bestAway.odds) bestAway = { odds: o.price, bm: name };
      else if (o.name === 'Draw' && o.price > bestDraw.odds) bestDraw = { odds: o.price, bm: name };
    }
  }

  return { bestHome, bestDraw, bestAway };
}

async function handleTopOdds(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery('Loading odds...'); } catch (_) {}
  }
  const loadingMsg = await ctx.reply('💰 Fetching best available odds...');

  try {
    const events = await oddsApi.getWorldCupOdds();

    if (!events || events.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `💰 *No odds available yet*\n\nBookmakers haven't opened lines for upcoming matches\\. Check back closer to matchday\\.`,
        { parse_mode: 'MarkdownV2', ...getBackMenu() }
      );
    }

    // Prioritise today's and tomorrow's matches
    const todayData = await footballApi.getTodayMatches().catch(() => null);
    const todayNames = new Set(
      (todayData?.matches || []).map(m => m.homeTeam?.name?.toLowerCase()).filter(Boolean)
    );

    const sorted = [...events].sort((a, b) => {
      const aToday = todayNames.has(a.home_team?.toLowerCase()) ? 1 : 0;
      const bToday = todayNames.has(b.home_team?.toLowerCase()) ? 1 : 0;
      return bToday - aToday;
    });

    const toShow = sorted.slice(0, 5);

    let msg = `💰 *WORLD CUP ODDS COMPARISON*\n`;
    msg += `🇰🇪 _Best odds available in Kenya_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const event of toShow) {
      const home = event.home_team;
      const away = event.away_team;
      const matchDate = event.commence_time ? formatMatchDate(event.commence_time) : '';
      const matchTime = event.commence_time ? formatMatchTime(event.commence_time) : 'TBD';
      const isLive = todayNames.has(home.toLowerCase());

      const { bestHome, bestDraw, bestAway } = getBestOddsPerOutcome(event);

      // Get Betway and 1xBet odds specifically (available in KE)
      const betwayOdds = getBookmakerOdds(event, 'betway');
      const xbetOdds = getBookmakerOdds(event, '1xbet');
      const bet365Odds = getBookmakerOdds(event, 'bet365');

      msg += `${isLive ? '📅 *TODAY* \\| ' : ''}⚽ *${escMd(home)}* vs *${escMd(away)}*\n`;
      msg += `🕐 ${escMd(matchDate)} ${escMd(matchTime)} EAT\n`;
      msg += `─────────────────────\n`;

      // Best available odds table
      if (bestHome.odds > 0) {
        msg += `1️⃣ *${escMd(home)} Win*\n`;
        msg += `   Best: \`${bestHome.odds.toFixed(2)}\` @ ${escMd(bestHome.bm)}\n`;
        if (betwayOdds) msg += `   🇰🇪 Betway: \`${escMd(betwayOdds.home)}\`\n`;
        if (xbetOdds) msg += `   🇰🇪 1xBet KE: \`${escMd(xbetOdds.home)}\`\n`;
        if (bet365Odds) msg += `   🌍 Bet365: \`${escMd(bet365Odds.home)}\`\n`;
      }

      if (bestDraw.odds > 0) {
        msg += `➗ *Draw*\n`;
        msg += `   Best: \`${bestDraw.odds.toFixed(2)}\` @ ${escMd(bestDraw.bm)}\n`;
        if (betwayOdds) msg += `   🇰🇪 Betway: \`${escMd(betwayOdds.draw)}\`\n`;
        if (xbetOdds) msg += `   🇰🇪 1xBet KE: \`${escMd(xbetOdds.draw)}\`\n`;
        if (bet365Odds) msg += `   🌍 Bet365: \`${escMd(bet365Odds.draw)}\`\n`;
      }

      if (bestAway.odds > 0) {
        msg += `2️⃣ *${escMd(away)} Win*\n`;
        msg += `   Best: \`${bestAway.odds.toFixed(2)}\` @ ${escMd(bestAway.bm)}\n`;
        if (betwayOdds) msg += `   🇰🇪 Betway: \`${escMd(betwayOdds.away)}\`\n`;
        if (xbetOdds) msg += `   🇰🇪 1xBet KE: \`${escMd(xbetOdds.away)}\`\n`;
        if (bet365Odds) msg += `   🌍 Bet365: \`${escMd(bet365Odds.away)}\`\n`;
      }

      // Value recommendation
      const vals = [
        { label: home, odds: bestHome.odds, type: 'Home Win' },
        { label: 'Draw', odds: bestDraw.odds, type: 'Draw' },
        { label: away, odds: bestAway.odds, type: 'Away Win' }
      ].filter(v => v.odds > 0).sort((a, b) => b.odds - a.odds);

      if (vals.length > 0) {
        const best = vals[0];
        msg += `\n💡 *Best Value:* ${escMd(best.label)} \\(${escMd(best.type)}\\) @ \`${best.odds.toFixed(2)}\`\n`;
      }

      msg += `\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📌 *About Kenyan Bookmakers:*\n`;
    msg += `🇰🇪 *Betika & SportPesa* — Kenya\\-only sites not in global APIs\\.\n`;
    msg += `   Their odds are typically 5\\-10% lower than Betway/1xBet\\.\n`;
    msg += `🇰🇪 *Betway KE & 1xBet KE* — Available above, accept M\\-Pesa\\.  \n`;
    msg += `🇰🇪 *Pepeta & Sportybet* — Check manually; odds similar to Betway\\.\n\n`;
    msg += `⚠️ _Always bet responsibly within your means_`;

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Odds error:', err.message);
    await ctx.reply('⚠️ Could not load odds right now. Try again shortly.', getBackMenu());
  }
}

module.exports = { handleTopOdds };
