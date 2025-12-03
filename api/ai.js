import { WebSocketServer } from 'ws';
import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = app.listen(process.env.PORT || 3000);
const wss = new WebSocketServer({ server, path: '/api/ai' });

app.use(express.json());
app.use(express.static('public'));

console.log('Api\'s AI by aka - Copilot Live');

const MODE_MAP = {
  'balanced': 'chat',
  'creative': 'smart',
  'precise': 'reasoning'
};

class Copilot {
  constructor() {
    this.conversationId = null;
    this.headers = {
      'origin': 'https://copilot.microsoft.com',
      'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36',
      'accept': '*/*',
      'accept-language': 'id-ID,id;q=0.9',
      'sec-websocket-extensions': 'permessage-deflate; client_max_window_bits'
    };
  }

  async createConversation() {
    try {
      const { data } = await axios.post('https://copilot.microsoft.com/c/api/conversations', null, {
        headers: this.headers,
        timeout: 10000
      });
      this.conversationId = data.id;
    } catch (e) {
      this.conversationId = 'tmp_' + uuidv4();
    }
  }

  async *stream(message, mode = 'balanced') {
    if (!this.conversationId) await this.createConversation();
    const wsUrl = 'wss://copilot.microsoft.com/c/api/chat?api-version=2&features=-,ncedge&ncedge=1';
    const ws = new WebSocket(wsUrl, { headers: this.headers });

    let fullText = '';
    let citations = [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ event: 'setOptions', supportedFeatures: ['partial-generated-images'] }));
      ws.send(JSON.stringify({
        event: 'send',
        mode: MODE_MAP[mode] || 'chat',
        conversationId: this.conversationId,
        content: [{ type: 'text', text: message }],
        context: {}
      }));
    });

    for await (const chunk of this.onMessage(ws)) {
      if (controller.signal.aborted) break;
      const data = chunk.toString();
      for (const line of data.split('\n').filter(Boolean)) {
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          if (parsed.event === 'appendText') {
            fullText += parsed.text || '';
            yield { type: 'text', text: parsed.text || '' };
          }
          if (parsed.event === 'citation') {
            citations.push({ title: parsed.title, url: parsed.url });
          }
          if (parsed.event === 'done') {
            clearTimeout(timeout);
            yield { type: 'done', text: fullText, citations };
            ws.close();
            return;
          }
          if (parsed.event === 'error') {
            yield { type: 'error', message: parsed.message || 'Copilot error' };
            ws.close();
            return;
          }
        } catch (e) { /* ignore */ }
      }
    }
  }

  onMessage(ws) {
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise((resolve, reject) => {
          ws.once('message', data => resolve({ value: data, done: false }));
          ws.once('close', () => resolve({ done: true }));
          ws.once('error', reject);
        })
      })
    };
  }
}

// WebSocket untuk frontend (streaming + loading)
wss.on('connection', (ws) => {
  let currentCopilot = null;

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type !== 'query') return;

      currentCopilot?.abort?.();
      currentCopilot = new Copilot();

      const start = Date.now();
      ws.send(JSON.stringify({ type: 'start', prompt: msg.prompt }));

      let fullText = '';
      for await (const chunk of currentCopilot.stream(msg.prompt, msg.model)) {
        if (chunk.type === 'text') {
          fullText += chunk.text;
          ws.send(JSON.stringify({ type: 'stream', text: chunk.text }));
        }
        if (chunk.type === 'done') {
          ws.send(JSON.stringify({
            type: 'done',
            response: fullText,
            citations: chunk.citations,
            metadata: {
              model: 'Microsoft Copilot (GPT-4o)',
              mode: msg.model,
              latency_ms: Date.now() - start,
              timestamp: new Date().toISOString(),
              citations: chunk.citations.length
            }
          }));
        }
        if (chunk.type === 'error') {
          ws.send(JSON.stringify({ type: 'error', message: chunk.message }));
        }
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  });

  ws.on('close', () => { currentCopilot?.abort?.(); });
});

// HTTP API (cURL)
app.post('/api/ai', async (req, res) => {
  try {
    const { prompt, model = 'balanced' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const copilot = new Copilot();
    const start = Date.now();
    let fullText = '';
    let citations = [];

    for await (const chunk of copilot.stream(prompt, model)) {
      if (chunk.type === 'text') fullText += chunk.text;
      if (chunk.type === 'citation') citations.push(chunk);
      if (chunk.type === 'done') {
        return res.json({
          success: true,
          prompt,
          response: fullText,
          citations,
          metadata: {
            model: 'Microsoft Copilot',
            mode: model,
            latency_ms: Date.now() - start,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
