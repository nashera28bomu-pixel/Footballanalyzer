const footballApi = require('../services/footballApi');
const oddsApi = require('../services/oddsApi');
const { askAI } = require('../services/groqAi');
const { formatMatchTime, isToday } = require('../utils/time');
const { getBackMenu } = require('../utils/menu');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

let hotPicksCache = null;
let hotPicksCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000;

async function handleHotPicks(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery('Loading hot picks...'); } catch (_) {}
  }
  const loadingMsg = await ctx.reply('🔥 Building today\'s hot picks...');

  try {
    // Serve cache
    if (hotPicksCache && Date.now() - hotPicksCacheTime < CACHE_TTL) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(hotPicksCache, { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }

    // Strictly today's matches only
    const todayData = await footballApi.getTodayMatches();
    const todayMatches = (todayData.matches || []).filter(m =>
      isToday(m.utcDate) &&
      ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED'].includes(m.status)
    );

    if (todayMatches.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `🔥 *No World Cup matches today*\n\nNo picks available\\. Check /upcoming for next matchday\\.`,
        { parse_mode: 'MarkdownV2', ...getBackMenu() }
      );
    }

    // Fetch all WC odds once
    const allOdds = await oddsApi.getWorldCupOdds().catch(() => []);

    const picks = [];

    for (const match of todayMatches) {
      const homeTeam = match.homeTeam?.name;
      const awayTeam = match.awayTeam?.name;
      if (!homeTeam || !awayTeam) continue;

      // Match odds to fixture
      const event = (allOdds || []).find(e => {
        const h = (e.home_team || '').toLowerCase();
        const a = (e.away_team || '').toLowerCase();
        const ht = homeTeam.toLowerCase();
        const at = awayTeam.toLowerCase();
        // Match on first word of each team name (handles "Republic of Korea" vs "Korea")
        return (h.includes(ht.split(' ')[0]) || ht.split(' ')[0].includes(h.split(' ')[0])) &&
               (a.includes(at.split(' ')[0]) || at.split(' ')[0].includes(a.split(' ')[0]));
      });

      const formatted = event ? oddsApi.formatOdds(event) : null;

      let pick, odds, outcome, confidence;

      if (formatted) {
        const h = parseFloat(formatted.home.odds);
        const d = parseFloat(formatted.draw.odds);
        const a = parseFloat(formatted.away.odds);

        // Pick lowest odds = most likely outcome
        if (h <= a && h <= d) {
          pick = homeTeam; odds = formatted.home.odds; outcome = 'Home Win';
          // Confidence inversely proportional to odds
          confidence = Math.min(92, Math.round((1 / h) * 100 * 1.1));
        } else if (a < h && a <= d) {
          pick = awayTeam; odds = formatted.away.odds; outcome = 'Away Win';
          confidence = Math.min(92, Math.round((1 / a) * 100 * 1.1));
        } else {
          pick = 'Draw'; odds = formatted.draw.odds; outcome = 'Draw';
          confidence = Math.min(85, Math.round((1 / d) * 100 * 1.1));
        }
      } else {
        // No odds — skip this match for hot picks
        continue;
      }

      picks.push({
        home: homeTeam,
        away: awayTeam,
        pick,
        odds,
        outcome,
        confidence,
        kickoff: match.utcDate,
        status: match.status
      });
    }

    // Sort by confidence descending, take top 3
    picks.sort((a, b) => b.confidence - a.confidence);
    const top3 = picks.slice(0, 3);

    if (top3.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `🔥 *Odds not yet available for today's matches*\n\nBookmakers haven't opened lines yet\\. Check back closer to kickoff\\.`,
        { parse_mode: 'MarkdownV2', ...getBackMenu() }
      );
    }

    const medals = ['🥇', '🥈', '🥉'];
    let msg = `🔥 *CYMOR HOT PICKS — TODAY*\n`;
    msg += `💡 _Top ${top3.length} confident picks from today's World Cup matches_\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (let i = 0; i < top3.length; i++) {
      const p = top3[i];
      const time = formatMatchTime(p.kickoff);
      const liveTag = p.status === 'IN_PLAY' ? ' 🔴 LIVE' : p.status === 'PAUSED' ? ' ⏸ HT' : '';
      const confBar = buildConfBar(p.confidence);

      msg += `${medals[i]} *PICK ${i + 1}*${escMd(liveTag)}\n`;
      msg += `⚽ *${escMd(p.home)}* vs *${escMd(p.away)}*\n`;
      msg += `⏰ ${escMd(time)} EAT\n`;
      msg += `✅ *Pick:* ${escMd(p.pick)} \\(${escMd(p.outcome)}\\)\n`;
      msg += `💰 *Odds:* \`${escMd(String(p.odds))}\`\n`;
      msg += `📊 *Confidence:* ${confBar} *${p.confidence}%*\n\n`;

      // AI reasoning — one focused call per pick
      try {
        const reason = await askAI(
          `World Cup 2026 match: ${p.home} vs ${p.away}. I am recommending ${p.pick} (${p.outcome}) at odds ${p.odds} with ${p.confidence}% confidence.

Write exactly 2 bullet points (starting with •) explaining why this is the right pick. 
Each bullet must be specific — reference team quality, recent WC form, or tactical reasons.
Maximum 20 words per bullet. Plain text only, no asterisks or markdown.`,
          `You are CymorBot, a sharp World Cup 2026 analyst for East African football fans. Be direct and specific.`
        );
        // Clean any markdown that leaked through
        const cleanReason = reason.replace(/\*+/g, '').replace(/_+/g, '').trim();
        msg += `🧠 *Why ${escMd(p.pick)}?*\n${escMd(cleanReason)}\n\n`;
      } catch (_) {
        msg += `🧠 _${escMd(p.pick)} are strong favourites based on current odds and tournament form\\._\n\n`;
      }

      if (i < top3.length - 1) msg += `─────────────────────\n\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ _Bet responsibly\\. This is not financial advice\\._\n`;
    msg += `🔄 _Picks refresh every 30 minutes_`;

    hotPicksCache = msg;
    hotPicksCacheTime = Date.now();

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Hot picks error:', err.message);
    await ctx.reply('⚠️ Could not load hot picks right now. Try again in a moment.', getBackMenu());
  }
}

// Visual confidence bar: ████░░░ 72%
function buildConfBar(pct) {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return escMd('█'.repeat(filled) + '░'.repeat(empty));
}

module.exports = { handleHotPicks };
