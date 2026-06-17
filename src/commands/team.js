const footballApi = require('../services/footballApi');
const { getBackMenu } = require('../utils/menu');
const { Markup } = require('telegraf');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// Map of team short names for quick searching
const POPULAR_TEAMS = [
  'Brazil', 'Argentina', 'France', 'England', 'Germany', 'Spain',
  'Portugal', 'Netherlands', 'Belgium', 'Italy', 'Uruguay', 'Mexico',
  'USA', 'Senegal', 'Morocco', 'Nigeria', 'Japan', 'South Korea',
  'Australia', 'Croatia', 'Denmark', 'Switzerland', 'Poland', 'Serbia'
];

async function handleTeamMenu(ctx) {
  await ctx.answerCbQuery();

  const popularButtons = [];
  for (let i = 0; i < POPULAR_TEAMS.length; i += 3) {
    const row = POPULAR_TEAMS.slice(i, i + 3).map(t =>
      Markup.button.callback(t, `team_search_${t.toLowerCase()}`)
    );
    popularButtons.push(row);
  }
  popularButtons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

  await ctx.reply(
    `🏴 *TEAM NEWS*\n\n_Select a team or type /team \\[name\\] to search:_\n\n_e\\.g\\. /team Brazil_`,
    { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(popularButtons) }
  );
}

async function handleTeamSearch(ctx, teamName) {
  const loadingMsg = await ctx.reply(`🏴 Looking up ${teamName}...`);

  try {
    const team = await footballApi.searchTeam(teamName);

    if (!team) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `🏴 Team "*${escMd(teamName)}*" not found in World Cup 2026\\.\n\nTry another name or use /team \\[exact name\\]\\.`,
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
  const squad = team.squad || [];

  let msg = `🏴 *${escMd(name)}* ${short ? `\\(${escMd(short)}\\)` : ''}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `🌍 *Country:* ${escMd(country)}\n`;
  msg += `🏟️ *Venue:* ${escMd(venue)}\n`;
  msg += `📅 *Founded:* ${escMd(String(founded))}\n`;
  msg += `👔 *Coach:* ${escMd(coach)}\n\n`;

  if (squad.length > 0) {
    // Group by position
    const positions = { Goalkeeper: [], Defender: [], Midfielder: [], Forward: [] };
    for (const p of squad) {
      const pos = p.position || 'Midfielder';
      if (positions[pos]) positions[pos].push(p);
    }

    msg += `👥 *SQUAD*\n`;
    msg += `────────────────────\n`;

    const posEmoji = {
      Goalkeeper: '🧤',
      Defender: '🛡️',
      Midfielder: '⚙️',
      Forward: '⚡'
    };

    for (const [pos, players] of Object.entries(positions)) {
      if (players.length === 0) continue;
      msg += `${posEmoji[pos]} *${escMd(pos)}s*\n`;
      const names = players.slice(0, 5).map(p => escMd(p.name)).join(', ');
      msg += `${names}${players.length > 5 ? ` \\+${players.length - 5} more` : ''}\n\n`;
    }
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Type /team \\[name\\] to search another team_`;

  await ctx.reply(msg, { parse_mode: 'MarkdownV2', ...getBackMenu() });
}

module.exports = { handleTeamMenu, handleTeamSearch };
