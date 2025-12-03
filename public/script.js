const query = document.getElementById('query');
const modelSelect = document.getElementById('model');
const execBtn = document.getElementById('exec');
const clearBtn = document.getElementById('clear');
const loading = document.getElementById('loading');
const resultsDiv = document.getElementById('results');
const curlExample = document.getElementById('curl-example');

const API_URL = location.origin + '/api/ai';
curlExample.textContent = `curl ${API_URL} -X POST -H "Content-Type: application/json" -d '{"prompt":"Halo AI","model":"precise"}'`;

let ws = null;
let currentResultDiv = null;

function connect() {
  ws = new WebSocket(API_URL.replace('http', 'ws'));
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'start') {
      showLoading();
      createResultBox(data.prompt);
    }
    if (data.type === 'stream') appendText(data.text);
    if (data.type === 'done') finishResult(data);
    if (data.type === 'error') showError(data.message);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();

function showLoading() {
  loading.classList.remove('hidden');
  execBtn.disabled = true;
}
function hideLoading() {
  loading.classList.add('hidden');
  execBtn.disabled = false;
}

function createResultBox(prompt) {
  currentResultDiv = document.createElement('div');
  currentResultDiv.className = 'result-item';
  currentResultDiv.innerHTML = `
    <div class="meta">Mengetik... (Mode: ${modelSelect.selectedOptions[0].text})</div>
    <button class="copy-btn" onclick="copyLog(this)">Copy</button>
    <pre><strong>Anda:</strong> ${prompt}\n\n<strong>Copilot:</strong> </pre>
  `;
  resultsDiv.prepend(currentResultDiv);
}

function appendText(text) {
  if (!currentResultDiv) return;
  const pre = currentResultDiv.querySelector('pre');
  pre.textContent = pre.textContent.replace(/ $/, '') + text;
}

function finishResult(data) {
  hideLoading();
  if (!currentResultDiv) return;
  const citations = data.citations?.length ? data.citations.map(c => `• <a href="\( {c.url}" target="_blank"> \){c.title}</a>`).join('<br>') : '';
  currentResultDiv.querySelector('.meta').innerHTML = `
    Model: \( {data.metadata.model} | Mode: \){data.metadata.mode} | 
    Latency: \( {data.metadata.latency_ms}ms | \){new Date().toLocaleTimeString('id-ID')}
    \( {data.metadata.citations ? `| \){data.metadata.citations} sumber` : ''}
  `;
  const pre = currentResultDiv.querySelector('pre');
  pre.innerHTML += citations ? '\n\n<b>Sumber:</b>\n' + citations : '';
}

function showError(msg) {
  hideLoading();
  const div = document.createElement('div');
  div.className = 'result-item';
  div.innerHTML = `<pre style="color:#ff6b6b;">Error: ${msg}</pre>`;
  resultsDiv.prepend(div);
}

execBtn.onclick = () => {
  const prompt = query.value.trim();
  if (!prompt) return alert('Isi query dulu!');
  if (!ws || ws.readyState !== WebSocket.OPEN) return alert('Connecting...');

  ws.send(JSON.stringify({
    type: 'query',
    prompt,
    model: modelSelect.value
  }));
  query.value = '';
};

clearBtn.onclick = () => {
  query.value = '';
  resultsDiv.innerHTML = '';
  hideLoading();
};

function copyLog(btn) {
  const text = btn.parentElement.querySelector('pre').textContent;
  navigator.clipboard.writeText(text);
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = 'Copy', 2000);
}

function copyCurl() {
  navigator.clipboard.writeText(curlExample.textContent);
  alert('cURL copied!');
}
