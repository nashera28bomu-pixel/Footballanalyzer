require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');

// Models
const User = require('./models/User');

// Services
const { initCron } = require('./services/cron');
const {
  getOrCreateReferral,
  processReferral,
  getReferralMessage,
  canAccess,
  getLockedMessage,
  TIERS
} = require('./services/referral');

// Commands
const { handleTodayFixtures, handleResults, handleUpcoming } = require('./commands/fixtures');
const { handleLiveScores } = require('./commands/live');
const { handleStandings, handleGroupStanding } = require('./commands/standings');
const { handlePredictionsMenu, handlePredictMatch } = require('./commands/predictions');
const { handleHotPicks } = require('./commands/hotpicks');
const { handleTopOdds } = require('./commands/odds');
const { handleH2HMenu, handleH2H } = require('./commands/h2h');
const { handleTeamMenu, handleTeamSearch } = require('./commands/team');
const { handleMyAlerts, handleToggleSub, handleToggleGoals, handleToggleKickoff } = require('./commands/notify');
const {
  isAdmin, pendingBroadcast,
  handleAdminPanel, handleAdminBroadcastPrompt, handleAdminBroadcastMessage,
  handleConfirmBroadcast, handleAdminStats
} = require('./commands/admin');

// Utils
const {
  getWelcomeMessage, getReturnMessage, getMainMenu, getBackMenu, getAboutMessage
} = require('./utils/menu');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ── BOT INIT ─────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// ── DATABASE ─────────────────────────────────────────────
async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected');
}

// ── UPSERT USER ──────────────────────────────────────────
async function upsertUser(from) {
  const user = await User.findOneAndUpdate(
    { telegramId: from.id },
    {
      $set: {
        username: from.username || '',
        firstName: from.first_name || '',
        lastName: from.last_name || '',
        lastSeen: new Date()
      },
      $setOnInsert: {
        isSubscribed: true,
        notifyGoals: true,
        notifyKickoff: true,
        isFirstVisit: true,
        joinedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
  return user;
}

// ── /start ────────────────────────────────────────────────
bot.start(async (ctx) => {
  const from = ctx.from;
  const user = await upsertUser(from);

  // Handle referral link: /start ref_CYMOR123
  const startPayload = ctx.startPayload;
  let referralResult = null;

  if (startPayload && startPayload.startsWith('ref_')) {
    const refCode = startPayload.replace('ref_', '');
    referralResult = await processReferral(from.id, refCode).catch(() => null);
  }

  // Ensure referral doc exists
  const refDoc = await getOrCreateReferral(from.id);

  // Check if first visit
  const isFirst = user.isFirstVisit;
  if (isFirst) {
    await User.findOneAndUpdate({ telegramId: from.id }, { isFirstVisit: false });
  }

  const message = isFirst
    ? getWelcomeMessage(from.first_name)
    : getReturnMessage(from.first_name);

  await ctx.reply(message, { parse_mode: 'MarkdownV2', ...getMainMenu() });

  // If referred, notify referrer about tier upgrade
  if (referralResult?.tierUpgraded) {
    const newTier = TIERS[referralResult.newTier];
    try {
      await ctx.telegram.sendMessage(
        referralResult.referrerId,
        `🎉 *Someone joined using your referral link\\!*\n\n` +
        `${newTier.emoji} You've unlocked *${escMd(newTier.name)} Tier\\!*\n` +
        `${escMd(newTier.unlockMsg || '')}\n\n` +
        `Total Referrals: *${referralResult.referralCount}*`,
        { parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  }
});

// ── /menu ─────────────────────────────────────────────────
bot.command('menu', async (ctx) => {
  await upsertUser(ctx.from);
  await ctx.reply('🏠 *Main Menu*', { parse_mode: 'MarkdownV2', ...getMainMenu() });
});

// ── /referral ─────────────────────────────────────────────
bot.command('referral', async (ctx) => {
  await upsertUser(ctx.from);
  const refDoc = await getOrCreateReferral(ctx.from.id);
  const botInfo = await bot.telegram.getMe();
  const { msg } = getReferralMessage(refDoc, botInfo.username);
  await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
});

// ── /notify ───────────────────────────────────────────────
bot.command('notify', async (ctx) => {
  await upsertUser(ctx.from);
  await handleMyAlerts({ ...ctx, answerCbQuery: async () => {} });
});

// ── /team [name] ──────────────────────────────────────────
bot.command('team', async (ctx) => {
  await upsertUser(ctx.from);
  const args = ctx.message.text.split(' ').slice(1).join(' ');
  if (!args) return ctx.reply('Usage: /team Brazil', getBackMenu());

  if (!await canAccess(ctx.from.id, 'team')) {
    return ctx.reply(getLockedMessage('team'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }

  await handleTeamSearch(ctx, args);
});

// ── /broadcast (admin) ───────────────────────────────────
bot.command('broadcast', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
  await handleAdminPanel(ctx);
});

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
  await handleAdminPanel(ctx);
});

bot.command('cancelbroadcast', async (ctx) => {
  pendingBroadcast.delete(ctx.from.id);
  await ctx.reply('❌ Broadcast cancelled.');
});

// ── CALLBACK QUERY ROUTER ────────────────────────────────
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  await upsertUser(ctx.from);

  // ── Navigation ──
  if (data === 'main_menu') {
    await ctx.answerCbQuery();
    await ctx.reply('🏠 *Main Menu*', { parse_mode: 'MarkdownV2', ...getMainMenu() });
    return;
  }

  if (data === 'about') {
    await ctx.answerCbQuery();
    await ctx.reply(getAboutMessage(), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    return;
  }

  // ── Fixtures ──
  if (data === 'fixtures_today') return handleTodayFixtures(ctx);
  if (data === 'results') return handleResults(ctx);
  if (data === 'upcoming') return handleUpcoming(ctx);

  // ── Live ──
  if (data === 'live_scores') return handleLiveScores(ctx);

  // ── Standings ──
  if (data === 'standings') return handleStandings(ctx);
  if (data.startsWith('group_')) {
    return handleGroupStanding(ctx, data.replace('group_', ''));
  }

  // ── Locked features check ──
  if (data === 'predictions_menu') {
    if (!await canAccess(userId, 'predictions')) {
      await ctx.answerCbQuery('🔒 Feature locked!');
      return ctx.reply(getLockedMessage('predictions'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handlePredictionsMenu(ctx);
  }

  if (data.startsWith('predict_')) {
    if (!await canAccess(userId, 'predictions')) {
      await ctx.answerCbQuery('🔒 Feature locked!');
      return ctx.reply(getLockedMessage('predictions'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handlePredictMatch(ctx, data.replace('predict_', ''));
  }

  if (data === 'hot_picks') {
    if (!await canAccess(userId, 'hotpicks')) {
      await ctx.answerCbQuery('🔒 Feature locked!');
      return ctx.reply(getLockedMessage('hotpicks'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleHotPicks(ctx);
  }

  if (data === 'top_odds') {
    if (!await canAccess(userId, 'odds')) {
      await ctx.answerCbQuery('🔒 Feature locked!');
      return ctx.reply(getLockedMessage('odds'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleTopOdds(ctx);
  }

  if (data === 'h2h_menu') {
    if (!await canAccess(userId, 'h2h')) {
      await ctx.answerCbQuery('🔒 Feature locked!');
      return ctx.reply(getLockedMessage('h2h'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleH2HMenu(ctx);
  }

  if (data.startsWith('h2h_')) {
    if (!await canAccess(userId, 'h2h')) {
      await ctx.answerCbQuery('🔒 Feature locked!');
      return ctx.reply(getLockedMessage('h2h'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleH2H(ctx, data.replace('h2h_', ''));
  }

  if (data === 'team_menu') {
    if (!await canAccess(userId, 'team')) {
      await ctx.answerCbQuery('🔒 Feature locked!');
      return ctx.reply(getLockedMessage('team'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleTeamMenu(ctx);
  }

  if (data.startsWith('team_search_')) {
    if (!await canAccess(userId, 'team')) {
      await ctx.answerCbQuery('🔒 Feature locked!');
      return ctx.reply(getLockedMessage('team'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleTeamSearch(ctx, data.replace('team_search_', ''));
  }

  // ── Alerts ──
  if (data === 'my_alerts') return handleMyAlerts(ctx);
  if (data === 'toggle_sub') return handleToggleSub(ctx);
  if (data === 'toggle_goals') return handleToggleGoals(ctx);
  if (data === 'toggle_kickoff') return handleToggleKickoff(ctx);

  // ── Referral ──
  if (data === 'referral') {
    await ctx.answerCbQuery();
    const refDoc = await getOrCreateReferral(userId);
    const botInfo = await bot.telegram.getMe();
    const { msg } = getReferralMessage(refDoc, botInfo.username);
    return ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }

  // ── Admin ──
  if (data === 'admin_broadcast') return handleAdminBroadcastPrompt(ctx);
  if (data === 'admin_stats') return handleAdminStats(ctx);
  if (data === 'admin_panel') return handleAdminPanel(ctx);
  if (data.startsWith('confirm_broadcast_')) return handleConfirmBroadcast(ctx);

  // Fallback
  await ctx.answerCbQuery('Processing...');
});

// ── TEXT MESSAGE HANDLER (admin broadcast) ───────────────
bot.on('text', async (ctx) => {
  await upsertUser(ctx.from);

  // Check if admin is in broadcast mode
  if (isAdmin(ctx) && pendingBroadcast.get(ctx.from.id) === true) {
    const handled = await handleAdminBroadcastMessage(ctx);
    if (handled) return;
  }

  // Default: show menu
  if (ctx.message.text === '/start') return; // handled above
  await ctx.reply('Use the menu to navigate 👇', getMainMenu());
});

// ── ERROR HANDLER ────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error('Bot error:', err.message);
  try {
    ctx.reply('⚠️ Something went wrong. Please try again.', getBackMenu());
  } catch (_) {}
});

// ── SERVER ───────────────────────────────────────────────
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('🏆 Cymor World Cup Bot is running!'));
app.get('/health', (req, res) => res.json({ status: 'ok', bot: 'Cymor WC Bot 2026' }));

// ── LAUNCH ───────────────────────────────────────────────
async function launch() {
  await connectDB();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

  initCron(bot);

  await bot.launch();
  console.log('🚀 Cymor World Cup Bot is LIVE!');
}

launch().catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
