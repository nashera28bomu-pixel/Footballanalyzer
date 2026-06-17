const User = require('../models/User');
const { broadcastToSubscribers } = require('../services/cron');
const { getBackMenu } = require('../utils/menu');
const { Markup } = require('telegraf');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function isAdmin(ctx) {
  return ctx.from?.id === parseInt(process.env.ADMIN_ID);
}

// State tracker for pending broadcasts
const pendingBroadcast = new Map();

async function handleAdminPanel(ctx) {
  if (!isAdmin(ctx)) {
    return ctx.reply('⛔ Admin only.', getBackMenu());
  }

  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isSubscribed: true });

    const msg = `👑 *ADMIN PANEL*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📊 *Bot Statistics:*\n` +
      `👥 Total Users: *${totalUsers}*\n` +
      `🔔 Subscribed: *${activeUsers}*\n` +
      `📵 Unsubscribed: *${totalUsers - activeUsers}*\n\n` +
      `_Use the buttons below to manage the bot:_`;

    await ctx.reply(msg, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📢 Broadcast to All Users', 'admin_broadcast')],
        [Markup.button.callback('📊 View User Stats', 'admin_stats')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    });
  } catch (err) {
    console.error('Admin panel error:', err.message);
    await ctx.reply('⚠️ Admin panel error.', getBackMenu());
  }
}

async function handleAdminBroadcastPrompt(ctx) {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  // Set pending broadcast state
  pendingBroadcast.set(ctx.from.id, true);

  await ctx.reply(
    `📢 *BROADCAST MESSAGE*\n\n` +
    `Type your message now and I'll send it to ALL subscribers\\.\n\n` +
    `_You can use Telegram formatting \\(bold, italic\\)_\n` +
    `_Send /cancelbroadcast to cancel_`,
    { parse_mode: 'MarkdownV2' }
  );
}

async function handleAdminBroadcastMessage(ctx) {
  if (!isAdmin(ctx)) return false;
  if (!pendingBroadcast.get(ctx.from.id)) return false;

  pendingBroadcast.delete(ctx.from.id);

  const messageText = ctx.message?.text;
  if (!messageText || messageText === '/cancelbroadcast') {
    await ctx.reply('❌ Broadcast cancelled.');
    return true;
  }

  // Send preview first
  await ctx.reply(`📋 *PREVIEW:*\n\n${escMd(messageText)}\n\n_Confirm to send to all users?_`, {
    parse_mode: 'MarkdownV2',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ Send Now', `confirm_broadcast_${Date.now()}`)],
      [Markup.button.callback('❌ Cancel', 'admin_panel')]
    ])
  });

  // Store message for later
  pendingBroadcast.set(`msg_${ctx.from.id}`, messageText);
  return true;
}

async function handleConfirmBroadcast(ctx) {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery('Sending...');

  const message = pendingBroadcast.get(`msg_${ctx.from.id}`);
  if (!message) {
    return ctx.reply('⚠️ No message to broadcast. Start over with /broadcast');
  }

  pendingBroadcast.delete(`msg_${ctx.from.id}`);

  const users = await User.find({ isSubscribed: true }).select('telegramId').lean();
  const statusMsg = await ctx.reply(`📤 Sending to ${users.length} users...`);

  let sent = 0, failed = 0;

  for (let i = 0; i < users.length; i++) {
    try {
      await ctx.telegram.sendMessage(
        users[i].telegramId,
        `📢 *MESSAGE FROM CYMOR BOT*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${message}`,
        { parse_mode: 'MarkdownV2' }
      );
      sent++;
    } catch (err) {
      failed++;
      if (err.code === 403) {
        await User.findOneAndUpdate({ telegramId: users[i].telegramId }, { isSubscribed: false });
      }
    }

    if (i % 25 === 0 && i > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    statusMsg.message_id,
    undefined,
    `✅ *Broadcast complete\\!*\n\n` +
    `📤 Sent: *${sent}*\n` +
    `❌ Failed: *${failed}*`,
    { parse_mode: 'MarkdownV2' }
  );
}

async function handleAdminStats(ctx) {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isSubscribed: true });
    const goalAlerts = await User.countDocuments({ notifyGoals: true });
    const kickoffAlerts = await User.countDocuments({ notifyKickoff: true });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newToday = await User.countDocuments({ joinedAt: { $gte: today } });

    const week = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newWeek = await User.countDocuments({ joinedAt: { $gte: week } });

    const msg = `📊 *DETAILED STATS*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👥 *Total Users:* ${totalUsers}\n` +
      `✅ *Subscribed:* ${activeUsers}\n` +
      `📵 *Unsubscribed:* ${totalUsers - activeUsers}\n\n` +
      `🆕 *New Today:* ${newToday}\n` +
      `📅 *New This Week:* ${newWeek}\n\n` +
      `🔔 *Goal Alert Subs:* ${goalAlerts}\n` +
      `🚀 *Kickoff Alert Subs:* ${kickoffAlerts}`;

    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
  } catch (err) {
    await ctx.reply('⚠️ Could not load stats.', getBackMenu());
  }
}

module.exports = {
  isAdmin,
  pendingBroadcast,
  handleAdminPanel,
  handleAdminBroadcastPrompt,
  handleAdminBroadcastMessage,
  handleConfirmBroadcast,
  handleAdminStats
};
