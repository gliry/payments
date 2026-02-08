// ============================================================================
// Screen: API Explorer
// ============================================================================

import * as state from '../state.js';
import { apiCall } from '../api.js';

let container;
let selectedEndpoint = null;
let responseData = null;
let responseStatus = null;
let responseDuration = null;

const ENDPOINTS = {
  'Auth': [
    { method: 'POST', path: '/v1/auth/register', body: '{\n  "username": "demo",\n  "credentialId": "cred_123",\n  "publicKey": "pk_123"\n}' },
    { method: 'POST', path: '/v1/auth/login', body: '{\n  "username": "demo",\n  "credentialId": "cred_123"\n}' },
    { method: 'GET', path: '/v1/auth/me', body: null },
  ],
  'Wallet': [
    { method: 'GET', path: '/v1/wallet', body: null },
    { method: 'GET', path: '/v1/wallet/balances', body: null },
    { method: 'POST', path: '/v1/wallet/delegate', body: '{\n  "chain": "base"\n}' },
    { method: 'POST', path: '/v1/wallet/delegate/submit', body: '{\n  "chain": "base",\n  "txHash": "0x..."\n}' },
    { method: 'POST', path: '/v1/wallet/withdraw', body: '{\n  "chain": "base",\n  "amount": "100"\n}' },
  ],
  'Operations': [
    { method: 'POST', path: '/v1/operations/send', body: '{\n  "destinationAddress": "0x...",\n  "destinationChain": "base",\n  "amount": "100",\n  "sourceChain": "base"\n}' },
    { method: 'POST', path: '/v1/operations/collect', body: '{\n  "sourceChains": ["arbitrum", "polygon"],\n  "destination": "base"\n}' },
    { method: 'POST', path: '/v1/operations/bridge', body: '{\n  "sourceChain": "base",\n  "destinationChain": "arbitrum",\n  "amount": "100"\n}' },
    { method: 'POST', path: '/v1/operations/batch-send', body: '{\n  "recipients": [\n    {"address": "0x...", "chain": "base", "amount": "50"},\n    {"address": "0x...", "chain": "arbitrum", "amount": "30"}\n  ],\n  "sourceChain": "base"\n}' },
    { method: 'GET', path: '/v1/operations', body: null },
    { method: 'GET', path: '/v1/operations/:id', body: null },
    { method: 'POST', path: '/v1/operations/:id/submit', body: '{\n  "signatures": ["0x..."]\n}' },
  ],
  'Webhooks': [
    { method: 'POST', path: '/v1/webhooks', body: '{\n  "url": "https://example.com/webhook",\n  "events": ["operation.completed", "operation.failed"]\n}' },
    { method: 'GET', path: '/v1/webhooks', body: null },
    { method: 'DELETE', path: '/v1/webhooks/:id', body: null },
  ],
};

function render() {
  const apiLog = window.__apiLog || [];

  container.innerHTML = `
    <div class="api-columns">
      <!-- Left: Request Builder -->
      <div>
        <div class="card" style="margin-bottom: 24px;">
          <h4 style="margin-bottom: 16px;">Request Builder</h4>

          <!-- Endpoint selector -->
          <div class="input-group" style="margin-bottom: 16px;">
            <label class="input-label">Endpoint</label>
            <select id="api-endpoint" class="select">
              <option value="">Select an endpoint...</option>
              ${Object.entries(ENDPOINTS).map(([group, eps]) =>
                `<optgroup label="${group}">
                  ${eps.map((ep, i) => `<option value="${group}:${i}">${ep.method} ${ep.path}</option>`).join('')}
                </optgroup>`
              ).join('')}
            </select>
          </div>

          <!-- URL display -->
          <div id="api-url-display" style="display: none; margin-bottom: 16px;">
            <div class="flex items-center gap-8">
              <span id="api-method-badge" class="method-badge"></span>
              <code id="api-url" class="text-mono text-sm" style="flex: 1;"></code>
            </div>
          </div>

          <!-- Request body -->
          <div id="api-body-group" class="input-group" style="display: none; margin-bottom: 16px;">
            <label class="input-label">Request Body</label>
            <textarea id="api-body" class="input input--mono" rows="8"></textarea>
          </div>

          <button id="api-send-btn" class="btn btn--primary btn--full" ${selectedEndpoint ? '' : 'disabled'}>Send Request</button>
        </div>
      </div>

      <!-- Right: Response -->
      <div>
        <div class="card" style="margin-bottom: 24px;">
          <div class="flex items-center justify-between" style="margin-bottom: 16px;">
            <h4>Response</h4>
            <div class="flex items-center gap-12">
              ${responseStatus ? `<span class="api-log__status api-log__status--${responseStatus < 400 ? '2xx' : responseStatus < 500 ? '4xx' : '5xx'}">${responseStatus}</span>` : ''}
              ${responseDuration ? `<span class="text-xs text-muted">${responseDuration}ms</span>` : ''}
            </div>
          </div>
          ${responseData
            ? `<div class="code-block">
                <div class="code-block__header">
                  <div class="code-block__dots"><span></span><span></span><span></span></div>
                  <span style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">response.json</span>
                </div>
                <div class="code-block__body">${syntaxHighlight(JSON.stringify(responseData, null, 2))}</div>
              </div>`
            : `<div class="empty-state" style="padding: 32px;">
                <div class="empty-state__desc">Send a request to see the response</div>
              </div>`
          }
        </div>

        <!-- Code snippets -->
        ${selectedEndpoint ? renderCodeSnippets() : ''}
      </div>
    </div>

    <!-- Live API Log -->
    <div class="card" style="margin-top: 24px;">
      <div class="flex items-center justify-between" style="margin-bottom: 16px;">
        <h4>Live API Log</h4>
        <span class="text-xs text-muted">${apiLog.length} calls</span>
      </div>
      <div class="api-log">
        ${apiLog.length === 0
          ? `<div class="empty-state" style="padding: 24px;"><div class="empty-state__desc">API calls will appear here as you use the app</div></div>`
          : apiLog.slice(0, 20).map(entry => `
            <div class="api-log__entry" data-log-id="${entry.id}">
              <span class="api-log__time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span class="method-badge method-badge--${entry.method.toLowerCase()}">${entry.method}</span>
              <span class="api-log__url">${entry.path}</span>
              <span class="api-log__status api-log__status--${entry.status < 400 ? '2xx' : entry.status < 500 ? '4xx' : '5xx'}">${entry.status}</span>
              <span class="text-xs text-muted">${entry.duration}ms</span>
            </div>
          `).join('')
        }
      </div>
    </div>
  `;

  setupListeners();
}

function renderCodeSnippets() {
  if (!selectedEndpoint) return '';
  const ep = selectedEndpoint;
  const url = `https://omniflow.up.railway.app${ep.path}`;

  const authHeader = '-H "Authorization: Bearer YOUR_TOKEN"';

  const curlCmd = ep.method === 'GET'
    ? `curl ${url} \\
  ${authHeader}`
    : `curl -X ${ep.method} ${url} \\
  -H "Content-Type: application/json" \\
  ${authHeader} \\
  -d '${(ep.body || '{}').replace(/\n\s*/g, ' ')}'`;

  const jsCode = ep.method === 'GET'
    ? `const res = await fetch("${url}", {
  headers: { "Authorization": "Bearer TOKEN" },
});
const data = await res.json();`
    : `const res = await fetch("${url}", {
  method: "${ep.method}",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer TOKEN",
  },
  body: JSON.stringify(${(ep.body || '{}').replace(/\n\s*/g, ' ')}),
});
const data = await res.json();`;

  const pyCode = ep.method === 'GET'
    ? `import requests
res = requests.get("${url}",
    headers={"Authorization": "Bearer TOKEN"})
data = res.json()`
    : `import requests
res = requests.${ep.method.toLowerCase()}(
    "${url}",
    headers={"Authorization": "Bearer TOKEN"},
    json=${(ep.body || '{}').replace(/\n\s*/g, ' ')}
)
data = res.json()`;

  return `
    <div class="card">
      <div class="tabs" style="margin-bottom: 16px;">
        <button class="tab active" data-snippet="curl">cURL</button>
        <button class="tab" data-snippet="js">JavaScript</button>
        <button class="tab" data-snippet="py">Python</button>
      </div>
      <div id="snippet-curl" class="code-block">
        <div class="code-block__body">${escapeHtml(curlCmd)}</div>
      </div>
      <div id="snippet-js" class="code-block" style="display:none;">
        <div class="code-block__body">${escapeHtml(jsCode)}</div>
      </div>
      <div id="snippet-py" class="code-block" style="display:none;">
        <div class="code-block__body">${escapeHtml(pyCode)}</div>
      </div>
    </div>
  `;
}

function setupListeners() {
  const endpointSelect = document.getElementById('api-endpoint');
  const bodyGroup = document.getElementById('api-body-group');
  const bodyInput = document.getElementById('api-body');
  const urlDisplay = document.getElementById('api-url-display');
  const methodBadge = document.getElementById('api-method-badge');
  const urlEl = document.getElementById('api-url');
  const sendBtn = document.getElementById('api-send-btn');

  // Restore selected endpoint state after re-render
  if (selectedEndpoint && endpointSelect) {
    // Find the matching option value
    for (const [group, eps] of Object.entries(ENDPOINTS)) {
      const idx = eps.findIndex(ep => ep.method === selectedEndpoint.method && ep.path === selectedEndpoint.path);
      if (idx !== -1) {
        endpointSelect.value = `${group}:${idx}`;
        break;
      }
    }

    methodBadge.className = `method-badge method-badge--${selectedEndpoint.method.toLowerCase()}`;
    methodBadge.textContent = selectedEndpoint.method;
    urlEl.textContent = `https://omniflow.up.railway.app${selectedEndpoint.path}`;
    urlDisplay.style.display = 'flex';

    if (selectedEndpoint.body && selectedEndpoint.method !== 'GET') {
      bodyGroup.style.display = 'block';
      bodyInput.value = selectedEndpoint.body;
    } else {
      bodyGroup.style.display = 'none';
    }
  }

  endpointSelect?.addEventListener('change', () => {
    const val = endpointSelect.value;
    if (!val) {
      selectedEndpoint = null;
      urlDisplay.style.display = 'none';
      bodyGroup.style.display = 'none';
      sendBtn.disabled = true;
      return;
    }

    const [group, index] = val.split(':');
    const ep = ENDPOINTS[group][parseInt(index)];
    selectedEndpoint = { ...ep };

    methodBadge.className = `method-badge method-badge--${ep.method.toLowerCase()}`;
    methodBadge.textContent = ep.method;
    urlEl.textContent = `https://omniflow.up.railway.app${ep.path}`;
    urlDisplay.style.display = 'flex';

    if (ep.body && ep.method !== 'GET') {
      bodyGroup.style.display = 'block';
      bodyInput.value = ep.body;
    } else {
      bodyGroup.style.display = 'none';
    }

    sendBtn.disabled = false;
    render(); // Re-render for code snippets
  });

  sendBtn?.addEventListener('click', async () => {
    if (!selectedEndpoint) return;

    sendBtn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Sending...';
    sendBtn.disabled = true;

    const body = bodyInput?.value ? JSON.parse(bodyInput.value) : null;
    const startTime = performance.now();

    try {
      const result = await apiCall(selectedEndpoint.method, selectedEndpoint.path, body);
      responseData = result;
      responseStatus = 200;
    } catch (err) {
      responseData = err.data || { error: err.message };
      responseStatus = err.status || 500;
    }

    responseDuration = Math.round(performance.now() - startTime);
    render();
  });

  // Snippet tabs
  container.querySelectorAll('[data-snippet]').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('[data-snippet]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      ['curl', 'js', 'py'].forEach(s => {
        const el = document.getElementById(`snippet-${s}`);
        if (el) el.style.display = s === tab.dataset.snippet ? 'block' : 'none';
      });
    });
  });

  // Log entry click
  container.querySelectorAll('.api-log__entry').forEach(entry => {
    entry.addEventListener('click', () => {
      const logEntry = (window.__apiLog || []).find(e => e.id === entry.dataset.logId);
      if (logEntry) {
        responseData = logEntry.response;
        responseStatus = logEntry.status;
        responseDuration = logEntry.duration;
        render();
      }
    });
  });
}

function syntaxHighlight(json) {
  return escapeHtml(json)
    .replace(/"([^"]+)":/g, '<span style="color: #93c5fd;">"$1"</span>:')
    .replace(/: "([^"]+)"/g, ': <span style="color: #86efac;">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span style="color: #fde68a;">$1</span>')
    .replace(/: (true|false|null)/g, ': <span style="color: #c4b5fd;">$1</span>');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function init() {
  container = document.getElementById('api-content');

  // Listen for new API calls to refresh log
  window.addEventListener('api-log', () => {
    if (document.getElementById('screen-api')?.classList.contains('active')) {
      render();
    }
  });
}

export function show() {
  document.getElementById('header-title').textContent = 'API Explorer';
  render();
}

export function hide() {}
