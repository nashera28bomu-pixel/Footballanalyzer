const footballApi = require('../services/footballApi');
const { formatMatchTime, formatMatchDate, statusLabel, isToday, isTomorrow, isYesterday } = require('../utils/time');
const { getBackMenu } = require('../utils/menu');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function handleTodayFixtures(ctx) {
  await ctx.answerCbQuery('Loading fixtures...');
  const loadingMsg = await ctx.reply('📅 Fetching today\'s fixtures...');

  try {
    const data = await footballApi.getTodayMatches();
    const matches = data.matches || [];

    const todayMatches = matches.filter(m => isToday(m.utcDate) || m.status === 'IN_PLAY' || m.status === 'PAUSED');

    if (todayMatches.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `📅 *No World Cup matches today in EAT*\n\nCheck upcoming fixtures for the next games\\! 👇`,
        { parse_mode: 'MarkdownV2', ...getBackMenu() }
      );
    }

    let msg = `📅 *TODAY'S WORLD CUP FIXTURES*\n`;
    msg += `🕐 _All times in East African Time \\(EAT\\)_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const m of todayMatches) {
      const status = statusLabel(m.status);
      const time = formatMatchTime(m.utcDate);
      const home = escMd(m.homeTeam.name);
      const away = escMd(m.awayTeam.name);
      const stage = escMd(m.stage?.replace(/_/g, ' ') || '');

      let scoreStr = '';
      if (m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'FINISHED') {
        const hg = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? '?';
        const ag = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? '?';
        scoreStr = `  *${hg} \\- ${ag}*`;
      }

      const minute = m.minute ? ` \\(${m.minute}'\\)` : '';

      msg += `🏟️ _${stage}_\n`;
      msg += `${status}${minute}\n`;
      msg += `🏴 ${home}${scoreStr ? scoreStr : ''}\n`;
      msg += `🏴 ${away}\n`;

      if (!scoreStr) {
        msg += `⏰ *${escMd(time)}*\n`;
      }
      msg += `\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔔 Subscribe to get live goal alerts\\!\n`;
    msg += `Use /notify to manage your alerts\\.`;

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Fixtures error:', err.message);
    await ctx.reply('⚠️ Could not load fixtures. Please try again in a moment.', getBackMenu());
  }
}

async function handleResults(ctx) {
  await ctx.answerCbQuery('Loading results...');
  const loadingMsg = await ctx.reply('📋 Fetching latest results...');

  try {
    const data = await footballApi.getYesterdayMatches();
    const matches = (data.matches || []).filter(m => m.status === 'FINISHED');

    const todayData = await footballApi.getTodayMatches();
    const todayFinished = (todayData.matches || []).filter(m =>
      m.status === 'FINISHED' && isToday(m.utcDate)
    );

    const allFinished = [...todayFinished, ...matches.filter(m => isYesterday(m.utcDate))];

    if (allFinished.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply('📋 No recent results found yet.', getBackMenu());
    }

    let msg = `📋 *RECENT RESULTS*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const m of allFinished) {
      const home = escMd(m.homeTeam.name);
      const away = escMd(m.awayTeam.name);
      const hg = m.score?.fullTime?.home ?? '?';
      const ag = m.score?.fullTime?.away ?? '?';
      const date = formatMatchDate(m.utcDate);
      const stage = escMd(m.stage?.replace(/_/g, ' ') || '');

      const winner = m.score?.winner;
      const homeStr = winner === 'HOME_TEAM' ? `🏆 *${home}*` : home;
      const awayStr = winner === 'AWAY_TEAM' ? `🏆 *${away}*` : away;

      msg += `✅ *FT* \\| _${stage}_\n`;
      msg += `${homeStr} *${hg}*\\-*${ag}* ${awayStr}\n`;
      msg += `📅 ${escMd(date)}\n\n`;
    }

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Results error:', err.message);
    await ctx.reply('⚠️ Could not load results. Try again shortly.', getBackMenu());
  }
}

async function handleUpcoming(ctx) {
  await ctx.answerCbQuery('Loading schedule...');
  const loadingMsg = await ctx.reply('📆 Loading upcoming fixtures...');

  try {
    const data = await footballApi.getUpcomingMatches(7);
    const matches = (data.matches || []).filter(m =>
      m.status === 'SCHEDULED' || m.status === 'TIMED'
    ).slice(0, 15);

    if (matches.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply('📆 No upcoming fixtures found.', getBackMenu());
    }

    let msg = `📆 *UPCOMING WORLD CUP FIXTURES*\n`;
    msg += `🕐 _All times in East African Time \\(EAT\\)_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    let currentDate = '';
    for (const m of matches) {
      const matchDate = formatMatchDate(m.utcDate);
      const time = formatMatchTime(m.utcDate);
      const home = escMd(m.homeTeam.name);
      const away = escMd(m.awayTeam.name);
      const stage = escMd(m.stage?.replace(/_/g, ' ') || '');

      if (matchDate !== currentDate) {
        if (currentDate) msg += '\n';
        msg += `📅 *${escMd(matchDate)}*\n`;
        msg += `─────────────────────\n`;
        currentDate = matchDate;
      }

      const dayLabel = isTomorrow(m.utcDate) ? ' ⬅️ TOMORROW' : '';

      msg += `⏰ ${escMd(time)}${escMd(dayLabel)}\n`;
      msg += `${home} 🆚 ${away}\n`;
      msg += `_${stage}_\n\n`;
    }

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Upcoming error:', err.message);
    await ctx.reply('⚠️ Could not load schedule.', getBackMenu());
  }
}

module.exports = { handleTodayFixtures, handleResults, handleUpcoming };
