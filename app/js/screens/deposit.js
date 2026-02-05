// ============================================================================
// Screen: Deposit
// ============================================================================

import * as state from '../state.js';
import { deposits, accounts } from '../api.js';
import { formatUSDC, getChainSVG, getAllChains, getChainMeta, copyToClipboard } from '../utils.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../app.js';

let container;

function render() {
  const wallet = state.getWallet();

  container.innerHTML = `
    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" data-tab="lifi">Any Token (LI.FI)</button>
      <button class="tab" data-tab="usdc">USDC Direct</button>
      <button class="tab" data-tab="simulate">Simulate (Demo)</button>
    </div>

    <!-- Tab: LI.FI -->
    <div id="tab-lifi" class="tab-content">
      <div class="card" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 8px;">Deposit Any Token</h3>
        <p class="text-sm text-muted" style="margin-bottom: 24px;">
          Deposit ETH, WBTC, DAI, USDT, or any token from any chain. LI.FI automatically finds the best route and swaps to USDC.
        </p>

        <!-- Token selector -->
        <div class="input-group" style="margin-bottom: 20px;">
          <label class="input-label">Source Token</label>
          <div class="token-grid">
            ${['ETH', 'WBTC', 'DAI', 'USDT', 'ARB', 'MATIC', 'SOL', 'LINK'].map(token => `
              <div class="token-option" data-token="${token}">
                <div class="token-option__icon" style="background: ${getTokenColor(token)}">${token.slice(0, 2)}</div>
                ${token}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Chain selector -->
        <div class="input-group" style="margin-bottom: 20px;">
          <label class="input-label">Source Chain</label>
          <div class="chain-grid">
            ${['ethereum', 'base', 'arbitrum', 'polygon'].map(chain => {
              const meta = getChainMeta(chain);
              return `
                <div class="chain-option" data-chain="${chain}">
                  ${getChainSVG(chain, 28)}
                  <span class="chain-option__name">${meta.name}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Amount input -->
        <div class="input-group" style="margin-bottom: 20px;">
          <label class="input-label">Amount</label>
          <input type="number" id="lifi-amount" class="input" placeholder="0.0" step="0.001" min="0">
        </div>

        <!-- Quote preview -->
        <div id="lifi-quote" class="quote-card" style="display: none;">
          <div class="quote-card__row">
            <span class="text-muted">Source</span>
            <span id="lifi-quote-source" class="text-mono text-sm" style="font-weight: 600;"></span>
          </div>
          <div class="quote-card__arrow">↓</div>
          <div class="quote-card__row">
            <span class="text-muted">Destination</span>
            <span id="lifi-quote-dest" class="text-mono text-sm" style="font-weight: 600;"></span>
          </div>
          <div class="quote-card__route" id="lifi-quote-route"></div>
          <div class="quote-card__row" style="margin-top: 8px;">
            <span class="text-muted">Estimated time</span>
            <span class="text-sm">~2-5 min</span>
          </div>
        </div>

        <button id="lifi-deposit-btn" class="btn btn--primary btn--lg btn--full" style="margin-top: 20px;" disabled>
          Get Quote & Deposit via LI.FI
        </button>

        <p class="text-xs text-muted" style="text-align: center; margin-top: 12px;">
          Powered by LI.FI — cross-chain + cross-token swaps
        </p>
      </div>
    </div>

    <!-- Tab: USDC Direct -->
    <div id="tab-usdc" class="tab-content" style="display: none;">
      <div class="card" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 8px;">Direct USDC Deposit</h3>
        <p class="text-sm text-muted" style="margin-bottom: 24px;">
          Send USDC directly to your deposit address on any supported chain.
        </p>

        <div class="input-group" style="margin-bottom: 20px;">
          <label class="input-label">Select Chain</label>
          <div class="chain-grid">
            ${['arbitrum', 'base', 'ethereum', 'polygon', 'sonic'].map(chain => {
              const meta = getChainMeta(chain);
              return `
                <div class="chain-option" data-chain="${chain}" data-mode="usdc">
                  ${getChainSVG(chain, 28)}
                  <span class="chain-option__name">${meta.name}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div id="usdc-address-card" style="display: none;">
          <div class="card" style="background: var(--color-bg-soft);">
            <div class="input-label" style="margin-bottom: 8px;">Deposit Address</div>
            <div class="flex items-center gap-8" style="margin-bottom: 12px;">
              <code class="text-mono text-sm" id="usdc-deposit-address" style="word-break: break-all;">${wallet?.address || ''}</code>
              <button class="copy-btn" id="copy-deposit-address">
                <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
              </button>
            </div>
            <p class="text-xs text-muted">Cross-chain fee: 0.4%</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab: Simulate -->
    <div id="tab-simulate" class="tab-content" style="display: none;">
      <div class="card">
        <h3 style="margin-bottom: 8px;">Simulate Deposit</h3>
        <p class="text-sm text-muted" style="margin-bottom: 24px;">
          Instantly credit your account for demo purposes. No real tokens needed.
        </p>

        <div class="input-group" style="margin-bottom: 20px;">
          <label class="input-label">Chain</label>
          <select id="sim-chain" class="select">
            ${['arbitrum', 'base', 'ethereum', 'polygon', 'sonic'].map(c =>
              `<option value="${c}">${getChainMeta(c).name}</option>`
            ).join('')}
          </select>
        </div>

        <div class="input-group" style="margin-bottom: 20px;">
          <label class="input-label">Amount (USDC)</label>
          <input type="number" id="sim-amount" class="input" placeholder="10000" value="50000" min="1">
        </div>

        <button id="sim-deposit-btn" class="btn btn--primary btn--full">
          Simulate Deposit
        </button>

        <div id="sim-result" style="display: none; margin-top: 16px;"></div>
      </div>
    </div>
  `;

  setupTabs();
  setupLiFi();
  setupUSDC();
  setupSimulate();
}

function getTokenColor(token) {
  const colors = {
    ETH: '#627eea', WBTC: '#f7931a', DAI: '#f4b731', USDT: '#26a17b',
    ARB: '#28a0f0', MATIC: '#8247e5', SOL: '#9945ff', LINK: '#2a5ada',
  };
  return colors[token] || '#6b7280';
}

function setupTabs() {
  container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).style.display = 'block';
    });
  });
}

function setupLiFi() {
  let selectedToken = null;
  let selectedChain = null;

  container.querySelectorAll('.token-option').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.token-option').forEach(t => t.classList.remove('selected'));
      el.classList.add('selected');
      selectedToken = el.dataset.token;
      updateLiFiQuote(selectedToken, selectedChain);
    });
  });

  container.querySelectorAll('#tab-lifi .chain-option').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('#tab-lifi .chain-option').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      selectedChain = el.dataset.chain;
      updateLiFiQuote(selectedToken, selectedChain);
    });
  });

  const amountInput = document.getElementById('lifi-amount');
  amountInput?.addEventListener('input', () => {
    updateLiFiQuote(selectedToken, selectedChain);
  });

  document.getElementById('lifi-deposit-btn')?.addEventListener('click', async () => {
    const amount = parseFloat(amountInput.value);
    if (!selectedToken || !selectedChain || !amount) {
      showToast('Please select token, chain, and enter amount', 'warning');
      return;
    }

    // For demo, simulate the deposit since LI.FI requires wallet connection
    const btn = document.getElementById('lifi-deposit-btn');
    btn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Processing via LI.FI...';
    btn.disabled = true;

    try {
      // Simulate the swap result as a deposit
      const usdcAmount = estimateUSDCOutput(selectedToken, amount);
      const result = await deposits.simulate(state.getAccountId(), selectedChain, usdcAmount);

      showToast(`Deposited ${formatUSDC(result.credited_amount)} via LI.FI`, 'success');
      setTimeout(() => navigate('dashboard'), 1500);
    } catch (err) {
      showToast(`Deposit failed: ${err.message}`, 'error');
    } finally {
      btn.textContent = 'Get Quote & Deposit via LI.FI';
      btn.disabled = false;
    }
  });
}

function estimateUSDCOutput(token, amount) {
  const prices = {
    ETH: 3200, WBTC: 95000, DAI: 1, USDT: 1,
    ARB: 1.2, MATIC: 0.8, SOL: 180, LINK: 15,
  };
  return (amount * (prices[token] || 1)).toFixed(2);
}

function updateLiFiQuote(token, chain) {
  const quoteEl = document.getElementById('lifi-quote');
  const btn = document.getElementById('lifi-deposit-btn');
  const amount = parseFloat(document.getElementById('lifi-amount')?.value);

  if (!token || !chain || !amount) {
    if (quoteEl) quoteEl.style.display = 'none';
    if (btn) btn.disabled = true;
    return;
  }

  const usdcOut = estimateUSDCOutput(token, amount);

  document.getElementById('lifi-quote-source').textContent = `${amount} ${token} on ${getChainMeta(chain).name}`;
  document.getElementById('lifi-quote-dest').textContent = `~${formatUSDC(usdcOut)} USDC on Arc`;
  document.getElementById('lifi-quote-route').textContent = `Best route via LI.FI: ${getChainMeta(chain).name} → Bridge → Arc`;

  quoteEl.style.display = 'block';
  btn.disabled = false;
}

function setupUSDC() {
  container.querySelectorAll('[data-mode="usdc"]').forEach(el => {
    el.addEventListener('click', async () => {
      container.querySelectorAll('[data-mode="usdc"]').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');

      const chain = el.dataset.chain;
      try {
        const result = await deposits.getAddress(state.getAccountId(), chain);
        document.getElementById('usdc-deposit-address').textContent = result.address;
        document.getElementById('usdc-address-card').style.display = 'block';
      } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
      }
    });
  });

  document.getElementById('copy-deposit-address')?.addEventListener('click', async () => {
    const addr = document.getElementById('usdc-deposit-address')?.textContent;
    if (addr) {
      await copyToClipboard(addr);
      showToast('Address copied!', 'success');
    }
  });
}

function setupSimulate() {
  document.getElementById('sim-deposit-btn')?.addEventListener('click', async () => {
    const chain = document.getElementById('sim-chain').value;
    const amount = document.getElementById('sim-amount').value;

    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }

    const btn = document.getElementById('sim-deposit-btn');
    btn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Processing...';
    btn.disabled = true;

    try {
      const result = await deposits.simulate(state.getAccountId(), chain, amount);

      document.getElementById('sim-result').style.display = 'block';
      document.getElementById('sim-result').innerHTML = `
        <div class="card" style="background: rgba(16, 185, 129, 0.05); border-color: rgba(16, 185, 129, 0.2);">
          <div class="text-sm" style="font-weight: 600; color: var(--color-success); margin-bottom: 8px;">Deposit Successful!</div>
          <div class="text-sm">Received: ${formatUSDC(result.received_amount)}</div>
          <div class="text-sm">Fee: ${formatUSDC(result.fee)}</div>
          <div class="text-sm" style="font-weight: 600;">Credited: ${formatUSDC(result.credited_amount)}</div>
        </div>
      `;

      showToast(`Deposited ${formatUSDC(result.credited_amount)} USDC`, 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btn.textContent = 'Simulate Deposit';
      btn.disabled = false;
    }
  });
}

export function init() {
  container = document.getElementById('deposit-content');
}

export function show() {
  document.getElementById('header-title').textContent = 'Deposit';
  render();
}

export function hide() {}
