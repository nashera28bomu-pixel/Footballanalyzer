const { Markup } = require('telegraf');

const LOGO = `⚽━━━━━━━━━━━━━━━━━━━━━━━━⚽
🏆  CYMOR WORLD CUP BOT  🏆
   FIFA World Cup 2026™
 🇨🇦 Canada • 🇲🇽 Mexico • 🇺🇸 USA
⚽━━━━━━━━━━━━━━━━━━━━━━━━⚽`;

function getWelcomeMessage(firstName) {
  return `${LOGO}

👋 *Habari ${escMd(firstName || 'Champion')}\\!*

Welcome to the *\\#1 World Cup 2026 Bot* in East Africa\\! 🌍
Your personal football brain — all times in *EAT \\(UTC\\+3\\)*\\.

Built by *Legendary Smiley Cymor* 🏅 \\| Cymor Tech Services

━━━━━━━━━━━━━━━━━━━━━━
🔔 *You're subscribed to live match alerts\\!*
━━━━━━━━━━━━━━━━━━━━━━

📋 *WHAT I CAN DO:*

🟢 *LIVE & FIXTURES*
/live — Live scores right now 🔴
/fixtures — Today's matches \\(EAT\\)
/results — Latest results
/upcoming — Next 7 days schedule

🔮 *PREDICTIONS & ANALYSIS*
/predict — AI match prediction
/hotpicks — 3 best bets today 🔥
/h2h — Head\\-to\\-head comparison
/odds — Kenya bookmaker odds 💰

📊 *STATS & NEWS*
/standings — Group tables
/team — Team squad \\& news
/referral — Invite friends & unlock features 🔗

⚙️ *SETTINGS*
/notify — Manage my alerts 🔔
/about — About this bot
/menu — Show main menu

━━━━━━━━━━━━━━━━━━━━━━
_Tap any button below or type a command_`;
}

function getReturnMessage(firstName) {
  return `${LOGO}

🙌 *Welcome back, ${escMd(firstName || 'Champion')}\\!* ⚽

World Cup 2026 is live\\! Use the buttons below or type any command\\.

/live — Live scores now 🔴
/fixtures — Today's matches
/hotpicks — Today's best bets 🔥
/predict — AI match prediction`;
}

function getMainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 Fixtures', 'fixtures_today'),
      Markup.button.callback('🟢 Live', 'live_scores'),
      Markup.button.callback('📋 Results', 'results')
    ],
    [
      Markup.button.callback('📊 Standings', 'standings'),
      Markup.button.callback('📆 Upcoming', 'upcoming')
    ],
    [
      Markup.button.callback('🔮 Predict', 'predictions_menu'),
      Markup.button.callback('🔥 Hot Picks', 'hot_picks'),
      Markup.button.callback('⚔️ H2H', 'h2h_menu')
    ],
    [
      Markup.button.callback('💰 KE Odds', 'top_odds'),
      Markup.button.callback('🏴 Teams', 'team_menu'),
      Markup.button.callback('🔔 Alerts', 'my_alerts')
    ],
    [
      Markup.button.callback('🔗 Invite & Unlock', 'referral'),
      Markup.button.callback('ℹ️ Help', 'about')
    ]
  ]);
}

function getBackMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Main Menu', 'main_menu')]
  ]);
}

function getAboutMessage() {
  return `${LOGO}

ℹ️ *HOW TO USE CYMOR BOT*

Type any command or tap a menu button:

🟢 *LIVE & FIXTURES*
/live — Live scores right now
/fixtures — Today's matches in EAT
/results — Finished match results
/upcoming — Fixtures next 7 days

🔮 *PREDICTIONS & BETS*
/predict — Select a match for AI prediction
/hotpicks — 3 confident picks from today's games
/h2h — H2H history between two teams
/odds — Best odds from Betika, SportPesa & more

📊 *STATS & NEWS*
/standings — All 12 World Cup group tables
/team \\[name\\] — Full squad e\\.g\\. /team Brazil

🔗 *REFERRAL SYSTEM*
/referral — Get your invite link
Invite 3 friends → unlock Predictions \\+ Odds \\+ Hot Picks
Invite 7 friends → unlock H2H \\+ Team News \\+ Live Alerts
Invite 15 friends → unlock VIP Legend status 👑

⚙️ *SETTINGS*
/notify — Toggle goal \\& kickoff alerts
/menu — Show main menu

━━━━━━━━━━━━━━━━━━━━━━
👑 *Owner:* Legendary Smiley Cymor
🌍 *For:* East African football fans
⏰ *Timezone:* EAT \\(UTC\\+3\\)
💰 *Odds:* Betika, SportPesa, Pepeta, Sportybet
🧠 *AI:* CYMOR AI

_Always a Winner\\!_ 🏆`;
}

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

module.exports = {
  LOGO, getWelcomeMessage, getReturnMessage, getMainMenu, getBackMenu, getAboutMessage, escMd
};
