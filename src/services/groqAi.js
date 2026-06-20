const axios = require('axios');
const { askGemini } = require('./geminiAi');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const AI_SYSTEM = `You are CymorBot, an expert World Cup 2026 football analyst for East African fans.
STRICT OUTPUT RULES:
- Plain text ONLY. Zero asterisks, zero underscores, zero markdown symbols at all.
- Emojis are allowed and encouraged.
- Structure your answer clearly with line breaks.
- Be specific, data-driven, and confident.
- Always consider draw probability — many World Cup group games end 0-0 or 1-1.`;

async function askAI(prompt, systemPrompt = '') {
  // Try Groq first, fall back to Gemini
  try {
    const res = await axios.post(
      GROQ_URL,
      {
        model: 'llama-3.1-8b-instant',
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
        timeout: 15000
      }
    );
    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty Groq response');
    return text.trim();
  } catch (groqErr) {
    console.warn('Groq failed, falling back to Gemini:', groqErr.message);
    // Gemini fallback
    return await askGemini(prompt, systemPrompt);
  }
}

// Legacy export so existing code still works
async function askGroq(prompt, systemPrompt = '') {
  return askAI(prompt, systemPrompt);
}

async function predictMatch(homeTeam, awayTeam, homeOdds, awayOdds, drawOdds, h2hData, standingsCtx) {
  const h2hSummary = h2hData ? buildH2HSummary(h2hData, homeTeam, awayTeam) : 'No previous meetings on record';

  const prompt = `World Cup 2026 Match Prediction:

MATCH: ${homeTeam} vs ${awayTeam}

BOOKMAKER ODDS:
${homeTeam} Win: ${homeOdds || 'N/A'}
Draw: ${drawOdds || 'N/A'}
${awayTeam} Win: ${awayOdds || 'N/A'}

HEAD-TO-HEAD HISTORY:
${h2hSummary}

GROUP STANDINGS CONTEXT:
${standingsCtx || 'Not available'}

Give a structured prediction with these exact sections:

VERDICT: [Your final call - Home Win / Draw / Away Win and a one-line reason]

KEY FACTORS:
1. [Tactical or form-based reason]
2. [Historical or statistical reason]
3. [Pressure/motivation/stakes reason]

DRAW RISK: [Low/Medium/High] - [One sentence why draws are or aren't likely here]

BEST BET: [Specific market e.g. "Both teams to score - Yes", "Over 2.5 goals", "Draw or ${homeTeam}" etc]

CONFIDENCE: [50-95]% - [One sentence justification]

Plain text only. No asterisks or markdown.`;

  return askAI(prompt, AI_SYSTEM);
}

async function analyzeH2H(homeTeam, awayTeam, h2hData) {
  const summary = buildH2HSummary(h2hData, homeTeam, awayTeam);

  const prompt = `Head-to-Head analysis for World Cup 2026: ${homeTeam} vs ${awayTeam}

Historical data: ${summary}

Analyze: dominant team overall, goal patterns, how often they draw, psychological edge going into this World Cup game, and what history tells us about the likely result.

Plain text only, no markdown or asterisks.`;

  return askAI(prompt, AI_SYSTEM);
}

function buildH2HSummary(h2hData, homeTeam, awayTeam) {
  const matches = h2hData?.matches || [];
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

    if (winner === 'DRAW') draws++;
    else if (
      (winner === 'HOME_TEAM' && isHomeAsHome) ||
      (winner === 'AWAY_TEAM' && !isHomeAsHome)
    ) homeWins++;
    else awayWins++;

    homeGoalsTotal += isHomeAsHome ? hg : ag;
    awayGoalsTotal += isHomeAsHome ? ag : hg;

    return `${mHome} ${hg}-${ag} ${mAway} (${date}, ${comp})`;
  });

  const total = homeWins + awayWins + draws;
  return `${total} meetings total. ${homeTeam}: ${homeWins}W / ${draws}D / ${awayWins}W ${awayTeam}. ` +
    `Goals scored: ${homeTeam} ${homeGoalsTotal}, ${awayTeam} ${awayGoalsTotal}. ` +
    `Last 5 results: ${recent.slice(0, 5).join(' | ')}`;
}

module.exports = {
  askGroq,
  askAI,
  predictMatch,
  analyzeH2H,
  buildH2HSummary
};
