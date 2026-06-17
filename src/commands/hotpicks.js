const oddsApi = require('../services/oddsApi');
const groqAi = require('../services/groqAi');
const { formatFullDateTime } = require('../utils/time');
const { getBackMenu } = require('../utils/menu');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

let hotPicksCache = null;
let hotPicksCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

async function handleHotPicks(ctx) {
  await ctx.answerCbQuery('Loading hot picks...');
  const loadingMsg = await ctx.reply('🔥 Generating today\'s hot picks...');

  try {
    // Check cache
    if (hotPicksCache && Date.now() - hotPicksCacheTime < CACHE_TTL) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(hotPicksCache, { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }

    const picks = await oddsApi.getHotPicks();

    if (!picks || picks.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `🔥 *No hot picks available right now*\n\nOdds data will be available closer to match time\\.`,
        { parse_mode: 'MarkdownV2', ...getBackMenu() }
      );
    }

    // Get AI reasoning for these picks
    const aiReasoning = await groqAi.generateHotPicks(picks).catch(() => null);

    let msg = `🔥 *CYMOR HOT PICKS — TODAY*\n`;
    msg += `💡 _3 confident bets selected by AI analysis_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const medals = ['🥇', '🥈', '🥉'];

    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      const medal = medals[i] || '🏅';
      const matchTime = p.commenceTime ? formatFullDateTime(p.commenceTime) : 'TBD';

      msg += `${medal} *PICK ${i + 1}*\n`;
      msg += `⚽ ${escMd(p.home)} vs ${escMd(p.away)}\n`;
      msg += `📅 ${escMd(matchTime)}\n`;
      msg += `✅ *Pick:* ${escMd(p.pick)}\n`;
      msg += `💰 *Odds:* \`${escMd(p.odds)}\` \\(${escMd(String(p.bookmakerCount))} bookmakers\\)\n`;
      msg += `📊 *Outcome:* ${escMd(p.outcome.replace('_', ' ').toUpperCase())}\n\n`;
    }

    if (aiReasoning) {
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `🧠 *WHY THESE PICKS?*\n\n`;
      msg += escMd(aiReasoning);
      msg += `\n\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ _Bet responsibly\\. Odds change frequently\\._\n`;
    msg += `🔄 _Picks refresh every 30 minutes_`;

    hotPicksCache = msg;
    hotPicksCacheTime = Date.now();

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Hot picks error:', err.message);
    await ctx.reply('⚠️ Could not load hot picks right now. Try again soon.', getBackMenu());
  }
}

module.exports = { handleHotPicks };
