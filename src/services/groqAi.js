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
      max_tokens: 600,
      temperature: 0.7
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
  return res.data.choices[0].message.content;
}

const AI_SYSTEM = `You are CymorBot, a World Cup 2026 football analyst bot owned by Legendary Smiley Cymor.
You give sharp, confident football predictions and analysis.
Keep responses concise, punchy, and formatted for Telegram (plain text, no markdown symbols except emojis).
Always include:
- A clear prediction (who wins or draw)
- Key reasons (2-3 bullet points max)
- A confidence level (High/Medium/Low)
- A recommended bet market
Be direct. East African fans love confident analysis.`;

async function predictMatch(homeTeam, awayTeam, homeOdds, awayOdds, drawOdds, h2hData) {
  const h2hSummary = h2hData ? buildH2HSummary(h2hData, homeTeam, awayTeam) : 'No H2H data available';

  const prompt = `World Cup 2026 Match Prediction:
${homeTeam} vs ${awayTeam}

Current Odds:
- ${homeTeam} Win: ${homeOdds || 'N/A'}
- Draw: ${drawOdds || 'N/A'}  
- ${awayTeam} Win: ${awayOdds || 'N/A'}

Head-to-Head History: ${h2hSummary}

Give your prediction and analysis. Be specific and confident.`;

  return askGroq(prompt, AI_SYSTEM);
}

async function generateHotPicks(picks) {
  if (!picks || picks.length === 0) return 'No picks available at the moment.';

  const picksSummary = picks.map((p, i) =>
    `${i + 1}. ${p.home} vs ${p.away} → Pick: ${p.pick} @ ${p.odds}`
  ).join('\n');

  const prompt = `These are today's top World Cup 2026 value picks based on odds data:
${picksSummary}

For each pick, give a confident reason why this is the right bet (1-2 sentences each). Be sharp and analytical.`;

  return askGroq(prompt, AI_SYSTEM);
}

async function analyzeH2H(homeTeam, awayTeam, h2hData) {
  const summary = buildH2HSummary(h2hData, homeTeam, awayTeam);

  const prompt = `Head-to-Head analysis for World Cup 2026:
${homeTeam} vs ${awayTeam}

Historical meetings: ${summary}

Give a detailed H2H analysis: who dominates, patterns, and what it means for this World Cup match.`;

  return askGroq(prompt, AI_SYSTEM);
}

function buildH2HSummary(h2hData, homeTeam, awayTeam) {
  const matches = h2hData.matches || [];
  if (matches.length === 0) return 'No previous meetings found';

  let homeWins = 0, awayWins = 0, draws = 0;
  const recent = matches.slice(0, 5).map(m => {
    const home = m.homeTeam?.name;
    const away = m.awayTeam?.name;
    const hg = m.score?.fullTime?.home ?? '?';
    const ag = m.score?.fullTime?.away ?? '?';
    const winner = m.score?.winner;

    if (winner === 'HOME_TEAM') {
      if (home === homeTeam) homeWins++; else awayWins++;
    } else if (winner === 'AWAY_TEAM') {
      if (away === awayTeam) awayWins++; else homeWins++;
    } else {
      draws++;
    }

    return `${home} ${hg}-${ag} ${away} (${m.utcDate?.split('T')[0] || 'N/A'})`;
  });

  return `Last ${recent.length} meetings: ${homeWins}W-${draws}D-${awayWins}L for ${homeTeam}. Recent: ${recent.join(', ')}`;
}

module.exports = {
  askGroq,
  predictMatch,
  generateHotPicks,
  analyzeH2H,
  buildH2HSummary
};
