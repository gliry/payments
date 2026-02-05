// ============================================================================
// Screen: Transaction History
// ============================================================================

import * as state from '../state.js';
import { deposits, payouts, transfers } from '../api.js';
import { formatUSDC, formatAddress, timeAgo, formatDate, getChainMeta } from '../utils.js';
import { statusBadge } from '../components/status-badge.js';
import { chainBadge } from '../components/chain-icon.js';

let container;
let allTransactions = [];
let filterType = 'all';
let filterStatus = 'all';
let detailPanelOpen = false;

function render() {
  const filtered = allTransactions.filter(tx => {
    if (filterType !== 'all' && tx.object !== filterType) return false;
    if (filterStatus !== 'all' && tx.status !== filterStatus) return false;
    return true;
  });

  container.innerHTML = `
    <!-- Filters -->
    <div class="flex items-center justify-between" style="margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
      <div class="tabs" style="margin-bottom: 0; border-bottom: none;">
        <button class="tab ${filterType === 'all' ? 'active' : ''}" data-filter-type="all">All</button>
        <button class="tab ${filterType === 'deposit' ? 'active' : ''}" data-filter-type="deposit">Deposits</button>
        <button class="tab ${filterType === 'payout' ? 'active' : ''}" data-filter-type="payout">Payouts</button>
        <button class="tab ${filterType === 'transfer' ? 'active' : ''}" data-filter-type="transfer">Transfers</button>
      </div>
      <select id="filter-status" class="select" style="width: auto; min-width: 140px;">
        <option value="all" ${filterStatus === 'all' ? 'selected' : ''}>All Status</option>
        <option value="completed" ${filterStatus === 'completed' ? 'selected' : ''}>Completed</option>
        <option value="processing" ${filterStatus === 'processing' ? 'selected' : ''}>Processing</option>
        <option value="failed" ${filterStatus === 'failed' ? 'selected' : ''}>Failed</option>
      </select>
    </div>

    <!-- Table -->
    <div class="card">
      ${filtered.length === 0
        ? `<div class="empty-state">
            <div class="empty-state__title">No transactions found</div>
            <div class="empty-state__desc">Try changing your filters</div>
          </div>`
        : `<div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Chain</th>
                  <th style="text-align:right">Amount</th>
                  <th style="text-align:right">Fee</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(tx => renderRow(tx)).join('')}
              </tbody>
            </table>
          </div>`
      }
    </div>

    <!-- Detail Panel -->
    <div id="detail-overlay" class="detail-panel__overlay"></div>
    <div id="detail-panel" class="detail-panel">
      <div class="detail-panel__header">
        <h4>Transaction Details</h4>
        <button class="detail-panel__close" id="detail-close">&times;</button>
      </div>
      <div class="detail-panel__body" id="detail-body"></div>
    </div>
  `;

  setupListeners();
}

function renderRow(tx) {
  const isDeposit = tx.object === 'deposit';
  const isTransfer = tx.object === 'transfer';
  const isPayout = tx.object === 'payout';

  let typeLabel, chain, amount, amountClass, fee, desc;

  if (isDeposit) {
    typeLabel = '<span style="color: var(--color-success); font-weight: 600;">Deposit</span>';
    chain = tx.source_chain;
    amount = '+' + formatUSDC(tx.credited_amount);
    amountClass = 'amount-positive';
    fee = formatUSDC(tx.fee);
    desc = `From ${getChainMeta(tx.source_chain).name}`;
  } else if (isPayout) {
    typeLabel = '<span style="color: var(--color-primary); font-weight: 600;">Payout</span>';
    chain = tx.destination?.chain;
    amount = '-' + formatUSDC(tx.amount);
    amountClass = 'amount-negative';
    fee = formatUSDC(tx.fee);
    desc = `To ${formatAddress(tx.destination?.address)}`;
  } else {
    typeLabel = '<span style="color: var(--color-purple); font-weight: 600;">Transfer</span>';
    chain = 'arc';
    amount = '-' + formatUSDC(tx.amount);
    amountClass = 'amount-negative';
    fee = formatUSDC(tx.fee);
    desc = `To ${formatAddress(tx.to_account)}`;
  }

  return `
    <tr class="history-row" data-tx-id="${tx.id}" style="cursor: pointer;">
      <td>${typeLabel}</td>
      <td class="text-sm">${desc}</td>
      <td>${chain ? chainBadge(chain) : ''}</td>
      <td style="text-align:right"><span class="${amountClass}">${amount}</span></td>
      <td style="text-align:right" class="text-sm text-mono">${fee}</td>
      <td>${statusBadge(tx.status)}</td>
      <td class="text-sm text-muted">${timeAgo(tx.created_at)}</td>
    </tr>
  `;
}

function showDetail(tx) {
  const body = document.getElementById('detail-body');
  const fields = Object.entries(tx).filter(([k]) => k !== 'object');

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

    <div style="margin-top: 24px;">
      <div class="text-xs text-muted" style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Raw JSON</div>
      <div class="code-block">
        <div class="code-block__header">
          <div class="code-block__dots"><span></span><span></span><span></span></div>
          <span style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">response.json</span>
        </div>
        <div class="code-block__body">${JSON.stringify(tx, null, 2)}</div>
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
      const tx = allTransactions.find(t => t.id === row.dataset.txId);
      if (tx) showDetail(tx);
    });
  });

  // Close detail
  document.getElementById('detail-close')?.addEventListener('click', closeDetail);
  document.getElementById('detail-overlay')?.addEventListener('click', closeDetail);
}

async function fetchData() {
  const accountId = state.getAccountId();
  if (!accountId) return;

  try {
    const [depositList, payoutList, transferList] = await Promise.all([
      deposits.list(accountId).catch(() => ({ data: [] })),
      payouts.list(accountId).catch(() => ({ data: [] })),
      transfers.list(accountId).catch(() => ({ data: [] })),
    ]);

    allTransactions = [
      ...depositList.data,
      ...payoutList.data,
      ...transferList.data,
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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
