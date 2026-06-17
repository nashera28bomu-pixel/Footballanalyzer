const cron = require('node-cron');
const footballApi = require('../services/footballApi');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { formatMatchTime } = require('../utils/time');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

let bot = null;

function initCron(botInstance) {
  bot = botInstance;

  // Poll live matches every 60 seconds
  cron.schedule('*/60 * * * * *', async () => {
    await checkLiveMatches();
  });

  // Check for upcoming kickoffs every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await checkUpcomingKickoffs();
  });

  console.log('✅ Cron jobs initialized');
}

async function checkLiveMatches() {
  try {
    footballApi.clearLiveCache();
    const data = await footballApi.getLiveMatches();
    const matches = data.matches || [];

    for (const match of matches) {
      await processLiveMatch(match);
    }
  } catch (err) {
    // Silent fail — don't crash cron on API errors
    if (err.response?.status !== 429) {
      console.error('Cron live check error:', err.message);
    }
  }
}

async function processLiveMatch(match) {
  const matchId = match.id;
  const homeTeam = match.homeTeam?.name;
  const awayTeam = match.awayTeam?.name;

  const hg = match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? 0;
  const ag = match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? 0;
  const scoreStr = `${hg}-${ag}`;

  // Check for new goals by comparing score to last notification
  const lastGoalNotif = await Notification.findOne({
    matchId,
    type: 'goal',
    score: scoreStr
  });

  if (!lastGoalNotif && (hg > 0 || ag > 0)) {
    // New goal!
    const minute = match.minute || '?';

    // Determine who scored (check recent events)
    const goals = match.goals || [];
    const latestGoal = goals[goals.length - 1];
    const scorer = latestGoal?.scorer?.name || 'Unknown';
    const scoringTeam = latestGoal?.team?.name || '';

    const msg = buildGoalMessage(homeTeam, awayTeam, hg, ag, minute, scorer, scoringTeam);
    await broadcastToSubscribers(msg, 'goal');

    // Save notification to prevent duplicates
    await Notification.findOneAndUpdate(
      { matchId, type: 'goal', score: scoreStr },
      { matchId, type: 'goal', score: scoreStr, homeTeam, awayTeam, sentAt: new Date() },
      { upsert: true }
    );
  }

  // Check halftime
  if (match.status === 'PAUSED') {
    const htNotif = await Notification.findOne({ matchId, type: 'halftime' });
    if (!htNotif) {
      const msg = buildHalftimeMessage(homeTeam, awayTeam, hg, ag);
      await broadcastToSubscribers(msg, 'kickoff');
      await Notification.create({ matchId, type: 'halftime', homeTeam, awayTeam, score: scoreStr });
    }
  }

  // Check fulltime
  if (match.status === 'FINISHED') {
    const ftNotif = await Notification.findOne({ matchId, type: 'fulltime' });
    if (!ftNotif) {
      const msg = buildFulltimeMessage(homeTeam, awayTeam, hg, ag, match.score?.winner);
      await broadcastToSubscribers(msg, 'kickoff');
      await Notification.create({ matchId, type: 'fulltime', homeTeam, awayTeam, score: scoreStr });
    }
  }
}

async function checkUpcomingKickoffs() {
  try {
    const data = await footballApi.getTodayMatches();
    const matches = data.matches || [];
    const now = Date.now();

    for (const match of matches) {
      if (match.status !== 'SCHEDULED' && match.status !== 'TIMED') continue;

      const matchTime = new Date(match.utcDate).getTime();
      const diff = matchTime - now;

      // Notify 15 minutes before kickoff
      if (diff > 0 && diff <= 15 * 60 * 1000) {
        const notifKey = `kickoff_${match.id}`;
        const existing = await Notification.findOne({ matchId: match.id, type: 'kickoff' });
        if (!existing) {
          const matchEATTime = formatMatchTime(match.utcDate);
          const msg = buildKickoffMessage(match.homeTeam?.name, match.awayTeam?.name, matchEATTime);
          await broadcastToSubscribers(msg, 'kickoff');
          await Notification.create({
            matchId: match.id,
            type: 'kickoff',
            homeTeam: match.homeTeam?.name,
            awayTeam: match.awayTeam?.name,
            score: '0-0'
          });
        }
      }
    }
  } catch (err) {
    console.error('Kickoff check error:', err.message);
  }
}

async function broadcastToSubscribers(message, type) {
  try {
    const query = { isSubscribed: true };
    if (type === 'goal') query.notifyGoals = true;
    if (type === 'kickoff') query.notifyKickoff = true;

    const users = await User.find(query).select('telegramId').lean();
    console.log(`📢 Broadcasting to ${users.length} users...`);

    // Batch send with delay to avoid Telegram rate limits
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        await bot.telegram.sendMessage(user.telegramId, message, { parse_mode: 'MarkdownV2' });
      } catch (err) {
        // User may have blocked bot — mark as unsubscribed
        if (err.code === 403) {
          await User.findOneAndUpdate({ telegramId: user.telegramId }, { isSubscribed: false });
        }
      }
      // 50ms delay between messages to respect rate limits
      if (i % 20 === 0 && i > 0) await sleep(1000);
    }
  } catch (err) {
    console.error('Broadcast error:', err.message);
  }
}

function buildGoalMessage(home, away, hg, ag, minute, scorer, scoringTeam) {
  const goalTeamIcon = scoringTeam === home ? '🔵' : '🔴';
  return `⚽ *GOAL\\!*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${goalTeamIcon} *${escMd(scoringTeam)}* score\\!\n\n` +
    `🏴 *${escMd(home)}* \\| \`${hg}\\-${ag}\` \\| *${escMd(away)}* 🏴\n` +
    `⏱ *Minute ${escMd(String(minute))}'*\n` +
    `⚽ *Scorer:* ${escMd(scorer)}\n\n` +
    `_FIFA World Cup 2026 🏆_`;
}

function buildHalftimeMessage(home, away, hg, ag) {
  return `⏸ *HALF TIME*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🏴 *${escMd(home)}* \`${hg}\\-${ag}\` *${escMd(away)}* 🏴\n\n` +
    `_15 minute break \\| Second half soon_\n` +
    `_FIFA World Cup 2026 🏆_`;
}

function buildFulltimeMessage(home, away, hg, ag, winner) {
  const resultText = winner === 'HOME_TEAM'
    ? `🏆 *${escMd(home)} WIN\\!*`
    : winner === 'AWAY_TEAM'
      ? `🏆 *${escMd(away)} WIN\\!*`
      : `🤝 *DRAW\\!*`;

  return `🏁 *FULL TIME*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🏴 *${escMd(home)}* \`${hg}\\-${ag}\` *${escMd(away)}* 🏴\n\n` +
    `${resultText}\n\n` +
    `_FIFA World Cup 2026 🏆_`;
}

function buildKickoffMessage(home, away, time) {
  return `🚀 *KICKOFF IN 15 MINUTES\\!*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚽ *${escMd(home)}* vs *${escMd(away)}*\n` +
    `⏰ *${escMd(time)}*\n\n` +
    `_Get ready\\! FIFA World Cup 2026 🏆_`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Export broadcastToSubscribers for admin use
module.exports = { initCron, broadcastToSubscribers };
