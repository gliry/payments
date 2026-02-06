// ============================================================================
// Screen: Receive & Collect
// ============================================================================

import * as state from '../state.js';
import { wallet, operations } from '../api.js';
import { formatUSDC, getChainSVG, getAllChains, getChainMeta, copyToClipboard } from '../utils.js';
import { showToast } from '../components/toast.js';
import { statusBadge } from '../components/status-badge.js';
import { chainBadge } from '../components/chain-icon.js';
import { navigate } from '../app.js';

let container;
let activeTab = 'receive';
let balanceData = null;

function render() {
  const user = state.getUser();
  const walletInfo = state.getWallet();
  const address = user?.walletAddress || walletInfo?.address || '';

  container.innerHTML = `
    <!-- Tabs -->
    <div class="tabs">
      <button class="tab ${activeTab === 'receive' ? 'active' : ''}" data-tab="receive">Receive</button>
      <button class="tab ${activeTab === 'collect' ? 'active' : ''}" data-tab="collect">Collect</button>
    </div>

    <!-- Tab: Receive -->
    <div id="tab-receive" class="tab-content" ${activeTab !== 'receive' ? 'style="display:none;"' : ''}>
      <div class="card" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 8px;">Your Wallet Address</h3>
        <p class="text-sm text-muted" style="margin-bottom: 24px;">
          Send USDC to this address on any supported chain. Your balance will be automatically detected.
        </p>

        <div class="card" style="background: var(--color-bg-soft); margin-bottom: 24px;">
          <div class="input-label" style="margin-bottom: 8px;">Wallet Address</div>
          <div class="flex items-center gap-8" style="margin-bottom: 12px;">
            <code class="text-mono text-sm" id="receive-address" style="word-break: break-all;">${address}</code>
            <button class="copy-btn" id="copy-receive-address">
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
            </button>
          </div>
        </div>

        <h4 style="margin-bottom: 12px;">Supported Chains</h4>
        <div class="chain-grid">
          ${getAllChains().map(chain => {
            const meta = getChainMeta(chain);
            return `
              <div class="chain-option" style="cursor: default;">
                ${getChainSVG(chain, 28)}
                <span class="chain-option__name">${meta.name}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Tab: Collect -->
    <div id="tab-collect" class="tab-content" ${activeTab !== 'collect' ? 'style="display:none;"' : ''}>
      <div class="card" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 8px;">Collect Funds</h3>
        <p class="text-sm text-muted" style="margin-bottom: 24px;">
          Sweep balances from multiple chains into a single destination chain.
        </p>

        ${balanceData ? renderCollectForm() : `
          <div class="empty-state" style="padding: 24px;">
            <span class="loading-spinner"></span>
            <div class="empty-state__desc" style="margin-top: 12px;">Loading balances...</div>
          </div>
        `}
      </div>
    </div>
  `;

  setupListeners();
}

function renderCollectForm() {
  const onChain = balanceData.onChainBalances || {};
  const chains = Object.keys(onChain).filter(c => parseFloat(onChain[c]) > 0);

  if (chains.length === 0) {
    return `
      <div class="empty-state" style="padding: 24px;">
        <div class="empty-state__title">No on-chain balances</div>
        <div class="empty-state__desc">Receive funds first, then collect them here.</div>
      </div>
    `;
  }

  return `
    <div style="margin-bottom: 20px;">
      <label class="input-label" style="margin-bottom: 12px;">Select chains to sweep</label>
      ${chains.map(chain => `
        <label class="flex items-center gap-8" style="padding: 10px 0; border-bottom: 1px solid var(--color-border); cursor: pointer;">
          <input type="checkbox" class="collect-chain-check" value="${chain}" checked>
          ${chainBadge(chain)}
          <span class="text-sm" style="flex: 1; font-weight: 500;">${getChainMeta(chain).name}</span>
          <span class="text-mono text-sm" style="font-weight: 600;">${formatUSDC(onChain[chain])}</span>
        </label>
      `).join('')}
    </div>

    <div style="background: var(--color-bg-soft); border-radius: 10px; padding: 14px; margin-bottom: 20px;">
      <div class="flex justify-between text-sm" style="margin-bottom: 4px;">
        <span class="text-muted">Selected total</span>
        <span class="text-mono" style="font-weight: 600;" id="collect-total">${formatUSDC(chains.reduce((s, c) => s + parseFloat(onChain[c]), 0))}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-muted">Destination</span>
        <span style="font-weight: 500;">Base (gateway)</span>
      </div>
    </div>

    <button id="collect-btn" class="btn btn--primary btn--full">Collect to Base</button>
    <div id="collect-result" style="margin-top: 16px;"></div>
  `;
}

function setupListeners() {
  // Tabs
  container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      container.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      document.getElementById(`tab-${tab.dataset.tab}`).style.display = 'block';
    });
  });

  // Copy address
  document.getElementById('copy-receive-address')?.addEventListener('click', async () => {
    const addr = document.getElementById('receive-address')?.textContent;
    if (addr) {
      await copyToClipboard(addr);
      showToast('Address copied!', 'success');
    }
  });

  // Collect checkboxes → update total
  container.querySelectorAll('.collect-chain-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const onChain = balanceData?.onChainBalances || {};
      const checked = [...container.querySelectorAll('.collect-chain-check:checked')].map(el => el.value);
      const total = checked.reduce((s, c) => s + parseFloat(onChain[c] || 0), 0);
      const totalEl = document.getElementById('collect-total');
      if (totalEl) totalEl.textContent = formatUSDC(total);
    });
  });

  // Collect button
  document.getElementById('collect-btn')?.addEventListener('click', handleCollect);
}

async function handleCollect() {
  const checked = [...container.querySelectorAll('.collect-chain-check:checked')].map(el => el.value);
  if (checked.length === 0) {
    showToast('Select at least one chain', 'warning');
    return;
  }

  const btn = document.getElementById('collect-btn');
  btn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Collecting...';
  btn.disabled = true;

  try {
    const result = await operations.collect(checked, 'base');
    const resultEl = document.getElementById('collect-result');
    resultEl.innerHTML = `
      <div class="card" style="background: rgba(16, 185, 129, 0.05); border-color: rgba(16, 185, 129, 0.2);">
        <div class="text-sm" style="font-weight: 600; color: var(--color-success); margin-bottom: 8px;">Collect operation created!</div>
        <div class="text-sm">Status: ${statusBadge(result.status)}</div>
        <div class="text-sm" style="margin-top: 8px;">Chains: ${checked.map(c => getChainMeta(c).name).join(', ')}</div>
      </div>
    `;
    showToast('Collect operation initiated', 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.textContent = 'Collect to Base';
    btn.disabled = false;
  }
}

export function init() {
  container = document.getElementById('deposit-content');
}

export async function show() {
  document.getElementById('header-title').textContent = 'Receive & Collect';
  activeTab = 'receive';
  balanceData = null;

  render();

  // Fetch balances for Collect tab in background
  try {
    balanceData = await wallet.balances();
  } catch {
    balanceData = { total: '0', onChainBalances: {} };
  }
  render();
}

export function hide() {}
