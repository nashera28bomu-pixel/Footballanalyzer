const footballApi = require('../services/footballApi');
const { getBackMenu } = require('../utils/menu');
const { Markup } = require('telegraf');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

const POPULAR_TEAMS = [
  'Brazil', 'Argentina', 'France', 'England', 'Germany', 'Spain',
  'Portugal', 'Netherlands', 'Morocco', 'Nigeria', 'USA', 'Mexico',
  'Japan', 'South Korea', 'Croatia', 'Serbia', 'Uruguay', 'Ecuador',
  'Senegal', 'Cameroon', 'Ghana', 'Australia', 'Denmark', 'Poland'
];

async function handleTeamMenu(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }

  const popularButtons = [];
  for (let i = 0; i < POPULAR_TEAMS.length; i += 3) {
    const row = POPULAR_TEAMS.slice(i, i + 3).map(t =>
      Markup.button.callback(t, `team_search_${t.toLowerCase()}`)
    );
    popularButtons.push(row);
  }
  popularButtons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

  await ctx.reply(
    `🏴 *TEAM NEWS \\& SQUAD*\n\n_Select a team or type /team \\[name\\]_\n_e\\.g\\. /team Brazil_`,
    { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(popularButtons) }
  );
}

async function handleTeamSearch(ctx, teamName) {
  const loadingMsg = await ctx.reply(`🏴 Loading ${teamName} squad...`);

  try {
    const team = await footballApi.searchTeam(teamName);

    if (!team) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `🏴 "*${escMd(teamName)}*" not found in World Cup 2026\\.\n\nTry: /team Brazil or /team France`,
        { parse_mode: 'MarkdownV2', ...getBackMenu() }
      );
    }

    const fullTeam = await footballApi.getTeam(team.id).catch(() => team);
    await ctx.deleteMessage(loadingMsg.message_id);
    await sendTeamInfo(ctx, fullTeam);

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Team search error:', err.message);
    await ctx.reply('⚠️ Could not load team info.', getBackMenu());
  }
}

async function sendTeamInfo(ctx, team) {
  const name = team.name || 'Unknown';
  const short = team.shortName || team.tla || '';
  const country = team.area?.name || '';
  const founded = team.founded || 'N/A';
  const venue = team.venue || 'N/A';
  const coach = team.coach?.name || 'N/A';
  const coachNat = team.coach?.nationality || '';
  const squad = team.squad || [];

  let msg = `🏴 *${escMd(name)}* ${short ? `\\(${escMd(short)}\\)` : ''}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `🌍 *Country:* ${escMd(country)}\n`;
  msg += `🏟️ *Home Venue:* ${escMd(venue)}\n`;
  msg += `📅 *Founded:* ${escMd(String(founded))}\n`;
  msg += `👔 *Head Coach:* ${escMd(coach)}${coachNat ? ` \\(${escMd(coachNat)}\\)` : ''}\n\n`;

  if (squad.length === 0) {
    msg += `_Squad data not available for this team\\._\n`;
  } else {
    // Group by position
    const groups = {
      Goalkeeper: [],
      Defender: [],
      Midfielder: [],
      Forward: [],
      Other: []
    };

    for (const p of squad) {
      const pos = p.position || 'Other';
      if (groups[pos] !== undefined) groups[pos].push(p);
      else groups.Other.push(p);
    }

    const posEmoji = {
      Goalkeeper: '🧤',
      Defender: '🛡️',
      Midfielder: '⚙️',
      Forward: '⚡',
      Other: '👤'
    };

    for (const [pos, players] of Object.entries(groups)) {
      if (players.length === 0) continue;

      msg += `${posEmoji[pos]} *${escMd(pos)}s* \\(${players.length}\\)\n`;

      // Show all players with shirt number if available
      const playerLines = players.map(p => {
        const num = p.shirtNumber ? `\\#${p.shirtNumber} ` : '';
        const nat = p.nationality ? ` \\[${escMd(p.nationality)}\\]` : '';
        return `  ${num}${escMd(p.name)}${nat}`;
      });

      msg += playerLines.join('\n') + '\n\n';
    }

    msg += `👥 *Total Squad:* ${squad.length} players\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Type /team \\[name\\] to search another team_`;

  // Split if too long (Telegram 4096 char limit)
  if (msg.length > 4000) {
    const half = Math.floor(msg.length / 2);
    const splitPoint = msg.lastIndexOf('\n', half);
    await ctx.reply(msg.substring(0, splitPoint), { parse_mode: 'MarkdownV2' });
    await ctx.reply(msg.substring(splitPoint), { parse_mode: 'MarkdownV2', ...getBackMenu() });
  } else {
    await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
  }
}

module.exports = { handleTeamMenu, handleTeamSearch };
