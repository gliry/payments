// ============================================================================
// Screen: Dashboard
// ============================================================================

import * as state from '../state.js';
import { wallet, operations } from '../api.js';
import { formatUSDC, formatAddress, timeAgo, copyToClipboard, getOpTypeLabel } from '../utils.js';
import { animateNumber } from '../components/animated-number.js';
import { statusBadge } from '../components/status-badge.js';
import { chainBadge } from '../components/chain-icon.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../app.js';

let container;
let pollInterval = null;

function render(balanceData, ops) {
  const user = state.getUser();
  const walletData = state.getWallet();
  const total = parseFloat(balanceData?.total || '0');
  const gatewayTotal = Object.values(balanceData?.gatewayBalances || {}).reduce((s, v) => s + parseFloat(v || '0'), 0);
  const onChainTotal = Object.values(balanceData?.onChainBalances || {}).reduce((s, v) => s + parseFloat(v || '0'), 0);

  container.innerHTML = `
    <!-- Balance Card -->
    <div class="card card--hero" style="margin-bottom: 24px;">
      <div class="balance-card">
        <div id="balance-amount" class="balance-card__amount">${formatUSDC(total)}</div>
        <div class="balance-card__label">
          <span>Total Balance</span>
        </div>
        <span class="balance-card__address" id="copy-address" title="Click to copy">
          ${formatAddress(user?.walletAddress || walletData?.address)}
          <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
        </span>
      </div>
    </div>

    ${total > 0 ? `
    <!-- Balance Breakdown -->
    <div class="card" style="margin-bottom: 24px; padding: 16px 20px;">
      <div class="flex items-center justify-between" style="margin-bottom: 8px;">
        <span class="text-sm text-muted">Gateway (unified)</span>
        <span class="text-mono" style="font-weight: 600; color: #10B981;">${formatUSDC(gatewayTotal)}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted">On-chain (unsorted)</span>
        <span class="text-mono" style="font-weight: 600; color: #F59E0B;">${formatUSDC(onChainTotal)}</span>
      </div>
    </div>
    ` : ''}

    <!-- Quick Actions -->
    <div class="grid-3" style="margin-bottom: 32px;">
      <div class="card card--hover quick-action" data-navigate="deposit">
        <div class="quick-action__icon quick-action__icon--deposit">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <span class="quick-action__label">Receive</span>
      </div>
      <div class="card card--hover quick-action" data-navigate="send">
        <div class="quick-action__icon quick-action__icon--send">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 20V4m0 0l-6 6m6-6l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <span class="quick-action__label">Send</span>
      </div>
      <div class="card card--hover quick-action" data-navigate="batch">
        <div class="quick-action__icon quick-action__icon--batch">
          <svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <span class="quick-action__label">Batch Send</span>
      </div>
    </div>

  `;

  // Event listeners
  document.getElementById('copy-address')?.addEventListener('click', async () => {
    await copyToClipboard(user?.walletAddress || walletData?.address || '');
    showToast('Address copied!', 'success');
  });

  container.querySelectorAll('[data-navigate]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.navigate));
  });

  // Animate balance
  const amountEl = document.getElementById('balance-amount');
  if (amountEl) animateNumber(amountEl, total);
}

function renderOpRow(op) {
  const typeLabel = getOpTypeLabel(op.type);
  const summary = op.summary || typeLabel;
  const amount = op.amount ? formatUSDC(op.amount) : '';

  const typeColors = {
    SEND: '#1894E8',
    COLLECT: '#10B981',
    BRIDGE: '#9F72FF',
    BATCH_SEND: '#F59E0B',
  };
  const color = typeColors[op.type] || '#6b7280';

  return `
    <tr>
      <td><span style="color: ${color}; font-weight: 600;">${typeLabel}</span></td>
      <td><span class="text-sm" style="font-weight: 500;">${summary}</span></td>
      <td style="text-align:right"><span class="text-mono">${amount}</span></td>
      <td>${statusBadge(op.status)}</td>
      <td class="text-sm text-muted">${timeAgo(op.createdAt)}</td>
    </tr>
  `;
}

async function fetchData() {
  try {
    const [balanceData, opsList] = await Promise.all([
      wallet.balances().catch(() => ({ total: '0' })),
      operations.list(null, null, 10, 0).catch(() => ({ data: [] })),
    ]);

    const ops = opsList.data || opsList || [];
    render(balanceData, Array.isArray(ops) ? ops : []);

    // Update header balance
    const headerBal = document.getElementById('header-balance');
    if (headerBal) {
      headerBal.textContent = formatUSDC(balanceData.total);
    }
  } catch (err) {
    console.error('Dashboard fetch error:', err);
  }
}

export function init() {
  container = document.getElementById('dashboard-content');
}

export async function show() {
  document.getElementById('header-title').textContent = 'Dashboard';
  await fetchData();
  pollInterval = setInterval(fetchData, 10000);
}

export function hide() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
