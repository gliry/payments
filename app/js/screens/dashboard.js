// ============================================================================
// Screen: Dashboard
// ============================================================================

import * as state from '../state.js';
import { accounts, deposits, payouts, transfers } from '../api.js';
import { formatUSDC, formatAddress, timeAgo, copyToClipboard, getChainSVG } from '../utils.js';
import { animateNumber } from '../components/animated-number.js';
import { statusBadge } from '../components/status-badge.js';
import { chainBadge } from '../components/chain-icon.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../app.js';

let container;
let pollInterval = null;

function render(balance, transactions) {
  const wallet = state.getWallet();
  const available = parseFloat(balance?.available || '0');
  const pending = parseFloat(balance?.pending || '0');

  container.innerHTML = `
    <!-- Balance Card -->
    <div class="card card--hero" style="margin-bottom: 24px;">
      <div class="balance-card">
        <div id="balance-amount" class="balance-card__amount">${formatUSDC(available)}</div>
        <div class="balance-card__label">
          <span>Available Balance</span>
          ${pending > 0 ? `<span class="balance-card__pending">+${formatUSDC(pending)} pending</span>` : ''}
        </div>
        <span class="balance-card__address" id="copy-address" title="Click to copy">
          ${formatAddress(wallet?.address)}
          <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
        </span>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid-3" style="margin-bottom: 32px;">
      <div class="card card--hover quick-action" data-navigate="deposit">
        <div class="quick-action__icon quick-action__icon--deposit">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <span class="quick-action__label">Deposit</span>
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
        <span class="quick-action__label">Batch Payout</span>
      </div>
    </div>

    <!-- Recent Transactions -->
    <div class="card">
      <div class="flex items-center justify-between" style="margin-bottom: 16px;">
        <h3>Recent Transactions</h3>
        <a href="#history" class="text-sm" style="font-weight: 500;">View All</a>
      </div>
      ${transactions.length === 0
        ? `<div class="empty-state">
            <div class="empty-state__title">No transactions yet</div>
            <div class="empty-state__desc">Make a deposit to get started</div>
          </div>`
        : `<div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Chain</th>
                  <th style="text-align:right">Amount</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                ${transactions.slice(0, 10).map(tx => renderTxRow(tx)).join('')}
              </tbody>
            </table>
          </div>`
      }
    </div>
  `;

  // Event listeners
  document.getElementById('copy-address')?.addEventListener('click', async () => {
    await copyToClipboard(wallet?.address || '');
    showToast('Address copied!', 'success');
  });

  container.querySelectorAll('[data-navigate]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.navigate));
  });

  // Animate balance
  const amountEl = document.getElementById('balance-amount');
  if (amountEl) animateNumber(amountEl, available);
}

function renderTxRow(tx) {
  const isDeposit = tx.object === 'deposit';
  const isTransfer = tx.object === 'transfer';
  const isPayout = tx.object === 'payout';

  let typeIcon, typeLabel, chain, amount, amountClass;

  if (isDeposit) {
    typeIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    typeLabel = 'Deposit';
    chain = tx.source_chain;
    amount = '+' + formatUSDC(tx.credited_amount);
    amountClass = 'amount-positive';
  } else if (isPayout) {
    typeIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M12 20V4m0 0l-6 6m6-6l6 6" stroke="#1894E8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    typeLabel = 'Payout';
    chain = tx.destination?.chain;
    amount = '-' + formatUSDC(tx.total_deducted);
    amountClass = 'amount-negative';
  } else if (isTransfer) {
    typeIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4 12h16m-8-8l8 8-8 8" stroke="#9F72FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    typeLabel = 'Transfer';
    chain = 'arc';
    amount = '-' + formatUSDC(tx.amount);
    amountClass = 'amount-negative';
  }

  const desc = isDeposit
    ? `Deposit from ${chain}`
    : isPayout
      ? `To ${formatAddress(tx.destination?.address)}`
      : `Transfer to ${formatAddress(tx.to_account)}`;

  return `
    <tr>
      <td>${typeIcon}</td>
      <td><span class="text-sm" style="font-weight: 500;">${desc}</span></td>
      <td>${chain ? chainBadge(chain) : ''}</td>
      <td style="text-align:right"><span class="${amountClass}">${amount}</span></td>
      <td>${statusBadge(tx.status)}</td>
      <td class="text-sm text-muted">${timeAgo(tx.created_at)}</td>
    </tr>
  `;
}

async function fetchData() {
  const accountId = state.getAccountId();
  if (!accountId) return;

  try {
    const [balance, depositList, payoutList, transferList] = await Promise.all([
      accounts.getBalance(accountId),
      deposits.list(accountId).catch(() => ({ data: [] })),
      payouts.list(accountId).catch(() => ({ data: [] })),
      transfers.list(accountId).catch(() => ({ data: [] })),
    ]);

    // Merge + sort all transactions
    const allTx = [
      ...depositList.data,
      ...payoutList.data,
      ...transferList.data,
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    render(balance, allTx);

    // Update header balance
    const headerBal = document.getElementById('header-balance');
    if (headerBal) {
      headerBal.textContent = formatUSDC(balance.available);
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
