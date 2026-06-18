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

// In-memory set to prevent duplicate sends within same process cycle
const recentlySent = new Set();

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

  // Keep-alive ping every 14 minutes to prevent Render sleep
  cron.schedule('*/14 * * * *', async () => {
    const url = process.env.RENDER_URL;
    if (url) {
      try {
        const axios = require('axios');
        await axios.get(`${url}/health`, { timeout: 5000 });
      } catch (_) {}
    }
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
    if (err.response?.status !== 429) {
      console.error('Cron live check error:', err.message);
    }
  }
}

async function processLiveMatch(match) {
  const matchId = match.id;
  const homeTeam = match.homeTeam?.name || 'Home';
  const awayTeam = match.awayTeam?.name || 'Away';

  const hg = match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? 0;
  const ag = match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? 0;
  const scoreStr = `${hg}-${ag}`;

  // ── GOAL DETECTION ──────────────────────────────────────
  // Use a unique key: matchId + exact score = only fires ONCE per unique scoreline
  const goalKey = `goal_${matchId}_${scoreStr}`;

  if ((hg > 0 || ag > 0) && !recentlySent.has(goalKey)) {
    // Double-check DB to avoid duplicate across restarts
    const exists = await Notification.findOne({ matchId, type: 'goal', score: scoreStr });
    if (!exists) {
      recentlySent.add(goalKey);
      // Expire from in-memory set after 10 min (safety)
      setTimeout(() => recentlySent.delete(goalKey), 10 * 60 * 1000);

      const goals = match.goals || [];
      const latestGoal = goals[goals.length - 1];
      const scorer = latestGoal?.scorer?.name || null;
      const assist = latestGoal?.assist?.name || null;
      const minute = latestGoal?.minute || match.minute || '?';
      const scoringTeam = latestGoal?.team?.name || (hg > (match._prevHg || 0) ? homeTeam : awayTeam);

      const msg = buildGoalMessage(homeTeam, awayTeam, hg, ag, minute, scorer, assist, scoringTeam);

      try {
        await Notification.create({ matchId, type: 'goal', score: scoreStr, homeTeam, awayTeam, sentAt: new Date() });
        await broadcastToSubscribers(msg, 'goal');
      } catch (dupErr) {
        // Another process beat us — ignore
        if (!dupErr.message?.includes('E11000')) console.error('Goal notif error:', dupErr.message);
      }
    }
  }

  // ── YELLOW CARD ──────────────────────────────────────────
  const bookings = match.bookings || [];
  for (const booking of bookings) {
    if (booking.card !== 'YELLOW') continue;
    const cardKey = `yellow_${matchId}_${booking.minute}_${booking.player?.name}`;
    if (!recentlySent.has(cardKey)) {
      const exists = await Notification.findOne({ matchId, type: 'yellow', score: cardKey });
      if (!exists) {
        recentlySent.add(cardKey);
        setTimeout(() => recentlySent.delete(cardKey), 10 * 60 * 1000);
        const msg = buildCardMessage(homeTeam, awayTeam, hg, ag, booking, 'YELLOW');
        try {
          await Notification.create({ matchId, type: 'yellow', score: cardKey, homeTeam, awayTeam });
          await broadcastToSubscribers(msg, 'goal'); // use goal filter (notifyGoals)
        } catch (_) {}
      }
    }
  }

  // ── RED CARD ─────────────────────────────────────────────
  for (const booking of bookings) {
    if (booking.card !== 'RED') continue;
    const cardKey = `red_${matchId}_${booking.minute}_${booking.player?.name}`;
    if (!recentlySent.has(cardKey)) {
      const exists = await Notification.findOne({ matchId, type: 'red', score: cardKey });
      if (!exists) {
        recentlySent.add(cardKey);
        setTimeout(() => recentlySent.delete(cardKey), 10 * 60 * 1000);
        const msg = buildCardMessage(homeTeam, awayTeam, hg, ag, booking, 'RED');
        try {
          await Notification.create({ matchId, type: 'red', score: cardKey, homeTeam, awayTeam });
          await broadcastToSubscribers(msg, 'goal');
        } catch (_) {}
      }
    }
  }

  // ── HALF TIME ────────────────────────────────────────────
  if (match.status === 'PAUSED') {
    const htKey = `ht_${matchId}`;
    if (!recentlySent.has(htKey)) {
      const exists = await Notification.findOne({ matchId, type: 'halftime' });
      if (!exists) {
        recentlySent.add(htKey);
        const msg = buildHalftimeMessage(homeTeam, awayTeam, hg, ag);
        try {
          await Notification.create({ matchId, type: 'halftime', homeTeam, awayTeam, score: scoreStr });
          await broadcastToSubscribers(msg, 'kickoff');
        } catch (_) {}
      }
    }
  }

  // ── FULL TIME ────────────────────────────────────────────
  if (match.status === 'FINISHED') {
    const ftKey = `ft_${matchId}`;
    if (!recentlySent.has(ftKey)) {
      const exists = await Notification.findOne({ matchId, type: 'fulltime' });
      if (!exists) {
        recentlySent.add(ftKey);
        const msg = buildFulltimeMessage(homeTeam, awayTeam, hg, ag, match.score?.winner);
        try {
          await Notification.create({ matchId, type: 'fulltime', homeTeam, awayTeam, score: scoreStr });
          await broadcastToSubscribers(msg, 'kickoff');
        } catch (_) {}
      }
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

      if (diff > 0 && diff <= 15 * 60 * 1000) {
        const koKey = `ko_${match.id}`;
        if (!recentlySent.has(koKey)) {
          const existing = await Notification.findOne({ matchId: match.id, type: 'kickoff' });
          if (!existing) {
            recentlySent.add(koKey);
            const matchEATTime = formatMatchTime(match.utcDate);
            const msg = buildKickoffMessage(match.homeTeam?.name, match.awayTeam?.name, matchEATTime);
            try {
              await Notification.create({
                matchId: match.id, type: 'kickoff',
                homeTeam: match.homeTeam?.name, awayTeam: match.awayTeam?.name, score: '0-0'
              });
              await broadcastToSubscribers(msg, 'kickoff');
            } catch (_) {}
          }
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

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        await bot.telegram.sendMessage(user.telegramId, message, { parse_mode: 'MarkdownV2' });
      } catch (err) {
        if (err.code === 403) {
          await User.findOneAndUpdate({ telegramId: user.telegramId }, { isSubscribed: false });
        }
      }
      if (i % 25 === 0 && i > 0) await sleep(1000);
    }
  } catch (err) {
    console.error('Broadcast error:', err.message);
  }
}

// ── MESSAGE BUILDERS ────────────────────────────────────────

function buildGoalMessage(home, away, hg, ag, minute, scorer, assist, scoringTeam) {
  const isHome = scoringTeam === home;
  const icon = isHome ? '🔵' : '🔴';

  let msg = `⚽ *GOAL\\!*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${icon} *${escMd(scoringTeam)}* score\\!\n\n`;
  msg += `🏴 *${escMd(home)}* \`${hg}\\-${ag}\` *${escMd(away)}* 🏴\n`;
  msg += `⏱ *Minute ${escMd(String(minute))}'*\n`;

  if (scorer) msg += `⚽ *Scorer:* ${escMd(scorer)}\n`;
  else msg += `⚽ *Scorer:* Unknown\n`;

  if (assist) msg += `🅰️ *Assist:* ${escMd(assist)}\n`;

  msg += `\n_FIFA World Cup 2026 🏆_`;
  return msg;
}

function buildCardMessage(home, away, hg, ag, booking, cardType) {
  const icon = cardType === 'RED' ? '🟥' : '🟨';
  const label = cardType === 'RED' ? 'RED CARD\\!' : 'YELLOW CARD';
  const player = booking.player?.name || 'Unknown Player';
  const team = booking.team?.name || '';
  const minute = booking.minute || '?';

  let msg = `${icon} *${label}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *${escMd(player)}* \\(${escMd(team)}\\)\n`;
  msg += `⏱ *Minute ${escMd(String(minute))}'*\n`;
  msg += `🏴 ${escMd(home)} \`${hg}\\-${ag}\` ${escMd(away)}\n`;
  msg += `\n_FIFA World Cup 2026 🏆_`;
  return msg;
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
      : `🤝 *IT'S A DRAW\\!*`;

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
    `⏰ *${escMd(time)} EAT*\n\n` +
    `_Get ready\\! FIFA World Cup 2026 🏆_`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { initCron, broadcastToSubscribers };
