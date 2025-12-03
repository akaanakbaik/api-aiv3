const query = document.getElementById('query');
const execBtn = document.getElementById('exec');
const clearBtn = document.getElementById('clear');
const resultsDiv = document.getElementById('results');
const curlExample = document.getElementById('curl-example');

const API_URL = location.origin + '/api/ai';
curlExample.textContent = `curl ${API_URL} \\
  -X POST \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Halo AI"}'`;

let ws;

function connectWS() {
  ws = new WebSocket(API_URL.replace('http', 'ws'));
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'result') showResult(data);
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}
connectWS();

function showResult(data) {
  const div = document.createElement('div');
  div.className = 'result-item';
  const meta = `
<span class="meta">
Model: \( {data.model} | Latency: \){data.latency}ms | Time: ${new Date(data.timestamp).toLocaleString('id-ID')}
</span>
<button class="copy-btn" onclick="copyText(this)">Copy</button>
<pre>${data.response}</pre>`;
  div.innerHTML = meta;
  resultsDiv.prepend(div);
}

execBtn.onclick = () => {
  const prompt = query.value.trim();
  if (!prompt) return alert("Isi query dulu!");

  ws.send(JSON.stringify({ type: 'query', prompt, timestamp: Date.now() }));
  query.value = '';
};

clearBtn.onclick = () => {
  query.value = '';
  resultsDiv.innerHTML = '';
};

function copyText(btn) {
  const text = btn.nextElementSibling.textContent;
  navigator.clipboard.writeText(text);
  btn.textContent = "Copied!";
  setTimeout(() => btn.textContent = "Copy", 2000);
}

function copyCurl() {
  navigator.clipboard.writeText(curlExample.textContent);
  alert("CURL copied!");
}
