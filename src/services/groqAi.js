const axios = require('axios');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function askGroq(prompt, systemPrompt = '') {
  const res = await axios.post(
    GROQ_URL,
    {
      model: 'llama3-8b-8192',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.5
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );
  return res.data.choices[0].message.content;
}

const AI_SYSTEM = `You are CymorBot, an expert World Cup 2026 football analyst owned by Legendary Smiley Cymor.
You give precise, data-driven predictions for East African football fans.
CRITICAL RULES:
- Output ONLY plain text. NO asterisks, NO underscores, NO markdown symbols. Emojis are fine.
- Be specific: reference actual team strengths, recent WC form, tactical matchups, and draw probability
- World Cup 2026 group stage has seen MANY draws - always weigh this seriously
- Structure every prediction with: Verdict, Key Factors (3 points), Draw Risk, Recommended Bet
- Be direct and confident. Never be vague.`;

async function predictMatch(homeTeam, awayTeam, homeOdds, awayOdds, drawOdds, h2hData, standings) {
  const h2hSummary = h2hData ? buildH2HSummary(h2hData, homeTeam, awayTeam) : 'No previous meetings';
  const standingsSummary = standings || 'Group standings not available';

  const prompt = `World Cup 2026 Match Prediction Request:

Match: ${homeTeam} vs ${awayTeam}

MARKET ODDS (bookmakers consensus):
- ${homeTeam} Win: ${homeOdds || 'N/A'}
- Draw: ${drawOdds || 'N/A'}
- ${awayTeam} Win: ${awayOdds || 'N/A'}

HEAD-TO-HEAD HISTORY:
${h2hSummary}

GROUP STAGE CONTEXT:
${standingsSummary}

TASK: Give a structured prediction covering:
1. VERDICT: Your final prediction (Home Win / Draw / Away Win) and WHY
2. KEY FACTORS: 3 specific tactical/form/historical reasons
3. DRAW RISK: Honest assessment - many WC group games end in draws, is this one?
4. BEST BET: Specific market recommendation (1X2, both teams to score, over/under, etc.)
5. CONFIDENCE: High / Medium / Low with brief justification

Remember: plain text only, no markdown, be analytical not generic.`;

  return askGroq(prompt, AI_SYSTEM);
}

async function generateHotPicks(picks) {
  if (!picks || picks.length === 0) return 'No picks available at the moment.';

  const picksSummary = picks.map((p, i) =>
    `Pick ${i + 1}: ${p.home} vs ${p.away} - Recommended: ${p.pick} (${p.outcome}) at odds ${p.odds}`
  ).join('\n');

  const prompt = `Today's World Cup 2026 hot picks based on odds analysis:
${picksSummary}

For each pick, give 2 sharp bullet points explaining WHY this is the right call.
Consider: team quality gap, World Cup draw tendency, tactical matchup, odds value.
Plain text only, no markdown symbols.`;

  return askGroq(prompt, AI_SYSTEM);
}

async function analyzeH2H(homeTeam, awayTeam, h2hData) {
  const summary = buildH2HSummary(h2hData, homeTeam, awayTeam);

  const prompt = `Head-to-Head analysis for World Cup 2026:
${homeTeam} vs ${awayTeam}

Historical data: ${summary}

Analyze: dominant team, goal patterns, tendency for draws, psychological edge, and what history suggests for this World Cup meeting.
Plain text only, no markdown.`;

  return askGroq(prompt, AI_SYSTEM);
}

function buildH2HSummary(h2hData, homeTeam, awayTeam) {
  const matches = h2hData.matches || [];
  if (matches.length === 0) return 'No previous meetings on record';

  let homeWins = 0, awayWins = 0, draws = 0;
  let homeGoalsTotal = 0, awayGoalsTotal = 0;

  const recent = matches.slice(0, 8).map(m => {
    const mHome = m.homeTeam?.name || '?';
    const mAway = m.awayTeam?.name || '?';
    const hg = m.score?.fullTime?.home ?? 0;
    const ag = m.score?.fullTime?.away ?? 0;
    const winner = m.score?.winner;
    const comp = m.competition?.name || '';
    const date = m.utcDate?.split('T')[0] || '';

    const isHomeAsHome = mHome === homeTeam;
    if (winner === 'DRAW') {
      draws++;
    } else if (
      (winner === 'HOME_TEAM' && isHomeAsHome) ||
      (winner === 'AWAY_TEAM' && !isHomeAsHome)
    ) {
      homeWins++;
    } else {
      awayWins++;
    }

    homeGoalsTotal += isHomeAsHome ? hg : ag;
    awayGoalsTotal += isHomeAsHome ? ag : hg;

    return `${mHome} ${hg}-${ag} ${mAway} (${date}, ${comp})`;
  });

  const total = homeWins + awayWins + draws;
  return `${total} meetings: ${homeTeam} ${homeWins}W / ${draws}D / ${awayWins}W ${awayTeam}. ` +
    `Goals: ${homeTeam} scored ${homeGoalsTotal}, ${awayTeam} scored ${awayGoalsTotal}. ` +
    `Recent: ${recent.slice(0, 5).join(' | ')}`;
}

module.exports = {
  askGroq,
  predictMatch,
  generateHotPicks,
  analyzeH2H,
  buildH2HSummary
};
