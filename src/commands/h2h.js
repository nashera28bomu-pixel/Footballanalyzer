const footballApi = require('../services/footballApi');
const groqAi = require('../services/groqAi');
const { formatMatchDate } = require('../utils/time');
const { getBackMenu } = require('../utils/menu');
const { Markup } = require('telegraf');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function handleH2HMenu(ctx) {
  await ctx.answerCbQuery('Loading matches...');
  const loadingMsg = await ctx.reply('⚔️ Loading upcoming matches for H2H...');

  try {
    const todayData = await footballApi.getTodayMatches();
    const upcomingData = await footballApi.getUpcomingMatches(3);

    const matches = [
      ...(todayData.matches || []).filter(m =>
        m.status === 'SCHEDULED' || m.status === 'TIMED'
      ),
      ...(upcomingData.matches || [])
    ].slice(0, 10);

    if (matches.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply('⚔️ No upcoming matches found for H2H comparison.', getBackMenu());
    }

    const buttons = matches.map(m => {
      const label = `${m.homeTeam?.shortName || m.homeTeam?.name} vs ${m.awayTeam?.shortName || m.awayTeam?.name}`;
      return [Markup.button.callback(label, `h2h_${m.id}`)];
    });
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(
      `⚔️ *HEAD TO HEAD COMPARISON*\n\n_Select a match to see full H2H history:_`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) }
    );

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('H2H menu error:', err.message);
    await ctx.reply('⚠️ Could not load matches.', getBackMenu());
  }
}

async function handleH2H(ctx, matchId) {
  await ctx.answerCbQuery('Loading H2H data...');
  const loadingMsg = await ctx.reply('⚔️ Fetching head-to-head history...');

  try {
    const [matchData, h2hData] = await Promise.all([
      footballApi.getMatch(matchId),
      footballApi.getH2H(matchId)
    ]);

    const match = matchData;
    const homeTeam = match.homeTeam?.name || 'Home';
    const awayTeam = match.awayTeam?.name || 'Away';
    const h2hMatches = h2hData.matches || [];

    // Calculate stats
    let homeWins = 0, awayWins = 0, draws = 0;
    let homeGoals = 0, awayGoals = 0;

    for (const m of h2hMatches) {
      const isHome = m.homeTeam?.name === homeTeam;
      const hg = m.score?.fullTime?.home ?? 0;
      const ag = m.score?.fullTime?.away ?? 0;
      const winner = m.score?.winner;

      if (isHome) {
        homeGoals += hg; awayGoals += ag;
        if (winner === 'HOME_TEAM') homeWins++;
        else if (winner === 'AWAY_TEAM') awayWins++;
        else draws++;
      } else {
        homeGoals += ag; awayGoals += hg;
        if (winner === 'HOME_TEAM') awayWins++;
        else if (winner === 'AWAY_TEAM') homeWins++;
        else draws++;
      }
    }

    const total = h2hMatches.length;

    let msg = `⚔️ *HEAD TO HEAD*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `🔵 *${escMd(homeTeam)}*\n`;
    msg += `🔴 *${escMd(awayTeam)}*\n\n`;

    if (total === 0) {
      msg += `📋 _No previous meetings found between these teams\\._\n\n`;
    } else {
      msg += `📊 *OVERALL RECORD \\(${total} games\\)*\n`;
      msg += `🔵 ${escMd(homeTeam)}: *${homeWins}W* `;
      msg += `\\| Draws: *${draws}* `;
      msg += `\\| 🔴 ${escMd(awayTeam)}: *${awayWins}W*\n`;
      msg += `⚽ Goals: ${escMd(homeTeam)} *${homeGoals}* — *${awayGoals}* ${escMd(awayTeam)}\n\n`;

      // Win percentage bar
      if (total > 0) {
        const hPct = Math.round((homeWins / total) * 100);
        const aPct = Math.round((awayWins / total) * 100);
        const dPct = 100 - hPct - aPct;
        msg += `📈 Win Rate: 🔵${hPct}% \\| X${dPct}% \\| 🔴${aPct}%\n\n`;
      }

      msg += `📋 *RECENT MEETINGS*\n`;
      msg += `────────────────────\n`;

      for (const m of h2hMatches.slice(0, 5)) {
        const hTeam = m.homeTeam?.name || '?';
        const aTeam = m.awayTeam?.name || '?';
        const hg = m.score?.fullTime?.home ?? '?';
        const ag = m.score?.fullTime?.away ?? '?';
        const date = m.utcDate ? formatMatchDate(m.utcDate) : 'N/A';
        const comp = escMd(m.competition?.name || '');

        const winner = m.score?.winner;
        const hmWon = (winner === 'HOME_TEAM' && hTeam === homeTeam) ||
                      (winner === 'AWAY_TEAM' && aTeam === homeTeam);
        const awWon = (winner === 'HOME_TEAM' && hTeam === awayTeam) ||
                      (winner === 'AWAY_TEAM' && aTeam === awayTeam);

        const resultIcon = hmWon ? '🔵' : awWon ? '🔴' : '⚪';

        msg += `${resultIcon} ${escMd(hTeam)} *${hg}\\-${ag}* ${escMd(aTeam)}\n`;
        msg += `   _${escMd(date)} \\| ${comp}_\n`;
      }
    }

    // AI analysis
    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🧠 *AI H2H ANALYSIS*\n`;

    const aiAnalysis = await groqAi.analyzeH2H(homeTeam, awayTeam, h2hData).catch(() => null);
    if (aiAnalysis) {
      msg += escMd(aiAnalysis);
    } else {
      msg += `_Analysis unavailable right now\\._`;
    }

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('H2H error:', err.message);
    await ctx.reply('⚠️ Could not load H2H data.', getBackMenu());
  }
}

module.exports = { handleH2HMenu, handleH2H };
