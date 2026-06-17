const User = require('../models/User');
const { getBackMenu } = require('../utils/menu');
const { Markup } = require('telegraf');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function handleMyAlerts(ctx) {
  await ctx.answerCbQuery();

  try {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) return ctx.reply('User not found. Try /start first.', getBackMenu());

    const subStatus = user.isSubscribed ? '✅ ON' : '❌ OFF';
    const goalStatus = user.notifyGoals ? '✅ ON' : '❌ OFF';
    const kickoffStatus = user.notifyKickoff ? '✅ ON' : '❌ OFF';

    const msg = `🔔 *MY ALERT SETTINGS*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📢 All Alerts: *${subStatus}*\n` +
      `⚽ Goal Notifications: *${goalStatus}*\n` +
      `🚀 Kickoff Reminders: *${kickoffStatus}*\n\n` +
      `_Toggle your preferences below:_`;

    await ctx.reply(msg, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(
          `${user.isSubscribed ? '🔕 Disable All Alerts' : '🔔 Enable All Alerts'}`,
          'toggle_sub'
        )],
        [Markup.button.callback(
          `${user.notifyGoals ? '❌ Disable Goal Alerts' : '✅ Enable Goal Alerts'}`,
          'toggle_goals'
        )],
        [Markup.button.callback(
          `${user.notifyKickoff ? '❌ Disable Kickoff Alerts' : '✅ Enable Kickoff Alerts'}`,
          'toggle_kickoff'
        )],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    });
  } catch (err) {
    console.error('Alerts error:', err.message);
    await ctx.reply('⚠️ Could not load settings.', getBackMenu());
  }
}

async function handleToggleSub(ctx) {
  await ctx.answerCbQuery();
  try {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) return;
    user.isSubscribed = !user.isSubscribed;
    await user.save();
    const status = user.isSubscribed ? '🔔 *Alerts ENABLED*' : '🔕 *Alerts DISABLED*';
    await ctx.reply(`${status}\n\nUse the button again to change\\.`, {
      parse_mode: 'MarkdownV2', ...getBackMenu()
    });
  } catch (err) {
    await ctx.reply('⚠️ Could not update setting.', getBackMenu());
  }
}

async function handleToggleGoals(ctx) {
  await ctx.answerCbQuery();
  try {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) return;
    user.notifyGoals = !user.notifyGoals;
    await user.save();
    const status = user.notifyGoals ? '✅ *Goal alerts ON*' : '❌ *Goal alerts OFF*';
    await ctx.reply(`${status}`, { parse_mode: 'MarkdownV2', ...getBackMenu() });
  } catch (err) {
    await ctx.reply('⚠️ Could not update setting.', getBackMenu());
  }
}

async function handleToggleKickoff(ctx) {
  await ctx.answerCbQuery();
  try {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) return;
    user.notifyKickoff = !user.notifyKickoff;
    await user.save();
    const status = user.notifyKickoff ? '✅ *Kickoff reminders ON*' : '❌ *Kickoff reminders OFF*';
    await ctx.reply(`${status}`, { parse_mode: 'MarkdownV2', ...getBackMenu() });
  } catch (err) {
    await ctx.reply('⚠️ Could not update setting.', getBackMenu());
  }
}

module.exports = { handleMyAlerts, handleToggleSub, handleToggleGoals, handleToggleKickoff };
