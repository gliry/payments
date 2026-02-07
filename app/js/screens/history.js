// ============================================================================
// Screen: Operation History
// ============================================================================

import * as state from '../state.js';
import { operations } from '../api.js';
import { formatUSDC, formatAddress, timeAgo, formatDate, getChainMeta, getOpTypeLabel, getOpStatusLabel } from '../utils.js';
import { statusBadge } from '../components/status-badge.js';
import { chainBadge } from '../components/chain-icon.js';

let container;
let allOperations = [];
let filterType = 'all';
let filterStatus = 'all';

function render() {
  const filtered = allOperations.filter(op => {
    if (filterType !== 'all' && op.type !== filterType) return false;
    if (filterStatus !== 'all' && op.status !== filterStatus) return false;
    return true;
  });

  container.innerHTML = `
    <!-- Filters -->
    <div class="flex items-center justify-between" style="margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
      <div class="tabs" style="margin-bottom: 0; border-bottom: none;">
        <button class="tab ${filterType === 'all' ? 'active' : ''}" data-filter-type="all">All</button>
        <button class="tab ${filterType === 'SEND' ? 'active' : ''}" data-filter-type="SEND">Send</button>
        <button class="tab ${filterType === 'COLLECT' ? 'active' : ''}" data-filter-type="COLLECT">Collect</button>
        <button class="tab ${filterType === 'BRIDGE' ? 'active' : ''}" data-filter-type="BRIDGE">Bridge</button>
        <button class="tab ${filterType === 'BATCH_SEND' ? 'active' : ''}" data-filter-type="BATCH_SEND">Batch Send</button>
      </div>
      <select id="filter-status" class="select" style="width: auto; min-width: 160px;">
        <option value="all" ${filterStatus === 'all' ? 'selected' : ''}>All Status</option>
        <option value="COMPLETED" ${filterStatus === 'COMPLETED' ? 'selected' : ''}>Completed</option>
        <option value="PROCESSING" ${filterStatus === 'PROCESSING' ? 'selected' : ''}>Processing</option>
        <option value="PENDING" ${filterStatus === 'PENDING' ? 'selected' : ''}>Pending</option>
        <option value="AWAITING_SIGNATURE" ${filterStatus === 'AWAITING_SIGNATURE' ? 'selected' : ''}>Awaiting Signature</option>
        <option value="AWAITING_SIGNATURE_PHASE2" ${filterStatus === 'AWAITING_SIGNATURE_PHASE2' ? 'selected' : ''}>Awaiting Sig. (Phase 2)</option>
        <option value="FAILED" ${filterStatus === 'FAILED' ? 'selected' : ''}>Failed</option>
      </select>
    </div>

    <!-- Table -->
    <div class="card">
      ${filtered.length === 0
        ? `<div class="empty-state">
            <div class="empty-state__title">No operations found</div>
            <div class="empty-state__desc">Try changing your filters</div>
          </div>`
        : `<div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th style="text-align:right">Amount</th>
                  <th style="text-align:right">Fee</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(op => renderRow(op)).join('')}
              </tbody>
            </table>
          </div>`
      }
    </div>

    <!-- Detail Panel -->
    <div id="detail-overlay" class="detail-panel__overlay"></div>
    <div id="detail-panel" class="detail-panel">
      <div class="detail-panel__header">
        <h4>Operation Details</h4>
        <button class="detail-panel__close" id="detail-close">&times;</button>
      </div>
      <div class="detail-panel__body" id="detail-body"></div>
    </div>
  `;

  setupListeners();
}

function renderRow(op) {
  const typeLabel = getOpTypeLabel(op.type);
  const summary = op.summary || typeLabel;
  const amount = op.amount ? formatUSDC(op.amount) : '';
  const fee = op.feeAmount ? formatUSDC(op.feeAmount) : '-';

  const typeColors = {
    SEND: 'var(--color-primary)',
    COLLECT: 'var(--color-success)',
    BRIDGE: 'var(--color-purple, #9F72FF)',
    BATCH_SEND: '#F59E0B',
  };
  const color = typeColors[op.type] || 'var(--color-primary)';

  return `
    <tr class="history-row" data-op-id="${op.id}" style="cursor: pointer;">
      <td><span style="color: ${color}; font-weight: 600;">${typeLabel}</span></td>
      <td class="text-sm">${summary}</td>
      <td style="text-align:right"><span class="text-mono">${amount}</span></td>
      <td style="text-align:right" class="text-sm text-mono">${fee}</td>
      <td>${statusBadge(op.status)}</td>
      <td class="text-sm text-muted">${timeAgo(op.createdAt)}</td>
    </tr>
  `;
}

async function showDetail(op) {
  const body = document.getElementById('detail-body');

  // Fetch full operation details
  let fullOp = op;
  try {
    fullOp = await operations.get(op.id);
  } catch {}

  const fields = Object.entries(fullOp).filter(([k]) => k !== 'steps');
  const steps = fullOp.steps || [];

  body.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${fields.map(([key, value]) => `
        <div>
          <div class="text-xs text-muted" style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">${key}</div>
          <div class="text-sm ${typeof value === 'object' ? '' : 'text-mono'}" style="word-break: break-all;">${
            typeof value === 'object' ? `<pre style="font-family: var(--font-mono); font-size: 0.75rem; background: var(--color-bg-soft); padding: 8px; border-radius: 8px; overflow-x: auto;">${JSON.stringify(value, null, 2)}</pre>` : String(value)
          }</div>
        </div>
      `).join('')}
    </div>

    ${steps.length > 0 ? `
      <div style="margin-top: 24px;">
        <div class="text-xs text-muted" style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Steps</div>
        ${steps.map((step, i) => `
          <div style="background: var(--color-bg-soft); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
            <div class="flex justify-between text-sm">
              <span style="font-weight: 500;">Step ${i + 1}</span>
              ${statusBadge(step.status)}
            </div>
            <pre style="font-family: var(--font-mono); font-size: 0.7rem; margin-top: 6px; white-space: pre-wrap;">${JSON.stringify(step, null, 2)}</pre>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div style="margin-top: 24px;">
      <div class="text-xs text-muted" style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Raw JSON</div>
      <div class="code-block">
        <div class="code-block__header">
          <div class="code-block__dots"><span></span><span></span><span></span></div>
          <span style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">response.json</span>
        </div>
        <div class="code-block__body">${JSON.stringify(fullOp, null, 2)}</div>
      </div>
    </div>
  `;

  document.getElementById('detail-panel').classList.add('open');
  document.getElementById('detail-overlay').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-overlay').classList.remove('open');
}

function setupListeners() {
  // Type filter
  container.querySelectorAll('[data-filter-type]').forEach(tab => {
    tab.addEventListener('click', () => {
      filterType = tab.dataset.filterType;
      render();
    });
  });

  // Status filter
  document.getElementById('filter-status')?.addEventListener('change', (e) => {
    filterStatus = e.target.value;
    render();
  });

  // Row click → detail
  container.querySelectorAll('.history-row').forEach(row => {
    row.addEventListener('click', () => {
      const op = allOperations.find(o => o.id === row.dataset.opId);
      if (op) showDetail(op);
    });
  });

  // Close detail
  document.getElementById('detail-close')?.addEventListener('click', closeDetail);
  document.getElementById('detail-overlay')?.addEventListener('click', closeDetail);
}

async function fetchData() {
  try {
    const result = await operations.list(
      filterType !== 'all' ? filterType : null,
      filterStatus !== 'all' ? filterStatus : null,
      50,
      0
    );
    allOperations = result.data || result || [];
    if (!Array.isArray(allOperations)) allOperations = [];
    render();
  } catch (err) {
    console.error('History fetch error:', err);
  }
}

export function init() {
  container = document.getElementById('history-content');
}

export async function show() {
  document.getElementById('header-title').textContent = 'History';
  await fetchData();
}

export function hide() {
  closeDetail();
}
