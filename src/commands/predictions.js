const footballApi = require('../services/footballApi');
const oddsApi = require('../services/oddsApi');
const groqAi = require('../services/groqAi');
const { formatMatchTime, formatMatchDate, isToday, isTomorrow } = require('../utils/time');
const { getBackMenu } = require('../utils/menu');
const { Markup } = require('telegraf');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

const predCache = new Map();

async function handlePredictionsMenu(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery('Loading matches...'); } catch (_) {}
  }
  const loadingMsg = await ctx.reply('🔮 Loading matches for prediction...');

  try {
    const todayData = await footballApi.getTodayMatches();
    const upcomingData = await footballApi.getUpcomingMatches(2);

    const allMatches = [
      ...(todayData.matches || []).filter(m =>
        m.status === 'SCHEDULED' || m.status === 'TIMED' || m.status === 'IN_PLAY'
      ),
      ...(upcomingData.matches || []).filter(m => isTomorrow(m.utcDate))
    ].slice(0, 10);

    if (allMatches.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply('🔮 No upcoming matches to predict right now.', getBackMenu());
    }

    const buttons = allMatches.map(m => {
      const home = m.homeTeam?.shortName || m.homeTeam?.name || '?';
      const away = m.awayTeam?.shortName || m.awayTeam?.name || '?';
      const time = formatMatchTime(m.utcDate);
      return [Markup.button.callback(`⚽ ${home} vs ${away} (${time})`, `predict_${m.id}`)];
    });
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(
      `🔮 *SELECT A MATCH TO PREDICT*\n\n_AI will analyse form, H2H, odds, standings \\& draw probability:_`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) }
    );

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Predictions menu error:', err.message);
    await ctx.reply('⚠️ Could not load matches.', getBackMenu());
  }
}

async function handlePredictMatch(ctx, matchId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery('Generating prediction...'); } catch (_) {}
  }

  const cacheKey = `pred_${matchId}`;
  if (predCache.has(cacheKey)) {
    const cached = predCache.get(cacheKey);
    if (Date.now() - cached.time < 20 * 60 * 1000) {
      return ctx.reply(cached.msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
  }

  const loadingMsg = await ctx.reply('🧠 Analysing form, H2H, odds & standings... Please wait...');

  try {
    // Fetch all data in parallel
    const [matchData, h2hData, standingsData] = await Promise.all([
      footballApi.getMatch(matchId),
      footballApi.getH2H(matchId).catch(() => null),
      footballApi.getStandings().catch(() => null)
    ]);

    if (!matchData || !matchData.homeTeam) throw new Error('Match data not found');

    const homeTeam = matchData.homeTeam.name;
    const awayTeam = matchData.awayTeam.name;
    const matchTime = formatMatchTime(matchData.utcDate);
    const matchDate = formatMatchDate(matchData.utcDate);
    const stage = matchData.stage?.replace(/_/g, ' ') || 'Group Stage';

    // Get odds
    const oddsEvent = await oddsApi.getMatchOdds(homeTeam, awayTeam).catch(() => null);
    const formattedOdds = oddsEvent ? oddsApi.formatOdds(oddsEvent) : null;
    const homeOdds = formattedOdds?.home?.odds || 'N/A';
    const awayOdds = formattedOdds?.away?.odds || 'N/A';
    const drawOdds = formattedOdds?.draw?.odds || 'N/A';

    // Build standings context for the group
    let standingsCtx = null;
    if (standingsData?.standings) {
      const groups = standingsData.standings.filter(s => s.type === 'TOTAL');
      for (const group of groups) {
        const hasHome = group.table?.some(r => r.team?.name === homeTeam);
        const hasAway = group.table?.some(r => r.team?.name === awayTeam);
        if (hasHome && hasAway) {
          const groupName = group.group?.replace('GROUP_', 'Group ') || 'Group';
          const rows = group.table.map(r =>
            `${r.position}. ${r.team?.name} - P${r.playedGames} W${r.won} D${r.draw} L${r.lost} Pts:${r.points}`
          ).join('\n');
          standingsCtx = `${groupName} Standings:\n${rows}`;
          break;
        }
      }
    }

    // Get AI prediction with full context
    const prediction = await groqAi.predictMatch(
      homeTeam, awayTeam, homeOdds, awayOdds, drawOdds, h2hData, standingsCtx
    );

    // Build message
    let msg = `🔮 *MATCH PREDICTION*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `🏟️ _${escMd(stage)}_\n`;
    msg += `📅 ${escMd(matchDate)} \\| ⏰ ${escMd(matchTime)} EAT\n\n`;
    msg += `🆚 *${escMd(homeTeam)}* vs *${escMd(awayTeam)}*\n\n`;

    if (formattedOdds) {
      const hProb = homeOdds !== 'N/A' ? Math.round((1 / parseFloat(homeOdds)) * 100) : '?';
      const dProb = drawOdds !== 'N/A' ? Math.round((1 / parseFloat(drawOdds)) * 100) : '?';
      const aProb = awayOdds !== 'N/A' ? Math.round((1 / parseFloat(awayOdds)) * 100) : '?';

      msg += `💰 *ODDS \\(${escMd(formattedOdds.bookmaker)}\\)*\n`;
      msg += `1️⃣ ${escMd(homeTeam)}: \`${escMd(homeOdds)}\` \\(${hProb}% implied\\)\n`;
      msg += `➗ Draw: \`${escMd(drawOdds)}\` \\(${dProb}% implied\\)\n`;
      msg += `2️⃣ ${escMd(awayTeam)}: \`${escMd(awayOdds)}\` \\(${aProb}% implied\\)\n\n`;
    }

    // Show H2H quick stats
    if (h2hData?.matches?.length > 0) {
      const matches = h2hData.matches.slice(0, 8);
      let hW = 0, aW = 0, dr = 0;
      for (const m of matches) {
        const w = m.score?.winner;
        if (w === 'DRAW') dr++;
        else if ((w === 'HOME_TEAM' && m.homeTeam?.name === homeTeam) ||
                 (w === 'AWAY_TEAM' && m.awayTeam?.name === homeTeam)) hW++;
        else aW++;
      }
      msg += `⚔️ *H2H \\(last ${matches.length}\\):* ${escMd(homeTeam)} ${hW}W \\| ${dr}D \\| ${aW}W ${escMd(awayTeam)}\n\n`;
    }

    msg += `🧠 *AI ANALYSIS*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += escMd(prediction);

    predCache.set(cacheKey, { msg, time: Date.now() });

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Predict match error:', err.message);
    await ctx.reply('⚠️ Could not generate prediction. Try again.', getBackMenu());
  }
}

module.exports = { handlePredictionsMenu, handlePredictMatch };
