const footballApi = require('../services/footballApi');
const { getBackMenu } = require('../utils/menu');
const { Markup } = require('telegraf');

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function handleStandings(ctx) {
  await ctx.answerCbQuery('Loading standings...');
  const loadingMsg = await ctx.reply('📊 Fetching group standings...');

  try {
    const data = await footballApi.getStandings();
    const standings = data.standings || [];

    if (standings.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply('📊 Standings not available yet. Check back once the group stage begins!', getBackMenu());
    }

    // Show group selector buttons
    const groups = standings.filter(s => s.type === 'TOTAL');
    const buttons = [];
    const row = [];

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const groupName = g.group?.replace('GROUP_', 'Group ') || `Group ${i + 1}`;
      row.push(Markup.button.callback(groupName, `group_${i}`));
      if (row.length === 3 || i === groups.length - 1) {
        buttons.push([...row]);
        row.length = 0;
      }
    }
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

    await ctx.deleteMessage(loadingMsg.message_id);

    // Store standings in session-like approach via bot context
    ctx.session = ctx.session || {};
    ctx.session.standings = groups;

    await ctx.reply(
      `📊 *WORLD CUP 2026 GROUP STANDINGS*\n\nSelect a group to view:`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) }
    );

  } catch (err) {
    await ctx.deleteMessage(loadingMsg.message_id);
    console.error('Standings error:', err.message);
    await ctx.reply('⚠️ Could not load standings. Try again.', getBackMenu());
  }
}

async function handleGroupStanding(ctx, groupIndex) {
  await ctx.answerCbQuery();

  try {
    const data = await footballApi.getStandings();
    const standings = data.standings || [];
    const groups = standings.filter(s => s.type === 'TOTAL');
    const group = groups[parseInt(groupIndex)];

    if (!group) return ctx.reply('Group not found.', getBackMenu());

    const groupName = group.group?.replace('GROUP_', 'Group ') || `Group ${parseInt(groupIndex) + 1}`;
    const table = group.table || [];

    let msg = `📊 *${escMd(groupName).toUpperCase()} STANDINGS*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `\`#  Team              P  W  D  L  GD Pts\`\n`;
    msg += `\`─────────────────────────────────────\`\n`;

    for (const row of table) {
      const pos = String(row.position).padEnd(3);
      const team = (row.team?.shortName || row.team?.name || '?').substring(0, 14).padEnd(16);
      const played = String(row.playedGames).padEnd(3);
      const won = String(row.won).padEnd(3);
      const draw = String(row.draw).padEnd(3);
      const lost = String(row.lost).padEnd(3);
      const gd = String(row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference).padEnd(4);
      const pts = String(row.points);

      // Qualification indicator
      let qual = '';
      if (row.position <= 2) qual = '🟢'; // Qualifies
      else if (row.position === 3) qual = '🟡'; // Possible third place
      else qual = '🔴';

      msg += `${qual} \`${pos}${team}${played}${won}${draw}${lost}${gd}${pts}\`\n`;
    }

    msg += `\n🟢 Qualifies \\| 🟡 Possible 3rd \\| 🔴 Eliminated\n`;

    await ctx.editMessageText(msg, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('◀️ Back to Groups', 'standings')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    });

  } catch (err) {
    console.error('Group standing error:', err.message);
    await ctx.reply('⚠️ Could not load group table.', getBackMenu());
  }
}

module.exports = { handleStandings, handleGroupStanding };
