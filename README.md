# 🏆 Cymor World Cup Bot 2026

> The #1 FIFA World Cup 2026 Telegram Bot for East Africa  
> Built by **Legendary Smiley Cymor** | Powered by Cymor Tech Services

---

## 📱 Features

| Feature | Tier Required | Description |
|---|---|---|
| 📅 Today's Fixtures | ⚪ Free | All today's WC matches in EAT |
| 🟢 Live Scores | ⚪ Free | Real-time match scores & events |
| 📊 Group Standings | ⚪ Free | All 12 group tables |
| 📋 Results | ⚪ Free | Latest match results |
| 📆 Upcoming | ⚪ Free | Next 7 days fixtures |
| 🔮 Predictions | 🥈 Silver | AI-powered match predictions |
| 🔥 Hot Picks | 🥈 Silver | 3 daily confident bet picks |
| 💰 Top Odds | 🥈 Silver | Live odds from 350+ bookmakers |
| ⚔️ H2H Comparison | 🥇 Gold | Historical head-to-head analysis |
| 🏴 Team News | 🥇 Gold | Squad info & team details |
| 🔔 Live Alerts | 🥇 Gold | Goal & kickoff notifications |
| 👑 VIP Tips | 👑 Legend | Priority AI & early odds |

---

## 🔗 Referral System (Grow = Unlock)

Users unlock more features by sharing their referral link:

- 🥈 **Silver** (3 referrals) → Predictions + Hot Picks + Odds
- 🥇 **Gold** (7 referrals) → H2H + Team News + Live Alerts  
- 👑 **Legend** (15 referrals) → VIP Tips + Priority AI + All Features

> Admin has full access to all features by default.

---

## 🛠️ Tech Stack

- **Bot Framework:** Telegraf v4 (Node.js)
- **Database:** MongoDB Atlas (Mongoose)
- **Live Notifications:** node-cron (60s polling)
- **AI Predictions:** Groq API (LLaMA3-8b)
- **Deployment:** Render Free Tier

---

## 📡 API Keys — Where to Get Them

### 1. Telegram Bot Token
1. Open Telegram, search **@BotFather**
2. Send `/newbot`
3. Follow prompts, copy your token
4. Also send `/setcommands` and paste:
```
menu - Open main menu
referral - Your referral link & tier
team - Search a team (e.g. /team Brazil)
notify - Manage your alerts
admin - Admin panel (admin only)
```

**→ Free. No limits for bots.**

---

### 2. Football Data API (football-data.org)
> Fixtures, live scores, standings, H2H, squad info

1. Go to: **https://www.football-data.org/client/register**
2. Register for a free account
3. Copy your API token from the dashboard
4. Free tier: 10 requests/minute, includes FIFA World Cup ✅

---

### 3. The Odds API (the-odds-api.com)
> Live betting odds from 350+ bookmakers

1. Go to: **https://the-odds-api.com/#get-access**
2. Click "Get API Key" (free)
3. Verify your email, copy your key
4. Free tier: 500 requests/month (we cache for 10 min, enough for ~50 users/day)

---

### 4. Groq API (groq.com)
> AI predictions and hot pick analysis (LLaMA3)

1. Go to: **https://console.groq.com/keys**
2. Sign in with Google/GitHub
3. Click "Create API Key"
4. Free tier: Very generous — 14,400 requests/day ✅

---

### 5. MongoDB Atlas
> User data, notification deduplication, referral tracking

1. Go to: **https://www.mongodb.com/cloud/atlas/register**
2. Create free cluster (M0 - Free Forever)
3. Create a database user
4. Whitelist `0.0.0.0/0` in Network Access
5. Get connection string from "Connect > Drivers"
   Format: `mongodb+srv://user:password@cluster.mongodb.net/cymor-wcbot`

---

### 6. Your Telegram Admin ID
> To use admin broadcast feature

1. Open Telegram, search **@userinfobot**
2. Send `/start`
3. Copy the **Id** number shown

---

## ⚙️ Setup

### 1. Clone & install
```bash
git clone https://github.com/yourname/cymor-world-cup-bot
cd cymor-world-cup-bot
npm install
```

### 2. Create `.env` file
```bash
cp .env.example .env
```
Fill in all values in `.env`

### 3. Run locally
```bash
npm start
# or with auto-reload:
npm run dev
```

---

## 🚀 Deploy to Render

1. Push code to GitHub
2. Go to **https://render.com** → New Web Service
3. Connect your GitHub repo
4. Render auto-detects `render.yaml`
5. Add all environment variables in the Render dashboard:
   - `BOT_TOKEN`
   - `ADMIN_ID`
   - `MONGODB_URI`
   - `FOOTBALL_API_KEY`
   - `ODDS_API_KEY`
   - `GROQ_API_KEY`
6. Deploy!

> ⚠️ **Render Free Tier Note:** The service sleeps after 15 minutes of inactivity. For a bot, this is fine — Telegram will wake it up on the next message. Cron jobs won't run while sleeping, but will resume on wake.

---

## 👑 Admin Commands

As admin (your Telegram ID), you have:
- `/admin` — Open admin panel with stats
- `/broadcast` — Send a message to ALL subscribers
- Full access to all bot features (bypasses referral tiers)

---

## 📁 Project Structure

```
cymor-wc-bot/
├── src/
│   ├── index.js              # Main bot entry point
│   ├── commands/
│   │   ├── fixtures.js       # Today's fixtures, results, upcoming
│   │   ├── live.js           # Live scores
│   │   ├── standings.js      # Group standings
│   │   ├── predictions.js    # AI match predictions
│   │   ├── hotpicks.js       # 3 daily hot picks
│   │   ├── odds.js           # Live betting odds
│   │   ├── h2h.js            # Head-to-head comparison
│   │   ├── team.js           # Team news & squad
│   │   ├── notify.js         # Alert preferences
│   │   └── admin.js          # Admin panel & broadcast
│   ├── services/
│   │   ├── footballApi.js    # football-data.org wrapper
│   │   ├── oddsApi.js        # the-odds-api.com wrapper
│   │   ├── groqAi.js         # Groq AI predictions
│   │   ├── cron.js           # Live match polling & notifications
│   │   └── referral.js       # Referral system & tier unlocks
│   ├── models/
│   │   ├── User.js           # User model
│   │   └── Notification.js   # Sent notifications tracker
│   └── utils/
│       ├── time.js           # EAT timezone utilities
│       └── menu.js           # Bot menu & welcome messages
├── .env.example
├── .gitignore
├── render.yaml
├── package.json
└── README.md
```

---

## ⏰ EAT (East African Time)
All match times displayed in **UTC+3** (Kenya, Tanzania, Uganda, Ethiopia).

---

## ⚠️ Disclaimer
This bot is for entertainment and informational purposes. Odds data is provided for reference only. Always bet responsibly.

---

*Built with ❤️ in Kenya by Legendary Smiley Cymor | Cymor Tech Services*  
*"Always a Winner" 🏆*
