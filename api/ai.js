import { WebSocketServer } from 'ws';
import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';

const app = express();
const server = app.listen(process.env.PORT || 3000);
const wss = new WebSocketServer({ server, path: '/api/ai' });

console.log('AI API WebSocket server running...');

// Scraper AI gratis (contoh: Blackbox AI atau yang lain)
async function getAIResponse(prompt) {
  try {
    const response = await axios.post('https://www.blackbox.ai/api/chat', {
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4o"
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data;
  } catch (e) {
    return `Error: ${e.message}\nUsing fallback scraper...`;
  }
}

wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'query') {
      const result = await getAIResponse(msg.prompt);
      ws.send(JSON.stringify({
        type: 'result',
        prompt: msg.prompt,
        response: result,
        timestamp: new Date().toISOString(),
        model: "Blackbox AI (free)",
        latency: Date.now() - msg.timestamp
      }));
    }
  });

  ws.send(JSON.stringify({ type: 'connected' }));
});

// Fallback HTTP untuk curl
app.post('/api/ai', express.json(), async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  const result = await getAIResponse(prompt);
  res.json({
    prompt,
    response: result,
    timestamp: new Date().toISOString(),
    model: "Blackbox AI (free)",
    source: "https://api-by-aka.vercel.app"
  });
});

app.get('/', (req, res) => res.sendFile('index.html', { root: 'public' }));
