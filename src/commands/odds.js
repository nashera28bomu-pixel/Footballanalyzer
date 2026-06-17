const oddsApi = require('../services/oddsApi');
const { formatMatchTime, formatMatchDate } = require('../utils/time');
const { getBackMenu } = require('../utils/menu');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function handleTopOdds(ctx) {
  await ctx.answerCbQuery('Loading odds...');
  const loadingMsg = await ctx.reply('💰 Fetching live odds...');

  try {
    const events = await oddsApi.getWorldCupOdds();

    if (!events || events.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `💰 *No odds available right now*\n\nOdds will appear when bookmakers open lines for upcoming matches\\.`,
        { parse_mode: 'MarkdownV2', ...getBackMenu() }
      );
    }

    let msg = `💰 *WORLD CUP 2026 LIVE ODDS*\n`;
    msg += `📊 _Match result \\(1X2\\) odds in decimal format_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const toShow = events.slice(0, 8);

    for (const event of toShow) {
      const formatted = oddsApi.formatOdds(event);
      if (!formatted) continue;

      const matchTime = event.commence_time ? formatMatchTime(event.commence_time) : 'TBD';
      const matchDate = event.commence_time ? formatMatchDate(event.commence_time) : '';

      msg += `⚽ *${escMd(formatted.home.team)}* vs *${escMd(formatted.away.team)}*\n`;
      msg += `📅 ${escMd(matchDate)} \\| ⏰ ${escMd(matchTime)}\n`;
      msg += `📖 _${escMd(formatted.bookmaker)}_\n`;

      // Visual odds bar
      const hOdds = parseFloat(formatted.home.odds);
      const dOdds = parseFloat(formatted.draw.odds);
      const aOdds = parseFloat(formatted.away.odds);

      const hProb = Math.round((1 / hOdds) * 100);
      const dProb = Math.round((1 / dOdds) * 100);
      const aProb = Math.round((1 / aOdds) * 100);

      msg += `\`1\` ${escMd(formatted.home.odds)} \\(${hProb}%\\) `;
      msg += `\`X\` ${escMd(formatted.draw.odds)} \\(${dProb}%\\) `;
      msg += `\`2\` ${escMd(formatted.away.odds)} \\(${aProb}%\\)\n\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔥 See *Hot Picks* for top value bets\n`;
    msg += `⚠️ _Always bet responsibly_`;

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Odds error:', err.message);
    await ctx.reply('⚠️ Odds data unavailable right now.', getBackMenu());
  }
}

module.exports = { handleTopOdds };
