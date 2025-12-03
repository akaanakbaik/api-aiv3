import { WebSocketServer } from 'ws';
import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';

const app = express();
const server = app.listen(process.env.PORT || 3000);
const wss = new WebSocketServer({ server, path: '/api/ai' });

app.use(express.json());
app.use(express.static('public'));

console.log('Api\'s AI by aka - Copilot Scraper Ready');

class Copilot {
  constructor() {
    this.conversationId = null;
    this.headers = {
      origin: 'https://copilot.microsoft.com',
      'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36',
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'accept-encoding': 'gzip, deflate, br',
      'sec-websocket-version': 13,
      'sec-websocket-key': uuidv4().replace(/-/g, '').substring(0, 24)
    };
  }

  async createConversation() {
    try {
      const { data } = await axios.post('https://copilot.microsoft.com/c/api/conversations', null, {
        headers: this.headers,
        timeout: 10000
      });
      this.conversationId = data.id;
      return data.id;
    } catch (err) {
      console.error('Create conv error:', err.message);
      this.conversationId = 'temp-' + uuidv4();
      return this.conversationId;
    }
  }

  async chat(message, model = 'default') {
    if (!this.conversationId) await this.createConversation();

    const models = { default: 'chat', 'think-deeper': 'reasoning', 'gpt-5': 'smart' };
    const mode = models[model] || 'chat';

    return new Promise((resolve, reject) => {
      const wsUrl = `wss://copilot.microsoft.com/c/api/chat?api-version=2&features=-,ncedge,edgepagecontext&setflight=-,ncedge,edgepagecontext&ncedge=1`;
      const ws = new WebSocket(wsUrl, { headers: this.headers });

      const response = { text: '', citations: [], model: 'Copilot (GPT-4)' };
      let timeout = setTimeout(() => {
        ws.close();
        resolve({ ...response, text: response.text || '[Timeout] Copilot sedang sibuk...' });
      }, 45000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          event: 'setOptions',
          supportedFeatures: ['partial-generated-images'],
          supportedCards: ['weather', 'local', 'image', 'sports', 'video', 'ads', 'safetyHelpline', 'quiz', 'finance', 'recipe'],
          ads: { supportedTypes: ['text', 'product', 'multimedia', 'tourActivity', 'propertyPromotion'] }
        }));

        ws.send(JSON.stringify({
          event: 'send',
          mode,
          conversationId: this.conversationId,
          content: [{ type: 'text', text: message }],
          context: {}
        }));
      });

      ws.on('message', (chunk) => {
        try {
          const text = chunk.toString();
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const jsonStr = line.slice(5).trim();
              if (jsonStr === '[DONE]') continue;
              const parsed = JSON.parse(jsonStr);
              switch (parsed.event) {
                case 'appendText':
                  response.text += parsed.text || '';
                  break;
                case 'citation':
                  response.citations.push({ title: parsed.title, url: parsed.url });
                  break;
                case 'done':
                  clearTimeout(timeout);
                  resolve(response);
                  ws.close();
                  break;
                case 'error':
                  clearTimeout(timeout);
                  reject(new Error(parsed.message || 'Copilot error'));
                  ws.close();
                  break;
              }
            }
          }
        } catch (e) {
          // ignore parse error
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        if (!response.text) {
          resolve({ ...response, text: response.text || '[Disconnected] Coba lagi...' });
        }
      });
    });
  }
}

// WebSocket untuk frontend real-time
wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'query') {
        const start = Date.now();
        const copilot = new Copilot();
        const result = await copilot.chat(msg.prompt, msg.model || 'default');
        const latency = Date.now() - start;

        ws.send(JSON.stringify({
          type: 'result',
          prompt: msg.prompt,
          response: result.text.trim(),
          citations: result.citations,
          metadata: {
            model: result.model,
            mode: msg.model || 'default',
            latency_ms: latency,
            timestamp: new Date().toISOString(),
            source: 'Microsoft Copilot (WebSocket Scraper)',
            citations_count: result.citations.length
          }
        }));
      }
    } catch (e) {
      ws.send(JSON.stringify({
        type: 'error',
        message: e.message || 'Unknown error'
      }));
    }
  });
});

// HTTP API untuk cURL
app.post('/api/ai', async (req, res) => {
  try {
    const { prompt, model = 'default' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const start = Date.now();
    const copilot = new Copilot();
    const result = await copilot.chat(prompt, model);
    const latency = Date.now() - start;

    res.json({
      success: true,
      prompt,
      response: result.text.trim(),
      citations: result.citations,
      metadata: {
        model: result.model,
        mode: model,
        latency_ms: latency,
        timestamp: new Date().toISOString(),
        source: 'https://api-by-aka.vercel.app'
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Copilot tidak merespon' });
  }
});

app.get('*', (req, res) => res.sendFile('index.html', { root: 'public' }));
