const User = require('../models/User');
const { broadcastToSubscribers } = require('../services/cron');
const { getBackMenu, getMainMenu } = require('../utils/menu');
const { Markup } = require('telegraf');
const { Referral, TIERS } = require('../services/referral');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function isAdmin(ctx) {
  return ctx.from?.id === parseInt(process.env.ADMIN_ID);
}

// Separate maps for broadcast state
const pendingBroadcast = new Map();   // userId -> true (waiting for message)
const pendingMessage = new Map();     // userId -> message text (waiting for confirm)
const pendingPromote = new Map();     // userId -> true (waiting for target ID)

async function handleAdminPanel(ctx) {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');

  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isSubscribed: true });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const newToday = await User.countDocuments({ joinedAt: { $gte: today } });

    const msg = `👑 *ADMIN PANEL*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👥 Total Users: *${totalUsers}*\n` +
      `🔔 Subscribed: *${activeUsers}*\n` +
      `🆕 New Today: *${newToday}*\n\n` +
      `_Select an action:_`;

    await ctx.reply(msg, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📢 Broadcast Message', 'admin_broadcast')],
        [Markup.button.callback('⬆️ Promote User', 'admin_promote')],
        [Markup.button.callback('📊 Full Stats', 'admin_stats')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    });
  } catch (err) {
    console.error('Admin panel error:', err.message);
    await ctx.reply('⚠️ Admin panel error.');
  }
}

// ── BROADCAST ────────────────────────────────────────────

async function handleAdminBroadcastPrompt(ctx) {
  if (!isAdmin(ctx)) return;
  try { await ctx.answerCbQuery(); } catch (_) {}

  // Clear any stale state
  pendingMessage.delete(ctx.from.id);
  pendingPromote.delete(ctx.from.id);
  pendingBroadcast.set(ctx.from.id, true);

  await ctx.reply(
    `📢 *BROADCAST*\n\nType your message now\\.\nUsers will see it as a notification from CymorBot\\.\n\nSend /cancelbroadcast to cancel\\.`,
    { parse_mode: 'MarkdownV2' }
  );
}

async function handleAdminBroadcastMessage(ctx) {
  if (!isAdmin(ctx)) return false;

  // Handle confirm step
  if (pendingMessage.has(ctx.from.id)) {
    return false; // confirm is handled by callback buttons
  }

  // Handle initial message input
  if (!pendingBroadcast.get(ctx.from.id)) return false;

  const text = ctx.message?.text;
  if (!text || text.startsWith('/')) {
    pendingBroadcast.delete(ctx.from.id);
    await ctx.reply('❌ Broadcast cancelled.');
    return true;
  }

  pendingBroadcast.delete(ctx.from.id);
  pendingMessage.set(ctx.from.id, text);

  const userCount = await User.countDocuments({ isSubscribed: true });

  await ctx.reply(
    `📋 *PREVIEW*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${escMd(text)}\n\n━━━━━━━━━━━━━━━━━━━━━━\n_Will send to ${userCount} subscribers_\n\nConfirm?`,
    {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Send Now', 'confirm_broadcast')],
        [Markup.button.callback('❌ Cancel', 'cancel_broadcast')]
      ])
    }
  );
  return true;
}

async function handleConfirmBroadcast(ctx) {
  if (!isAdmin(ctx)) return;
  try { await ctx.answerCbQuery('Sending...'); } catch (_) {}

  const message = pendingMessage.get(ctx.from.id);
  if (!message) {
    return ctx.reply('⚠️ No message found. Use /admin to start again.');
  }
  pendingMessage.delete(ctx.from.id);

  const users = await User.find({ isSubscribed: true }).select('telegramId').lean();
  let sent = 0, failed = 0;

  const statusMsg = await ctx.reply(`📤 Sending to ${users.length} users...`);

  const fullMsg = `📢 *UPDATE FROM CYMOR BOT*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${message}`;

  for (let i = 0; i < users.length; i++) {
    try {
      await ctx.telegram.sendMessage(users[i].telegramId, fullMsg, { parse_mode: 'MarkdownV2' });
      sent++;
    } catch (err) {
      failed++;
      if (err.code === 403) {
        await User.findOneAndUpdate({ telegramId: users[i].telegramId }, { isSubscribed: false });
      }
    }
    if (i % 25 === 0 && i > 0) await new Promise(r => setTimeout(r, 1000));
  }

  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsg.message_id, undefined,
      `✅ *Broadcast Done\\!*\n📤 Sent: *${sent}* \\| ❌ Failed: *${failed}*`,
      { parse_mode: 'MarkdownV2' }
    );
  } catch (_) {
    await ctx.reply(`✅ Broadcast done! Sent: ${sent}, Failed: ${failed}`);
  }
}

async function handleCancelBroadcast(ctx) {
  if (!isAdmin(ctx)) return;
  try { await ctx.answerCbQuery(); } catch (_) {}
  pendingMessage.delete(ctx.from.id);
  pendingBroadcast.delete(ctx.from.id);
  await ctx.reply('❌ Broadcast cancelled.', getBackMenu());
}

// ── PROMOTE USER ────────────────────────────────────────

async function handleAdminPromotePrompt(ctx) {
  if (!isAdmin(ctx)) return;
  try { await ctx.answerCbQuery(); } catch (_) {}

  pendingBroadcast.delete(ctx.from.id);
  pendingMessage.delete(ctx.from.id);
  pendingPromote.set(ctx.from.id, true);

  const tierList = Object.entries(TIERS).map(([k, v]) =>
    `${v.emoji} Tier ${k} = ${v.name} (${v.refs} refs)`
  ).join('\n');

  await ctx.reply(
    `⬆️ *PROMOTE USER*\n\n${escMd(tierList)}\n\nSend the target user's Telegram ID followed by tier number\\.\nExample: \`123456789 2\`\n\n_/cancelbroadcast to cancel_`,
    { parse_mode: 'MarkdownV2' }
  );
}

async function handleAdminPromoteMessage(ctx) {
  if (!isAdmin(ctx)) return false;
  if (!pendingPromote.get(ctx.from.id)) return false;

  const text = ctx.message?.text?.trim();
  if (!text || text.startsWith('/')) {
    pendingPromote.delete(ctx.from.id);
    await ctx.reply('❌ Promotion cancelled.');
    return true;
  }

  const parts = text.split(' ');
  if (parts.length < 2) {
    await ctx.reply('⚠️ Format: `<telegram_id> <tier>` e.g. `123456789 2`', { parse_mode: 'MarkdownV2' });
    return true;
  }

  const targetId = parseInt(parts[0]);
  const targetTier = parseInt(parts[1]);

  if (isNaN(targetId) || isNaN(targetTier) || targetTier < 0 || targetTier > 3) {
    await ctx.reply('⚠️ Invalid ID or tier (0-3). Try again.');
    return true;
  }

  pendingPromote.delete(ctx.from.id);

  try {
    const ref = await Referral.findOneAndUpdate(
      { telegramId: targetId },
      { telegramId: targetId, referralCode: `ADMIN${targetId}`, unlockedTiers: targetTier },
      { upsert: true, new: true }
    );

    const tier = TIERS[targetTier];
    await ctx.reply(`✅ User \`${targetId}\` promoted to ${tier.emoji} *${tier.name}*\\!`, { parse_mode: 'MarkdownV2' });

    // Notify the user
    try {
      await ctx.telegram.sendMessage(
        targetId,
        `🎉 *You've been promoted by the admin\\!*\n\n${tier.emoji} You now have *${escMd(tier.name)} Tier* access\\!\n\n${escMd(tier.unlockMsg || `All ${tier.name} features are unlocked!`)}`,
        { parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}

  } catch (err) {
    console.error('Promote error:', err.message);
    await ctx.reply('⚠️ Could not promote user. Check the ID is correct.');
  }

  return true;
}

// ── STATS ────────────────────────────────────────────────

async function handleAdminStats(ctx) {
  if (!isAdmin(ctx)) return;
  try { await ctx.answerCbQuery(); } catch (_) {}

  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isSubscribed: true });
    const goalAlerts = await User.countDocuments({ notifyGoals: true });
    const kickoffAlerts = await User.countDocuments({ notifyKickoff: true });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const newToday = await User.countDocuments({ joinedAt: { $gte: today } });
    const week = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newWeek = await User.countDocuments({ joinedAt: { $gte: week } });

    const msg = `📊 *FULL STATS*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👥 Total Users: *${totalUsers}*\n` +
      `✅ Subscribed: *${activeUsers}*\n` +
      `📵 Unsubscribed: *${totalUsers - activeUsers}*\n\n` +
      `🆕 New Today: *${newToday}*\n` +
      `📅 New This Week: *${newWeek}*\n\n` +
      `⚽ Goal Alert Subs: *${goalAlerts}*\n` +
      `🚀 Kickoff Alert Subs: *${kickoffAlerts}*`;

    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
  } catch (err) {
    await ctx.reply('⚠️ Could not load stats.');
  }
}

module.exports = {
  isAdmin,
  pendingBroadcast,
  pendingPromote,
  handleAdminPanel,
  handleAdminBroadcastPrompt,
  handleAdminBroadcastMessage,
  handleAdminPromotePrompt,
  handleAdminPromoteMessage,
  handleConfirmBroadcast,
  handleCancelBroadcast,
  handleAdminStats
};
