require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');

// ── GLOBAL SAFETY NETS ───────────────────────────────────
// Network blips (ECONNRESET, socket hang up, timeouts) from outbound API
// calls must never crash the whole bot process. Log and keep running.
process.on('unhandledRejection', (reason) => {
  console.warn('Unhandled rejection (non-fatal):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (non-fatal):', err.message);
  // Do NOT process.exit() here — keep the bot and server alive
});

const User = require('./models/User');
const { initCron } = require('./services/cron');
const {
  getOrCreateReferral, processReferral, getReferralMessage,
  canAccess, getLockedMessage, TIERS
} = require('./services/referral');

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
  isAdmin, pendingBroadcast, pendingPromote,
  handleAdminPanel, handleAdminBroadcastPrompt, handleAdminBroadcastMessage,
  handleAdminPromotePrompt, handleAdminPromoteMessage,
  handleConfirmBroadcast, handleCancelBroadcast, handleAdminStats
} = require('./commands/admin');
const { getWelcomeMessage, getReturnMessage, getMainMenu, getBackMenu, getAboutMessage } = require('./utils/menu');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ── BOT ──────────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected');
}

async function upsertUser(from) {
  return User.findOneAndUpdate(
    { telegramId: from.id },
    {
      $set: { username: from.username || '', firstName: from.first_name || '', lastName: from.last_name || '', lastSeen: new Date() },
      $setOnInsert: { isSubscribed: true, notifyGoals: true, notifyKickoff: true, isFirstVisit: true, joinedAt: new Date() }
    },
    { upsert: true, new: true }
  );
}

// ── /start ───────────────────────────────────────────────
bot.start(async (ctx) => {
  const from = ctx.from;
  const user = await upsertUser(from);
  const startPayload = ctx.startPayload;

  if (startPayload?.startsWith('ref_')) {
    const refCode = startPayload.replace('ref_', '');
    const result = await processReferral(from.id, refCode).catch(() => null);
    if (result?.tierUpgraded) {
      const tier = TIERS[result.newTier];
      try {
        await ctx.telegram.sendMessage(
          result.referrerId,
          `🎉 *New referral joined\\!*\n${tier.emoji} You've unlocked *${escMd(tier.name)} Tier\\!*\nTotal referrals: *${result.referralCount}*`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (_) {}
    }
  }

  await getOrCreateReferral(from.id);

  const isFirst = user.isFirstVisit;
  if (isFirst) await User.findOneAndUpdate({ telegramId: from.id }, { isFirstVisit: false });

  const msg = isFirst ? getWelcomeMessage(from.first_name) : getReturnMessage(from.first_name);
  await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getMainMenu() });
});

// ── SHORTCUT COMMANDS ────────────────────────────────────
bot.command('menu', async (ctx) => {
  await upsertUser(ctx.from);
  await ctx.reply('🏠 *Main Menu*', { parse_mode: 'MarkdownV2', ...getMainMenu() });
});

bot.command('live', async (ctx) => {
  await upsertUser(ctx.from);
  await handleLiveScores({ ...ctx, callbackQuery: null, answerCbQuery: async () => {} });
});

bot.command('fixtures', async (ctx) => {
  await upsertUser(ctx.from);
  await handleTodayFixtures({ ...ctx, callbackQuery: null, answerCbQuery: async () => {} });
});

bot.command('results', async (ctx) => {
  await upsertUser(ctx.from);
  await handleResults({ ...ctx, callbackQuery: null, answerCbQuery: async () => {} });
});

bot.command('standings', async (ctx) => {
  await upsertUser(ctx.from);
  await handleStandings({ ...ctx, callbackQuery: null, answerCbQuery: async () => {} });
});

bot.command('upcoming', async (ctx) => {
  await upsertUser(ctx.from);
  await handleUpcoming({ ...ctx, callbackQuery: null, answerCbQuery: async () => {} });
});

bot.command('predict', async (ctx) => {
  await upsertUser(ctx.from);
  if (!await canAccess(ctx.from.id, 'predictions')) {
    return ctx.reply(getLockedMessage('predictions'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }
  await handlePredictionsMenu({ ...ctx, callbackQuery: null, answerCbQuery: async () => {} });
});

bot.command('hotpicks', async (ctx) => {
  await upsertUser(ctx.from);
  if (!await canAccess(ctx.from.id, 'hotpicks')) {
    return ctx.reply(getLockedMessage('hotpicks'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }
  await handleHotPicks({ ...ctx, callbackQuery: null });
});

bot.command('odds', async (ctx) => {
  await upsertUser(ctx.from);
  if (!await canAccess(ctx.from.id, 'odds')) {
    return ctx.reply(getLockedMessage('odds'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }
  await handleTopOdds({ ...ctx, callbackQuery: null });
});

bot.command('h2h', async (ctx) => {
  await upsertUser(ctx.from);
  if (!await canAccess(ctx.from.id, 'h2h')) {
    return ctx.reply(getLockedMessage('h2h'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }
  await handleH2HMenu({ ...ctx, callbackQuery: null, answerCbQuery: async () => {} });
});

bot.command('team', async (ctx) => {
  await upsertUser(ctx.from);
  const args = ctx.message.text.split(' ').slice(1).join(' ');
  if (!await canAccess(ctx.from.id, 'team')) {
    return ctx.reply(getLockedMessage('team'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }
  if (!args) return handleTeamMenu(ctx);
  await handleTeamSearch(ctx, args);
});

bot.command('notify', async (ctx) => {
  await upsertUser(ctx.from);
  await handleMyAlerts(ctx);
});

bot.command('referral', async (ctx) => {
  await upsertUser(ctx.from);
  const ref = await getOrCreateReferral(ctx.from.id);
  const botInfo = await bot.telegram.getMe();
  const { msg } = getReferralMessage(ref, botInfo.username);
  await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
});

bot.command('about', async (ctx) => {
  await upsertUser(ctx.from);
  await ctx.reply(getAboutMessage(), { parse_mode: 'MarkdownV2', ...getBackMenu() });
});

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
  await upsertUser(ctx.from);
  await handleAdminPanel(ctx);
});

bot.command('cancelbroadcast', async (ctx) => {
  pendingBroadcast.delete(ctx.from.id);
  pendingPromote.delete(ctx.from.id);
  await ctx.reply('❌ Cancelled.');
});

// ── CALLBACK ROUTER ──────────────────────────────────────
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  await upsertUser(ctx.from);

  if (data === 'main_menu') {
    await ctx.answerCbQuery();
    return ctx.reply('🏠 *Main Menu*', { parse_mode: 'MarkdownV2', ...getMainMenu() });
  }
  if (data === 'about') {
    await ctx.answerCbQuery();
    return ctx.reply(getAboutMessage(), { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }

  if (data === 'fixtures_today') return handleTodayFixtures(ctx);
  if (data === 'results') return handleResults(ctx);
  if (data === 'upcoming') return handleUpcoming(ctx);
  if (data === 'live_scores') return handleLiveScores(ctx);
  if (data === 'standings') return handleStandings(ctx);
  if (data.startsWith('group_')) return handleGroupStanding(ctx, data.replace('group_', ''));

  if (data === 'predictions_menu') {
    if (!await canAccess(userId, 'predictions')) {
      await ctx.answerCbQuery('🔒 Locked!');
      return ctx.reply(getLockedMessage('predictions'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handlePredictionsMenu(ctx);
  }
  if (data.startsWith('predict_')) {
    if (!await canAccess(userId, 'predictions')) {
      await ctx.answerCbQuery('🔒 Locked!');
      return ctx.reply(getLockedMessage('predictions'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handlePredictMatch(ctx, data.replace('predict_', ''));
  }
  if (data === 'hot_picks') {
    if (!await canAccess(userId, 'hotpicks')) {
      await ctx.answerCbQuery('🔒 Locked!');
      return ctx.reply(getLockedMessage('hotpicks'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleHotPicks(ctx);
  }
  if (data === 'top_odds') {
    if (!await canAccess(userId, 'odds')) {
      await ctx.answerCbQuery('🔒 Locked!');
      return ctx.reply(getLockedMessage('odds'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleTopOdds(ctx);
  }
  if (data === 'h2h_menu') {
    if (!await canAccess(userId, 'h2h')) {
      await ctx.answerCbQuery('🔒 Locked!');
      return ctx.reply(getLockedMessage('h2h'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleH2HMenu(ctx);
  }
  if (data.startsWith('h2h_')) {
    if (!await canAccess(userId, 'h2h')) {
      await ctx.answerCbQuery('🔒 Locked!');
      return ctx.reply(getLockedMessage('h2h'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleH2H(ctx, data.replace('h2h_', ''));
  }
  if (data === 'team_menu') {
    if (!await canAccess(userId, 'team')) {
      await ctx.answerCbQuery('🔒 Locked!');
      return ctx.reply(getLockedMessage('team'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleTeamMenu(ctx);
  }
  if (data.startsWith('team_search_')) {
    if (!await canAccess(userId, 'team')) {
      await ctx.answerCbQuery('🔒 Locked!');
      return ctx.reply(getLockedMessage('team'), { parse_mode: 'MarkdownV2', ...getBackMenu() });
    }
    return handleTeamSearch(ctx, data.replace('team_search_', ''));
  }

  if (data === 'my_alerts') return handleMyAlerts(ctx);
  if (data === 'toggle_sub') return handleToggleSub(ctx);
  if (data === 'toggle_goals') return handleToggleGoals(ctx);
  if (data === 'toggle_kickoff') return handleToggleKickoff(ctx);

  if (data === 'referral') {
    await ctx.answerCbQuery();
    const ref = await getOrCreateReferral(userId);
    const botInfo = await bot.telegram.getMe();
    const { msg } = getReferralMessage(ref, botInfo.username);
    return ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }

  // Admin callbacks
  if (data === 'admin_broadcast') return handleAdminBroadcastPrompt(ctx);
  if (data === 'admin_promote') return handleAdminPromotePrompt(ctx);
  if (data === 'admin_stats') return handleAdminStats(ctx);
  if (data === 'admin_panel') return handleAdminPanel(ctx);
  if (data === 'confirm_broadcast') return handleConfirmBroadcast(ctx);
  if (data === 'cancel_broadcast') return handleCancelBroadcast(ctx);

  await ctx.answerCbQuery();
});

// ── TEXT MESSAGE HANDLER ─────────────────────────────────
bot.on('text', async (ctx) => {
  await upsertUser(ctx.from);
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  if (isAdmin(ctx)) {
    // Check broadcast input
    if (pendingBroadcast.get(ctx.from.id) === true) {
      const handled = await handleAdminBroadcastMessage(ctx);
      if (handled) return;
    }
    // Check promote input
    if (pendingPromote.get(ctx.from.id) === true) {
      const handled = await handleAdminPromoteMessage(ctx);
      if (handled) return;
    }
  }

  await ctx.reply('👋 Use /menu to navigate or type a command like /live or /fixtures');
});

// ── ERROR HANDLER ────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error('Bot error:', err.message);
  try { ctx.reply('⚠️ Something went wrong. Please try again.'); } catch (_) {}
});

// ── SERVER + LAUNCH ──────────────────────────────────────
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('🏆 Cymor World Cup Bot is running!'));
app.get('/health', (req, res) => res.json({ status: 'ok', bot: 'Cymor WC Bot 2026', time: new Date().toISOString() }));

async function launchBotWithRetry(maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await bot.launch();
      console.log('🚀 Cymor World Cup Bot is LIVE!');
      return;
    } catch (err) {
      const isRetryable = err.code === 502 || err.response?.error_code === 502 || err.message?.includes('502');
      console.error(`Bot launch attempt ${attempt}/${maxRetries} failed:`, err.message);

      if (!isRetryable || attempt === maxRetries) {
        console.error('Bot launch failed permanently. Server will stay up; retrying launch in background...');
        // Don't crash the process — keep retrying in the background every 30s
        // so Render doesn't consider the deploy failed while Telegram is flaky.
        scheduleBackgroundRetry();
        return;
      }

      const delay = Math.min(5000 * attempt, 30000);
      console.log(`Retrying bot.launch() in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function scheduleBackgroundRetry() {
  setTimeout(async () => {
    try {
      await bot.launch();
      console.log('🚀 Cymor World Cup Bot is LIVE! (background retry succeeded)');
    } catch (err) {
      console.error('Background retry failed:', err.message);
      scheduleBackgroundRetry();
    }
  }, 30000);
}

async function launch() {
  await connectDB();
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));
  initCron(bot);
  await launchBotWithRetry();
}

launch().catch((err) => {
  // Never let a startup error kill the whole process —
  // the Express server above keeps Render's health check green
  // while we keep retrying the Telegram connection.
  console.error('Launch error (non-fatal):', err.message);
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
