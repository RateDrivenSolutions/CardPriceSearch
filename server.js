const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/search', async (req, res) => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { card, sport, condition, market } = req.body;
  if (!card || card.trim().length < 2) {
    return res.status(400).json({ error: 'Please enter a valid card name' });
  }

  const systemPrompt = `You are an expert trading card price researcher with deep knowledge of Pokemon TCG, NFL, NBA, WWE, and MLB card markets. Always respond in valid JSON only — no markdown, no backticks, no preamble.`;

  const userPrompt = `Research current ${sport || 'trading'} card prices for: "${card}".
Show prices for ${condition || 'all conditions (PSA 10, PSA 9, Near Mint, Lightly Played, Heavily Played)'} on ${market || 'the general collector market'}.
Use web search to find the most current prices. Respond ONLY with this JSON:
{
  "card_name": "Full official card name",
  "set": "Set name and year",
  "rarity": "Card rarity",
  "trend": "up|down|stable",
  "trend_reason": "One sentence explaining the trend",
  "prices": [
    { "condition": "PSA 10 Gem Mint", "value": "$X,XXX", "note": "brief context", "highlight": false },
    { "condition": "PSA 9 Mint", "value": "$XXX", "note": "brief context", "highlight": false },
    { "condition": "Near Mint (raw)", "value": "$XX", "note": "brief context", "highlight": true },
    { "condition": "Lightly Played", "value": "$XX", "note": "brief context", "highlight": false },
    { "condition": "Heavily Played", "value": "$XX", "note": "brief context", "highlight": false }
  ],
  "buy_links": {
    "ebay": "https://www.ebay.com/sch/i.html?_nkw=CARD+NAME",
    "tcgplayer": "https://www.tcgplayer.com/search/pokemon/product?q=CARD+NAME",
    "pricecharting": "https://www.pricecharting.com/search-products?type=prices&q=CARD+NAME",
    "amazon": "https://www.amazon.com/s?k=CARD+NAME+card"
  },
  "analysis": "2-3 sentence market analysis",
  "buy_tip": "One actionable buy or sell tip",
  "data_confidence": "high|medium|low"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'API error' });
    }

    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');

    let parsed;
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : cleaned);
    } catch {
      return res.status(500).json({ error: 'Could not parse response. Try a more specific card name.' });
    }

    return res.json(parsed);

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message || 'Search failed' });
  }
});

// Catch-all: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Card Price Research running on port ${PORT}`));
