const axios = require('axios');

const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

async function askGemini(prompt, systemPrompt = '') {
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  let lastErr;
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await axios.post(
        `${url}?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 800
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000
        }
      );

      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error(`No response from Gemini (${model})`);
      return text.trim();
    } catch (err) {
      lastErr = err;
      console.warn(`Gemini model ${model} failed:`, err.response?.data?.error?.message || err.message);
      // Try next model in list (handles future deprecations gracefully)
    }
  }
  throw lastErr;
}

module.exports = { askGemini };
