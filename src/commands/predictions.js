const footballApi = require('../services/footballApi');
const oddsApi = require('../services/oddsApi');
const { predictMatch, buildH2HSummary } = require('../services/groqAi');
const { formatMatchTime, formatMatchDate, isTomorrow } = require('../utils/time');
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
        ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED'].includes(m.status)
      ),
      ...(upcomingData.matches || []).filter(m => isTomorrow(m.utcDate))
    ].slice(0, 10);

    if (allMatches.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply('🔮 No upcoming matches to predict right now. Check /upcoming for the next games.', getBackMenu());
    }

    const buttons = allMatches.map(m => {
      const home = m.homeTeam?.shortName || m.homeTeam?.name || '?';
      const away = m.awayTeam?.shortName || m.awayTeam?.name || '?';
      const time = formatMatchTime(m.utcDate);
      const liveTag = m.status === 'IN_PLAY' ? '🔴 ' : '';
      return [Markup.button.callback(`${liveTag}⚽ ${home} vs ${away} (${time})`, `predict_${m.id}`)];
    });
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(
      `🔮 *SELECT A MATCH TO PREDICT*\n\n_Tap a match below\\. AI analyses form, H2H, standings \\& draw probability:_`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) }
    );

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Predictions menu error:', err.message);
    await ctx.reply('⚠️ Could not load matches. Try /fixtures first.', getBackMenu());
  }
}

async function handlePredictMatch(ctx, matchId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery('Analysing...'); } catch (_) {}
  }

  // Serve from cache if fresh (20 min)
  const cacheKey = `pred_${matchId}`;
  const cached = predCache.get(cacheKey);
  if (cached && Date.now() - cached.time < 20 * 60 * 1000) {
    return ctx.reply(cached.msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }

  const loadingMsg = await ctx.reply('🧠 Analysing match data... This may take 10-15 seconds...');

  try {
    // Fetch all data in parallel — each has its own error boundary
    const [matchData, h2hData, standingsData, oddsEvent] = await Promise.all([
      footballApi.getMatch(matchId),
      footballApi.getH2H(matchId).catch(() => null),
      footballApi.getStandings().catch(() => null),
      null // placeholder, we get odds after we know team names
    ]);

    if (!matchData?.homeTeam) throw new Error('Match data unavailable');

    const homeTeam = matchData.homeTeam.name;
    const awayTeam = matchData.awayTeam.name;
    const matchTime = formatMatchTime(matchData.utcDate);
    const matchDate = formatMatchDate(matchData.utcDate);
    const stage = (matchData.stage || 'GROUP_STAGE').replace(/_/g, ' ');

    // Get odds separately now we have team names
    const oddsMatch = await oddsApi.getMatchOdds(homeTeam, awayTeam).catch(() => null);
    const formattedOdds = oddsMatch ? oddsApi.formatOdds(oddsMatch) : null;
    const homeOdds = formattedOdds?.home?.odds || null;
    const awayOdds = formattedOdds?.away?.odds || null;
    const drawOdds = formattedOdds?.draw?.odds || null;

    // Build group standings context
    let standingsCtx = null;
    if (standingsData?.standings) {
      const groups = (standingsData.standings || []).filter(s => s.type === 'TOTAL');
      for (const group of groups) {
        const hasHome = group.table?.some(r => r.team?.name === homeTeam);
        const hasAway = group.table?.some(r => r.team?.name === awayTeam);
        if (hasHome && hasAway) {
          const groupName = (group.group || '').replace('GROUP_', 'Group ');
          standingsCtx = `${groupName}:\n` + group.table.map(r =>
            `${r.position}. ${r.team?.name} — P${r.playedGames} W${r.won} D${r.draw} L${r.lost} GD${r.goalDifference >= 0 ? '+' : ''}${r.goalDifference} Pts:${r.points}`
          ).join('\n');
          break;
        }
      }
    }

    // H2H quick stats
    let h2hLine = null;
    if (h2hData?.matches?.length > 0) {
      const recentH2H = h2hData.matches.slice(0, 8);
      let hW = 0, aW = 0, dr = 0;
      for (const m of recentH2H) {
        const w = m.score?.winner;
        if (w === 'DRAW') dr++;
        else if (
          (w === 'HOME_TEAM' && m.homeTeam?.name === homeTeam) ||
          (w === 'AWAY_TEAM' && m.awayTeam?.name === homeTeam)
        ) hW++;
        else aW++;
      }
      h2hLine = `${homeTeam} ${hW}W — ${dr}D — ${aW}W ${awayTeam} (last ${recentH2H.length} meetings)`;
    }

    // Run AI prediction
    const aiText = await predictMatch(homeTeam, awayTeam, homeOdds, awayOdds, drawOdds, h2hData, standingsCtx);

    // Build message
    let msg = `🔮 *MATCH PREDICTION*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `🏟️ _${escMd(stage)}_\n`;
    msg += `📅 ${escMd(matchDate)} \\| ⏰ ${escMd(matchTime)} EAT\n\n`;
    msg += `🆚 *${escMd(homeTeam)}* vs *${escMd(awayTeam)}*\n\n`;

    // Odds table
    if (formattedOdds) {
      const hProb = homeOdds ? Math.round((1 / parseFloat(homeOdds)) * 100) : '?';
      const dProb = drawOdds ? Math.round((1 / parseFloat(drawOdds)) * 100) : '?';
      const aProb = awayOdds ? Math.round((1 / parseFloat(awayOdds)) * 100) : '?';
      msg += `💰 *ODDS \\(${escMd(formattedOdds.bookmaker)}\\)*\n`;
      msg += `1️⃣ ${escMd(homeTeam)}: \`${escMd(homeOdds)}\` — ${hProb}% chance\n`;
      msg += `➗ Draw: \`${escMd(drawOdds)}\` — ${dProb}% chance\n`;
      msg += `2️⃣ ${escMd(awayTeam)}: \`${escMd(awayOdds)}\` — ${aProb}% chance\n\n`;
    } else {
      msg += `💰 _Odds not yet available for this match_\n\n`;
    }

    // H2H summary
    if (h2hLine) {
      msg += `⚔️ *H2H:* ${escMd(h2hLine)}\n\n`;
    }

    // AI Analysis
    msg += `🧠 *AI ANALYSIS*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += escMd(aiText);

    predCache.set(cacheKey, { msg, time: Date.now() });

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Predict match error:', err.message);
    await ctx.reply(
      `⚠️ Prediction failed\\. This usually means the AI is temporarily busy\\.\n\n_Please try again in 30 seconds\\._`,
      { parse_mode: 'MarkdownV2', ...getBackMenu() }
    );
  }
}

module.exports = { handlePredictionsMenu, handlePredictMatch };
