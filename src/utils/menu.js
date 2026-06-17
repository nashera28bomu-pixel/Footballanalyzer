const { Markup } = require('telegraf');

const LOGO = `
⚽ ══════════════════════════════ ⚽
    🏆  C Y M O R  W O R L D  C U P  B O T  🏆
⚽ ══════════════════════════════ ⚽
         FIFA World Cup 2026™
         🇨🇦 Canada • 🇲🇽 Mexico • 🇺🇸 USA
`;

function getWelcomeMessage(firstName) {
  return `${LOGO}
👋 *Habari ${firstName || 'Champion'}\\!*

Welcome to the *#1 World Cup 2026 Bot* in East Africa\\! 🌍

I'm your personal football analyst — live scores, predictions, odds, and real\\-time alerts, all in *East African Time \\(EAT\\)*\\.

Owned & powered by *Legendary Smiley Cymor* 🏅
━━━━━━━━━━━━━━━━━━━━━━

🔔 *You're now subscribed to live match alerts\\!*
You'll get notified for goals, kickoffs & final whistles\\.

Hit the menu below to get started 👇`;
}

function getReturnMessage(firstName) {
  return `${LOGO}
🙌 *Welcome back, ${firstName || 'Champion'}\\!*

World Cup 2026 is live\\! Here's what's waiting for you 👇`;
}

function getMainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 Today\'s Fixtures', 'fixtures_today'),
      Markup.button.callback('🟢 Live Now', 'live_scores')
    ],
    [
      Markup.button.callback('📊 Group Standings', 'standings'),
      Markup.button.callback('📋 Results', 'results')
    ],
    [
      Markup.button.callback('🔮 Predictions', 'predictions_menu'),
      Markup.button.callback('🔥 Hot Picks', 'hot_picks')
    ],
    [
      Markup.button.callback('💰 Top Odds', 'top_odds'),
      Markup.button.callback('⚔️ H2H Compare', 'h2h_menu')
    ],
    [
      Markup.button.callback('📆 Upcoming', 'upcoming'),
      Markup.button.callback('🏴 Team News', 'team_menu')
    ],
    [
      Markup.button.callback('🔔 My Alerts', 'my_alerts'),
      Markup.button.callback('ℹ️ About Bot', 'about')
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
ℹ️ *About Cymor World Cup Bot*

🤖 *Bot:* Cymor World Cup 2026 Bot
👑 *Owner:* Legendary Smiley Cymor
🌍 *Focus:* FIFA World Cup 2026
⏰ *Timezone:* East African Time \\(UTC\\+3\\)
📡 *Data Sources:* football\\-data\\.org \\| the\\-odds\\-api\\.com
🧠 *AI:* Groq LLaMA3 \\(Match Predictions\\)

🏟️ *Coverage:*
• All 104 World Cup matches
• 48 teams across 12 groups
• Live scores & in\\-match events
• AI\\-powered match predictions
• Real betting odds from 350\\+ bookmakers
• Head\\-to\\-head historical analysis
• Hot bet picks \\(3 per day\\)
• Goal & kickoff notifications

📬 *Stay connected:*
Built with ❤️ in Kenya for East African football fans\\.

*Always a Winner\\!* 🏆`;
}

module.exports = {
  LOGO,
  getWelcomeMessage,
  getReturnMessage,
  getMainMenu,
  getBackMenu,
  getAboutMessage
};
