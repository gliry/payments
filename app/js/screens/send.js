// ============================================================================
// Screen: Send Payout
// ============================================================================

import * as state from '../state.js';
import { payouts, accounts } from '../api.js';
import { formatUSDC, formatAddress, isValidAddress, getChainMeta, getChainSVG, calculateFee, getFeeLabel } from '../utils.js';
import { showToast } from '../components/toast.js';
import { statusBadge } from '../components/status-badge.js';
import { navigate } from '../app.js';

let container;
let currentStep = 1;
let formData = { address: '', chain: 'base', amount: '' };
let balance = 0;

function render() {
  container.innerHTML = `
    <!-- Steps -->
    <div class="steps">
      <div class="step ${currentStep >= 1 ? (currentStep > 1 ? 'done' : 'active') : ''}">
        <span class="step__number">${currentStep > 1 ? '&#10003;' : '1'}</span>
        <span class="step__label">Recipient</span>
      </div>
      <div class="step ${currentStep >= 2 ? (currentStep > 2 ? 'done' : 'active') : ''}">
        <span class="step__number">${currentStep > 2 ? '&#10003;' : '2'}</span>
        <span class="step__label">Amount</span>
      </div>
      <div class="step ${currentStep >= 3 ? 'active' : ''}">
        <span class="step__number">3</span>
        <span class="step__label">Confirm</span>
      </div>
    </div>

    <div class="card">
      ${currentStep === 1 ? renderStep1() : ''}
      ${currentStep === 2 ? renderStep2() : ''}
      ${currentStep === 3 ? renderStep3() : ''}
      ${currentStep === 4 ? renderSuccess() : ''}
    </div>
  `;

  setupListeners();
}

function renderStep1() {
  return `
    <h3 style="margin-bottom: 20px;">Recipient</h3>

    <div class="input-group" style="margin-bottom: 20px;">
      <label class="input-label">Wallet Address</label>
      <input type="text" id="send-address" class="input input--mono" placeholder="0x..." value="${formData.address}">
      <span id="send-address-hint" class="input-help"></span>
    </div>

    <div class="input-group" style="margin-bottom: 24px;">
      <label class="input-label">Destination Chain</label>
      <div class="chain-grid">
        ${['arc', 'arbitrum', 'base', 'ethereum', 'polygon', 'sonic'].map(chain => {
          const meta = getChainMeta(chain);
          return `
            <div class="chain-option ${formData.chain === chain ? 'selected' : ''}" data-chain="${chain}">
              ${getChainSVG(chain, 28)}
              <span class="chain-option__name">${meta.name}</span>
              <span class="text-xs text-muted">${getFeeLabel(chain)} fee</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <button id="send-next-1" class="btn btn--primary btn--full">Continue</button>
  `;
}

function renderStep2() {
  const fee = calculateFee(formData.amount || 0, formData.chain);
  const total = parseFloat(formData.amount || 0) + fee;

  return `
    <h3 style="margin-bottom: 20px;">Amount</h3>

    <div class="amount-display">
      <div class="flex items-center justify-between" style="max-width: 320px; margin: 0 auto;">
        <input type="number" id="send-amount" class="input input--lg" placeholder="0.00" value="${formData.amount}" step="0.01" min="0" style="border: none; box-shadow: none;">
      </div>
      <div class="amount-display__currency">USDC</div>
      <div class="amount-display__available">Available: ${formatUSDC(balance)}</div>
    </div>

    <div style="max-width: 400px; margin: 0 auto 24px;">
      <button id="send-use-max" class="btn btn--ghost btn--sm" style="margin-bottom: 16px;">Use Max</button>

      <div style="background: var(--color-bg-soft); border-radius: 10px; padding: 14px;">
        <div class="flex justify-between text-sm" style="margin-bottom: 4px;">
          <span class="text-muted">Fee (${getFeeLabel(formData.chain)})</span>
          <span class="text-mono" id="send-fee">${formatUSDC(fee)}</span>
        </div>
        <div class="flex justify-between text-sm" style="font-weight: 600;">
          <span>Total deducted</span>
          <span class="text-mono" id="send-total">${formatUSDC(total)}</span>
        </div>
      </div>
    </div>

    <div class="flex gap-12">
      <button id="send-back-2" class="btn btn--secondary" style="flex: 1;">Back</button>
      <button id="send-next-2" class="btn btn--primary" style="flex: 2;">Continue</button>
    </div>
  `;
}

function renderStep3() {
  const fee = calculateFee(formData.amount, formData.chain);
  const total = parseFloat(formData.amount) + fee;
  const meta = getChainMeta(formData.chain);

  return `
    <h3 style="margin-bottom: 20px;">Confirm Payout</h3>

    <div style="background: var(--color-bg-soft); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <div class="flex justify-between" style="margin-bottom: 12px;">
        <span class="text-sm text-muted">Recipient</span>
        <span class="text-mono text-sm">${formatAddress(formData.address)}</span>
      </div>
      <div class="flex justify-between" style="margin-bottom: 12px;">
        <span class="text-sm text-muted">Chain</span>
        <span class="text-sm" style="font-weight: 500;">${meta.name}</span>
      </div>
      <div class="flex justify-between" style="margin-bottom: 12px;">
        <span class="text-sm text-muted">Amount</span>
        <span class="text-mono text-sm" style="font-weight: 600;">${formatUSDC(formData.amount)}</span>
      </div>
      <div class="flex justify-between" style="margin-bottom: 12px;">
        <span class="text-sm text-muted">Fee (${getFeeLabel(formData.chain)})</span>
        <span class="text-mono text-sm">${formatUSDC(fee)}</span>
      </div>
      <div class="flex justify-between" style="border-top: 1px solid var(--color-border); padding-top: 12px; font-weight: 700;">
        <span>Total</span>
        <span class="text-mono">${formatUSDC(total)}</span>
      </div>
    </div>

    <div class="flex gap-12">
      <button id="send-back-3" class="btn btn--secondary" style="flex: 1;">Back</button>
      <button id="send-confirm" class="btn btn--primary" style="flex: 2;">Confirm & Send</button>
    </div>
  `;
}

function renderSuccess() {
  return `
    <div style="text-align: center; padding: 32px 0;">
      <div class="success-checkmark">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 12L10 17L19 7" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h3 style="margin-bottom: 8px;">Payout Sent!</h3>
      <p class="text-sm text-muted" style="margin-bottom: 4px;">
        ${formatUSDC(formData.amount)} USDC to ${formatAddress(formData.address)}
      </p>
      <p class="text-sm text-muted" style="margin-bottom: 24px;">
        on ${getChainMeta(formData.chain).name}
      </p>
      <div id="send-payout-status" style="margin-bottom: 24px;"></div>
      <div class="flex gap-12" style="justify-content: center;">
        <button id="send-another" class="btn btn--secondary">Send Another</button>
        <button id="send-go-dashboard" class="btn btn--primary">Dashboard</button>
      </div>
    </div>
  `;
}

function setupListeners() {
  // Step 1
  container.querySelectorAll('.chain-option').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.chain-option').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      formData.chain = el.dataset.chain;
    });
  });

  document.getElementById('send-next-1')?.addEventListener('click', () => {
    const addr = document.getElementById('send-address').value.trim();
    if (!isValidAddress(addr)) {
      showToast('Please enter a valid Ethereum address', 'warning');
      return;
    }
    formData.address = addr;
    currentStep = 2;
    render();
  });

  // Step 2
  document.getElementById('send-amount')?.addEventListener('input', (e) => {
    formData.amount = e.target.value;
    const fee = calculateFee(formData.amount || 0, formData.chain);
    const total = parseFloat(formData.amount || 0) + fee;
    document.getElementById('send-fee').textContent = formatUSDC(fee);
    document.getElementById('send-total').textContent = formatUSDC(total);
  });

  document.getElementById('send-use-max')?.addEventListener('click', () => {
    // Calculate max amount accounting for fee
    const feeRate = formData.chain === 'arc' ? 0.001 : 0.004;
    const maxAmount = balance / (1 + feeRate);
    formData.amount = maxAmount.toFixed(2);
    document.getElementById('send-amount').value = formData.amount;
    document.getElementById('send-amount').dispatchEvent(new Event('input'));
  });

  document.getElementById('send-back-2')?.addEventListener('click', () => { currentStep = 1; render(); });
  document.getElementById('send-next-2')?.addEventListener('click', () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      showToast('Please enter an amount', 'warning');
      return;
    }
    const fee = calculateFee(formData.amount, formData.chain);
    const total = parseFloat(formData.amount) + fee;
    if (total > balance) {
      showToast('Insufficient balance', 'error');
      return;
    }
    currentStep = 3;
    render();
  });

  // Step 3
  document.getElementById('send-back-3')?.addEventListener('click', () => { currentStep = 2; render(); });
  document.getElementById('send-confirm')?.addEventListener('click', handleSend);

  // Success
  document.getElementById('send-another')?.addEventListener('click', () => {
    formData = { address: '', chain: 'base', amount: '' };
    currentStep = 1;
    render();
  });
  document.getElementById('send-go-dashboard')?.addEventListener('click', () => navigate('dashboard'));

  // ENS hint
  const addrInput = document.getElementById('send-address');
  if (addrInput) {
    addrInput.addEventListener('input', () => {
      const hint = document.getElementById('send-address-hint');
      if (addrInput.value.endsWith('.eth')) {
        hint.textContent = 'ENS name detected — will resolve on-chain';
        hint.style.color = 'var(--color-primary)';
      } else {
        hint.textContent = '';
      }
    });
  }
}

async function handleSend() {
  const btn = document.getElementById('send-confirm');
  btn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Sending...';
  btn.disabled = true;

  try {
    const result = await payouts.create(state.getAccountId(), formData.amount, {
      address: formData.address,
      chain: formData.chain,
    });

    currentStep = 4;
    render();

    // Poll for completion
    const statusEl = document.getElementById('send-payout-status');
    if (result.status !== 'completed') {
      statusEl.innerHTML = statusBadge('processing');
      const pollId = setInterval(async () => {
        try {
          const updated = await payouts.get(result.id);
          if (updated.status === 'completed') {
            clearInterval(pollId);
            statusEl.innerHTML = statusBadge('completed');
          }
        } catch {}
      }, 2000);
    } else {
      statusEl.innerHTML = statusBadge('completed');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    btn.textContent = 'Confirm & Send';
    btn.disabled = false;
  }
}

export function init() {
  container = document.getElementById('send-content');
}

export async function show() {
  document.getElementById('header-title').textContent = 'Send';
  currentStep = 1;
  formData = { address: '', chain: 'base', amount: '' };

  try {
    const bal = await accounts.getBalance(state.getAccountId());
    balance = parseFloat(bal.available);
  } catch { balance = 0; }

  render();
}

export function hide() {}
