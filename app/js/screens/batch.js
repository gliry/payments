// ============================================================================
// Screen: Batch Send — THE KILLER FEATURE
// ============================================================================

import * as state from '../state.js';
import { wallet, operations } from '../api.js';
import { formatUSDC, formatAddress, getChainMeta, getChainSVG, isValidAddress, getAllChains, getOpTypeLabel } from '../utils.js';
import { showToast } from '../components/toast.js';
import { statusBadge } from '../components/status-badge.js';
import { chainBadge } from '../components/chain-icon.js';
import { navigate } from '../app.js';

let container;
let balance = 0;
let rows = [];
let activeTab = 'manual';
let executionState = null; // null | 'executing' | 'done'
let batchResult = null;

const TEMPLATES = {
  payroll: {
    name: 'Payroll',
    desc: '5 employees across 5 chains',
    rows: [
      { address: '0xA1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0', chain: 'base', amount: '3500' },
      { address: '0xB2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1', chain: 'arbitrum', amount: '4200' },
      { address: '0xC3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2', chain: 'polygon', amount: '2800' },
      { address: '0xD4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3', chain: 'ethereum', amount: '5000' },
      { address: '0xE5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4', chain: 'avalanche', amount: '1500' },
    ],
  },
  vendors: {
    name: 'Vendor Payments',
    desc: '3 vendors, different amounts',
    rows: [
      { address: '0xF6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5', chain: 'base', amount: '12000' },
      { address: '0xA7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6', chain: 'arbitrum', amount: '8500' },
      { address: '0xB8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7', chain: 'polygon', amount: '3200' },
    ],
  },
  airdrop: {
    name: 'Airdrop',
    desc: '8 recipients, same amount',
    rows: [
      { address: '0x1111111111111111111111111111111111111111', chain: 'base', amount: '100' },
      { address: '0x2222222222222222222222222222222222222222', chain: 'arbitrum', amount: '100' },
      { address: '0x3333333333333333333333333333333333333333', chain: 'polygon', amount: '100' },
      { address: '0x4444444444444444444444444444444444444444', chain: 'ethereum', amount: '100' },
      { address: '0x5555555555555555555555555555555555555555', chain: 'avalanche', amount: '100' },
      { address: '0x6666666666666666666666666666666666666666', chain: 'base', amount: '100' },
      { address: '0x7777777777777777777777777777777777777777', chain: 'optimism', amount: '100' },
      { address: '0x8888888888888888888888888888888888888888', chain: 'polygon', amount: '100' },
    ],
  },
};

function render() {
  if (executionState) {
    renderExecution();
    return;
  }

  container.innerHTML = `
    <!-- Tabs -->
    <div class="tabs">
      <button class="tab ${activeTab === 'manual' ? 'active' : ''}" data-tab="manual">Manual</button>
      <button class="tab ${activeTab === 'csv' ? 'active' : ''}" data-tab="csv">CSV Upload</button>
      <button class="tab ${activeTab === 'templates' ? 'active' : ''}" data-tab="templates">Templates</button>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 340px; gap: 24px;">
      <!-- Left: Editor -->
      <div>
        ${activeTab === 'manual' ? renderManual() : ''}
        ${activeTab === 'csv' ? renderCSV() : ''}
        ${activeTab === 'templates' ? renderTemplates() : ''}
      </div>

      <!-- Right: Summary -->
      <div>
        ${renderSummary()}
      </div>
    </div>
  `;

  setupListeners();
}

function renderManual() {
  return `
    <div class="card">
      <div class="table-wrapper">
        <table class="batch-table">
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Recipient Address</th>
              <th style="width: 140px;">Chain</th>
              <th style="width: 120px;">Amount</th>
              <th style="width: 40px;"></th>
            </tr>
          </thead>
          <tbody id="batch-rows">
            ${rows.map((r, i) => renderRow(r, i)).join('')}
          </tbody>
        </table>
      </div>
      <button id="batch-add-row" class="btn btn--ghost btn--sm" style="margin-top: 12px;">+ Add Row</button>
    </div>
  `;
}

function renderRow(row, index) {
  const chains = getAllChains();
  return `
    <tr data-index="${index}">
      <td class="text-sm text-muted">${index + 1}</td>
      <td><input type="text" class="input input--mono batch-address" value="${row.address}" placeholder="0x..." data-index="${index}"></td>
      <td>
        <select class="select batch-chain" data-index="${index}">
          ${chains.map(c =>
            `<option value="${c}" ${row.chain === c ? 'selected' : ''}>${getChainMeta(c).name}</option>`
          ).join('')}
        </select>
      </td>
      <td><input type="number" class="input text-mono batch-amount" value="${row.amount}" placeholder="0.00" step="0.01" data-index="${index}"></td>
      <td>
        <button class="btn btn--ghost btn--sm batch-remove" data-index="${index}" style="color: var(--color-error); padding: 4px;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </td>
    </tr>
  `;
}

function renderCSV() {
  return `
    <div class="card">
      <div id="csv-dropzone" class="dropzone">
        <svg class="dropzone__icon" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div style="font-weight: 600; margin-bottom: 4px;">Drop CSV here or click to upload</div>
        <div class="text-xs">Format: address, chain, amount (one per line)</div>
      </div>
      <input type="file" id="csv-file-input" accept=".csv,.txt" style="display: none;">

      <div id="csv-preview" style="display: none; margin-top: 16px;">
        <div class="flex items-center justify-between" style="margin-bottom: 12px;">
          <span class="text-sm" style="font-weight: 600;" id="csv-count"></span>
          <button id="csv-import-btn" class="btn btn--primary btn--sm">Import</button>
        </div>
        <div id="csv-preview-table"></div>
      </div>
    </div>
  `;
}

function renderTemplates() {
  return `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      ${Object.entries(TEMPLATES).map(([key, tpl]) => `
        <div class="card card--hover" data-template="${key}" style="cursor: pointer;">
          <div class="flex items-center justify-between">
            <div>
              <div style="font-weight: 600;">${tpl.name}</div>
              <div class="text-sm text-muted">${tpl.desc}</div>
            </div>
            <div class="text-sm text-muted">${tpl.rows.length} recipients</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSummary() {
  const totalAmount = rows.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
  const totalFees = totalAmount * 0.0025; // 0.25% batch fee
  const totalRequired = totalAmount + totalFees;
  const insufficient = totalRequired > balance;

  // Chain distribution
  const chainDist = {};
  rows.forEach(r => {
    if (!chainDist[r.chain]) chainDist[r.chain] = 0;
    chainDist[r.chain] += parseFloat(r.amount || 0);
  });

  return `
    <div class="batch-summary" style="position: sticky; top: 96px;">
      <h4 style="margin-bottom: 16px;">Batch Summary</h4>

      <div class="batch-summary__row">
        <span class="text-muted">Recipients</span>
        <span style="font-weight: 600;">${rows.length}</span>
      </div>
      <div class="batch-summary__row">
        <span class="text-muted">Total Amount</span>
        <span class="text-mono" style="font-weight: 600;">${formatUSDC(totalAmount)}</span>
      </div>
      <div class="batch-summary__row">
        <span class="text-muted">Fees (0.25% batch)</span>
        <span class="text-mono">${formatUSDC(totalFees)}</span>
      </div>
      <div class="batch-summary__row batch-summary__row--total">
        <span>Total Required</span>
        <span class="text-mono">${formatUSDC(totalRequired)}</span>
      </div>

      ${insufficient ? `
        <div class="batch-summary__row batch-summary__row--warning" style="margin-top: 8px;">
          <span>Available: ${formatUSDC(balance)}</span>
          <span style="font-weight: 600;">Insufficient!</span>
        </div>
      ` : `
        <div class="batch-summary__row" style="margin-top: 8px; color: var(--color-success);">
          <span>Available</span>
          <span class="text-mono">${formatUSDC(balance)}</span>
        </div>
      `}

      <!-- Chain distribution -->
      ${Object.keys(chainDist).length > 0 ? `
        <div style="margin-top: 16px;">
          <div class="text-xs text-muted" style="margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Chain Distribution</div>
          <div style="display: flex; gap: 4px; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
            ${Object.entries(chainDist).map(([chain, amt]) => {
              const pct = totalAmount > 0 ? (amt / totalAmount * 100) : 0;
              return `<div style="width: ${pct}%; background: ${getChainMeta(chain).color}; min-width: 4px;" title="${getChainMeta(chain).name}: ${formatUSDC(amt)}"></div>`;
            }).join('')}
          </div>
          ${Object.entries(chainDist).map(([chain, amt]) => `
            <div class="flex justify-between text-xs" style="margin-bottom: 2px;">
              <span>${getChainMeta(chain).name}</span>
              <span class="text-mono">${formatUSDC(amt)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <button id="batch-execute-btn" class="btn btn--primary btn--lg btn--full" style="margin-top: 20px;" ${rows.length === 0 || insufficient ? 'disabled' : ''}>
        Execute Batch (${rows.length} sends)
      </button>
    </div>
  `;
}

function renderExecution() {
  if (!batchResult) return;

  const summary = batchResult.summary || {};
  const steps = batchResult.steps || [];
  const isDone = executionState === 'done';
  const total = steps.length || summary.totalRecipients || 0;
  const completed = steps.filter(s => s.status === 'COMPLETED').length;
  const progress = total > 0 ? (completed / total * 100) : 0;

  container.innerHTML = `
    <div class="card" style="text-align: center; margin-bottom: 24px;">
      ${isDone ? `
        <div class="success-checkmark" style="margin-bottom: 16px;">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 12L10 17L19 7" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h2>Batch Complete!</h2>
      ` : `
        <h3 style="margin-bottom: 8px;">Executing Batch...</h3>
      `}
      <p class="text-muted text-sm" style="margin-bottom: 16px;">${completed} of ${total} completed</p>
      <div class="batch-progress">
        <div class="batch-progress__bar" style="width: ${progress}%;"></div>
      </div>
    </div>

    <!-- Summary stats -->
    ${isDone ? `
      <div class="grid-3" style="margin-bottom: 24px;">
        <div class="card" style="text-align: center;">
          <div class="text-sm text-muted">Total Sent</div>
          <div class="text-mono" style="font-size: 1.25rem; font-weight: 700;">${formatUSDC(summary.totalAmount || batchResult.amount)}</div>
        </div>
        <div class="card" style="text-align: center;">
          <div class="text-sm text-muted">Total Fees</div>
          <div class="text-mono" style="font-size: 1.25rem; font-weight: 700;">${formatUSDC(summary.totalFees || batchResult.feeAmount)}</div>
        </div>
        <div class="card" style="text-align: center;">
          <div class="text-sm text-muted">Recipients</div>
          <div style="font-size: 1.25rem; font-weight: 700;">${total}</div>
        </div>
      </div>
    ` : ''}

    <!-- Per-recipient status -->
    <div class="card">
      <h4 style="margin-bottom: 16px;">Send Status</h4>
      ${steps.map((s, i) => `
        <div class="batch-row-status">
          <span class="text-sm text-muted" style="width: 24px;">${i + 1}</span>
          <span class="text-mono text-sm" style="flex: 1;">${formatAddress(s.destAddr || s.address || '')}</span>
          ${s.destChain ? chainBadge(s.destChain) : (s.chain ? chainBadge(s.chain) : '')}
          <span class="text-mono text-sm" style="width: 100px; text-align: right; font-weight: 600;">${formatUSDC(s.amount)}</span>
          ${statusBadge(s.status)}
        </div>
      `).join('')}
    </div>

    ${isDone ? `
      <div class="flex gap-12" style="margin-top: 24px; justify-content: center;">
        <button id="batch-new" class="btn btn--secondary">New Batch</button>
        <button id="batch-go-dashboard" class="btn btn--primary">Dashboard</button>
      </div>
    ` : ''}
  `;

  document.getElementById('batch-new')?.addEventListener('click', () => {
    executionState = null;
    batchResult = null;
    rows = [];
    render();
  });
  document.getElementById('batch-go-dashboard')?.addEventListener('click', () => navigate('dashboard'));
}

function setupListeners() {
  // Tab switching
  container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      render();
    });
  });

  // Add row
  document.getElementById('batch-add-row')?.addEventListener('click', () => {
    rows.push({ address: '', chain: 'base', amount: '' });
    render();
  });

  // Row editing
  container.querySelectorAll('.batch-address').forEach(el => {
    el.addEventListener('change', (e) => {
      rows[e.target.dataset.index].address = e.target.value;
      render();
    });
  });

  container.querySelectorAll('.batch-chain').forEach(el => {
    el.addEventListener('change', (e) => {
      rows[e.target.dataset.index].chain = e.target.value;
      render();
    });
  });

  container.querySelectorAll('.batch-amount').forEach(el => {
    el.addEventListener('change', (e) => {
      rows[e.target.dataset.index].amount = e.target.value;
      render();
    });
  });

  // Remove row
  container.querySelectorAll('.batch-remove').forEach(el => {
    el.addEventListener('click', () => {
      rows.splice(parseInt(el.dataset.index), 1);
      render();
    });
  });

  // Templates
  container.querySelectorAll('[data-template]').forEach(el => {
    el.addEventListener('click', () => {
      const tpl = TEMPLATES[el.dataset.template];
      rows = tpl.rows.map(r => ({ ...r }));
      activeTab = 'manual';
      render();
      showToast(`Loaded "${tpl.name}" template`, 'info');
    });
  });

  // CSV
  const dropzone = document.getElementById('csv-dropzone');
  const fileInput = document.getElementById('csv-file-input');

  if (dropzone) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) parseCSV(file);
    });
  }

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files[0]) parseCSV(e.target.files[0]);
  });

  document.getElementById('csv-import-btn')?.addEventListener('click', () => {
    activeTab = 'manual';
    render();
    showToast(`Imported ${rows.length} rows from CSV`, 'success');
  });

  // Execute
  document.getElementById('batch-execute-btn')?.addEventListener('click', handleExecute);
}

function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.trim().split('\n').filter(l => l.trim());
    const parsed = [];

    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 3) {
        parsed.push({ address: parts[0], chain: parts[1], amount: parts[2] });
      }
    }

    if (parsed.length === 0) {
      showToast('No valid rows found in CSV', 'warning');
      return;
    }

    rows = parsed;

    const preview = document.getElementById('csv-preview');
    const count = document.getElementById('csv-count');
    const table = document.getElementById('csv-preview-table');

    if (preview) preview.style.display = 'block';
    if (count) count.textContent = `${parsed.length} rows found`;
    if (table) {
      table.innerHTML = `
        <div class="table-wrapper" style="max-height: 200px; overflow-y: auto;">
          <table class="table">
            <thead><tr><th>Address</th><th>Chain</th><th>Amount</th></tr></thead>
            <tbody>
              ${parsed.slice(0, 10).map(r => `
                <tr>
                  <td class="text-mono text-sm">${formatAddress(r.address)}</td>
                  <td class="text-sm">${r.chain}</td>
                  <td class="text-mono text-sm">${r.amount}</td>
                </tr>
              `).join('')}
              ${parsed.length > 10 ? `<tr><td colspan="3" class="text-sm text-muted">...and ${parsed.length - 10} more</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      `;
    }
  };
  reader.readAsText(file);
}

async function handleExecute() {
  const validRows = rows.filter(r => r.address && r.chain && parseFloat(r.amount) > 0);
  if (validRows.length === 0) {
    showToast('No valid rows to execute', 'warning');
    return;
  }

  const btn = document.getElementById('batch-execute-btn');
  btn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Executing...';
  btn.disabled = true;

  try {
    const recipients = validRows.map(r => ({
      address: r.address,
      chain: r.chain,
      amount: String(r.amount),
    }));

    batchResult = await operations.batchSend(recipients, 'base');
    executionState = 'executing';
    render();

    // Poll for completion
    if (batchResult.status !== 'COMPLETED') {
      const pollId = setInterval(async () => {
        try {
          const updated = await operations.get(batchResult.id);
          batchResult = updated;
          if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
            clearInterval(pollId);
            executionState = 'done';
            render();
            triggerConfetti();
          } else {
            render();
          }
        } catch {}
      }, 1000);
    } else {
      executionState = 'done';
      render();
      triggerConfetti();
    }
  } catch (err) {
    showToast(`Batch failed: ${err.message}`, 'error');
    btn.textContent = `Execute Batch (${rows.length} sends)`;
    btn.disabled = false;
  }
}

function triggerConfetti() {
  const el = document.createElement('div');
  el.className = 'confetti-container';
  document.body.appendChild(el);

  const colors = ['#1894E8', '#9F72FF', '#62E2A4', '#F59E0B', '#EF4444', '#0052ff'];

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 1 + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    piece.style.width = (6 + Math.random() * 8) + 'px';
    piece.style.height = (6 + Math.random() * 8) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    el.appendChild(piece);
  }

  setTimeout(() => el.remove(), 4000);
}

export function init() {
  container = document.getElementById('batch-content');
}

export async function show() {
  document.getElementById('header-title').textContent = 'Batch Send';
  executionState = null;
  batchResult = null;

  if (rows.length === 0) {
    rows = [
      { address: '', chain: 'base', amount: '' },
      { address: '', chain: 'arbitrum', amount: '' },
      { address: '', chain: 'polygon', amount: '' },
    ];
  }

  try {
    const bal = await wallet.balances();
    balance = parseFloat(bal.total || '0');
  } catch { balance = 0; }

  render();
}

export function hide() {}
