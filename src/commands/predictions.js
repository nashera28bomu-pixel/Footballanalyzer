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

// Cache predictions to avoid hammering Groq
const predCache = new Map();

async function handlePredictionsMenu(ctx) {
  await ctx.answerCbQuery('Loading matches...');
  const loadingMsg = await ctx.reply('🔮 Loading upcoming matches for prediction...');

  try {
    // Get today + tomorrow matches
    const todayData = await footballApi.getTodayMatches();
    const upcomingData = await footballApi.getUpcomingMatches(2);

    const allMatches = [
      ...(todayData.matches || []).filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED' || m.status === 'IN_PLAY'),
      ...(upcomingData.matches || []).filter(m => isTomorrow(m.utcDate))
    ].slice(0, 10);

    if (allMatches.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply('🔮 No upcoming matches to predict right now.', getBackMenu());
    }

    const buttons = allMatches.map(m => {
      const label = `${m.homeTeam?.shortName || m.homeTeam?.name} vs ${m.awayTeam?.shortName || m.awayTeam?.name}`;
      return [Markup.button.callback(label, `predict_${m.id}`)];
    });
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(
      `🔮 *SELECT A MATCH TO PREDICT*\n\n_Choose a match and I'll give you my AI\\-powered analysis:_`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) }
    );

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Predictions menu error:', err.message);
    await ctx.reply('⚠️ Could not load matches.', getBackMenu());
  }
}

async function handlePredictMatch(ctx, matchId) {
  await ctx.answerCbQuery('Generating prediction...');

  const cacheKey = `pred_${matchId}`;
  if (predCache.has(cacheKey)) {
    const cached = predCache.get(cacheKey);
    if (Date.now() - cached.time < 30 * 60 * 1000) {
      return ctx.reply(cached.msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
  }

  const loadingMsg = await ctx.reply('🧠 Analyzing match data... Please wait...');

  try {
    const [matchData, h2hData] = await Promise.all([
      footballApi.getMatch(matchId),
      footballApi.getH2H(matchId).catch(() => null)
    ]);

    const match = matchData;
    if (!match || !match.homeTeam) throw new Error('Match data not found');

    const homeTeam = match.homeTeam.name;
    const awayTeam = match.awayTeam.name;

    // Get odds
    const oddsEvent = await oddsApi.getMatchOdds(homeTeam, awayTeam).catch(() => null);
    const formattedOdds = oddsEvent ? oddsApi.formatOdds(oddsEvent) : null;

    const homeOdds = formattedOdds?.home?.odds || 'N/A';
    const awayOdds = formattedOdds?.away?.odds || 'N/A';
    const drawOdds = formattedOdds?.draw?.odds || 'N/A';

    // Get AI prediction
    const prediction = await groqAi.predictMatch(homeTeam, awayTeam, homeOdds, awayOdds, drawOdds, h2hData);

    const matchTime = formatMatchTime(match.utcDate);
    const matchDate = formatMatchDate(match.utcDate);
    const stage = match.stage?.replace(/_/g, ' ') || 'Group Stage';

    let msg = `🔮 *MATCH PREDICTION*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `🏟️ _${escMd(stage)}_\n`;
    msg += `📅 ${escMd(matchDate)} \\| ⏰ ${escMd(matchTime)}\n\n`;
    msg += `🆚 *${escMd(homeTeam)}* vs *${escMd(awayTeam)}*\n\n`;

    if (formattedOdds) {
      msg += `💰 *ODDS \\(${escMd(formattedOdds.bookmaker)}\\)*\n`;
      msg += `• ${escMd(homeTeam)} Win: \`${escMd(homeOdds)}\`\n`;
      msg += `• Draw: \`${escMd(drawOdds)}\`\n`;
      msg += `• ${escMd(awayTeam)} Win: \`${escMd(awayOdds)}\`\n\n`;
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
