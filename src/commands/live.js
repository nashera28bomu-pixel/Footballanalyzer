const footballApi = require('../services/footballApi');
const { formatMatchTime, statusLabel } = require('../utils/time');
const { getBackMenu } = require('../utils/menu');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function handleLiveScores(ctx) {
  await ctx.answerCbQuery('Fetching live scores...');
  const loadingMsg = await ctx.reply('🟢 Checking for live matches...');

  try {
    const data = await footballApi.getLiveMatches();
    const matches = data.matches || [];

    if (matches.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `🟢 *NO LIVE MATCHES RIGHT NOW*\n\nNo World Cup matches in play at the moment\\.\n\nUse 📅 *Today's Fixtures* to see what's coming up\\.`,
        { parse_mode: 'MarkdownV2', ...getBackMenu() }
      );
    }

    let msg = `🟢 *LIVE WORLD CUP SCORES*\n`;
    msg += `🔄 _Updated in real\\-time \\| EAT Timezone_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const m of matches) {
      const home = escMd(m.homeTeam.name);
      const away = escMd(m.awayTeam.name);
      const hg = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0;
      const ag = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0;
      const minute = m.minute ? `${m.minute}'` : '';
      const stage = escMd(m.stage?.replace(/_/g, ' ') || 'Group Stage');

      msg += `🔴 *LIVE* ${minute ? `\\| ⏱ *${escMd(minute)}*` : ''}\n`;
      msg += `_${stage}_\n`;
      msg += `🏴 *${home}* \`${hg}\`\n`;
      msg += `🏴 *${away}* \`${ag}\`\n`;

      // Show recent goals if any
      const goals = (m.goals || []).slice(-3);
      if (goals.length > 0) {
        msg += `⚽ _Goals: `;
        msg += goals.map(g => `${escMd(g.scorer?.name || '?')} ${escMd(String(g.minute || ''))}'`).join(', ');
        msg += `_\n`;
      }

      msg += `\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔔 _Get goal alerts — use /notify_`;

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Live scores error:', err.message);
    await ctx.reply('⚠️ Could not fetch live scores. Try again shortly.', getBackMenu());
  }
}

module.exports = { handleLiveScores };
