// ============================================================================
// Screen: Receive, Collect & Top Up
// ============================================================================

import * as state from '../state.js';
import { wallet, operations } from '../api.js';
import { formatUSDC, getChainSVG, getAllChains, getChainMeta, copyToClipboard, formatAddress, CHAIN_CONFIG, getChainKeyByChainId, formatTokenBalance, KNOWN_TOKENS, getTokenBalance } from '../utils.js';
import { showToast } from '../components/toast.js';
import { statusBadge } from '../components/status-badge.js';
import { chainBadge } from '../components/chain-icon.js';
import { navigate } from '../app.js';
import { connectWallet, disconnectWallet, getConnectedAddress, getMultiChainBalances, switchChain, sendTransaction, waitForReceipt } from '../wallet-connect.js';
import { signAndSubmitUserOps } from '../userop.js';
import { estimateUSDCOutput } from '../lifi.js';

let container;
let activeTab = 'receive';
let balanceData = null;
let aaTokenBalances = null;  // [{ chainKey, symbol, address, decimals, balance }] | null

// Top-up state
let externalWallet = null;     // { address, chainId }
let externalBalances = null;   // array from getMultiChainBalances
let selectedToken = null;      // { chainKey, type: 'native'|'usdc', balance, symbol, decimals, address }
let topUpAmount = '';
let topUpQuote = null;
let topUpStep = 'connect';     // connect | balances | amount | confirm | executing | success
let topUpTxHash = null;
let topUpExecSteps = [];       // [{ label, status: 'pending'|'active'|'done' }]

// Hub chain = Polygon (branded as "Arc")
const HUB_CHAIN = 'polygon';
const HUB_USDC = CHAIN_CONFIG.polygon.usdc;
const HUB_CHAIN_ID = CHAIN_CONFIG.polygon.chainId;

function render() {
  const user = state.getUser();
  const walletInfo = state.getWallet();
  const address = user?.walletAddress || walletInfo?.address || '';

  container.innerHTML = `
    <!-- Tabs -->
    <div class="tabs">
      <button class="tab ${activeTab === 'receive' ? 'active' : ''}" data-tab="receive">Receive</button>
      <button class="tab ${activeTab === 'collect' ? 'active' : ''}" data-tab="collect">Collect</button>
      <button class="tab ${activeTab === 'topup' ? 'active' : ''}" data-tab="topup">Top Up</button>
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

    <!-- Tab: Top Up -->
    <div id="tab-topup" class="tab-content" ${activeTab !== 'topup' ? 'style="display:none;"' : ''}>
      <div class="card" style="margin-bottom: 24px;">
        ${renderTopUp(address)}
      </div>
    </div>
  `;

  setupListeners();
}

function renderCollectForm() {
  const onChain = balanceData.onChainBalances || {};
  const chains = Object.keys(onChain).filter(c => c !== HUB_CHAIN && parseFloat(onChain[c]) > 0);
  const hasTokens = aaTokenBalances && aaTokenBalances.length > 0;

  if (chains.length === 0 && !hasTokens) {
    return `
      <div class="empty-state" style="padding: 24px;">
        <div class="empty-state__title">No on-chain balances</div>
        <div class="empty-state__desc">Receive funds first, then collect them here.</div>
      </div>
    `;
  }

  // USDC section
  let usdcSection = '';
  if (chains.length > 0) {
    usdcSection = `
      <div style="margin-bottom: 20px;">
        <label class="input-label" style="margin-bottom: 12px;">USDC balances</label>
        ${chains.map(chain => `
          <label class="flex items-center gap-8" style="padding: 10px 0; border-bottom: 1px solid var(--color-border); cursor: pointer;">
            <input type="checkbox" class="collect-chain-check" value="${chain}" checked>
            ${chainBadge(chain)}
            <span class="text-sm" style="flex: 1; font-weight: 500;">${getChainMeta(chain).name}</span>
            <span class="text-mono text-sm" style="font-weight: 600;">${formatUSDC(onChain[chain])}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  // Non-USDC token section
  let tokenSection = '';
  if (hasTokens) {
    tokenSection = `
      <div style="margin-bottom: 20px;">
        <label class="input-label" style="margin-bottom: 4px;">Other tokens</label>
        <div class="text-xs" style="margin-bottom: 12px; padding: 6px 10px; background: linear-gradient(90deg, rgba(156,107,255,0.08), rgba(40,160,240,0.08)); border-radius: 6px; border-left: 3px solid #9c6bff;">
          <strong style="color: #9c6bff;">LiFi Route</strong>
          <span class="text-muted"> &mdash; these tokens will be automatically swapped to USDC via LiFi aggregator before deposit</span>
        </div>
        ${aaTokenBalances.map((t, i) => {
          const humanAmount = parseFloat(formatTokenBalance(t.balance, t.decimals));
          const estUsdc = estimateUSDCOutput(t.symbol, humanAmount);
          return `
            <label class="flex items-center gap-8" style="padding: 10px 0; border-bottom: 1px solid var(--color-border); cursor: pointer;">
              <input type="checkbox" class="collect-token-check" data-idx="${i}"
                     data-chain="${t.chainKey}" data-token="${t.address}" data-decimals="${t.decimals}" data-symbol="${t.symbol}" checked>
              ${chainBadge(t.chainKey)}
              <span class="text-sm" style="flex: 1; font-weight: 500;">
                ${t.symbol} on ${getChainMeta(t.chainKey).name}
                <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(156,107,255,0.12);color:#9c6bff;font-weight:600;margin-left:4px;">LiFi</span>
              </span>
              <span class="text-mono text-sm" style="font-weight: 600; text-align: right;">
                <input type="text" inputmode="decimal" class="collect-token-amount" data-idx="${i}" data-max="${humanAmount}"
                       value="${humanAmount.toFixed(4)}" autocomplete="off"
                       style="width: 90px; text-align: right; font-family: inherit; font-size: inherit; font-weight: inherit; padding: 2px 4px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg-soft);">
                ${t.symbol}<br>
                <span class="text-muted" style="font-size: 0.7rem;" id="collect-token-est-${i}">~${formatUSDC(estUsdc)}</span>
              </span>
            </label>
          `;
        }).join('')}
      </div>
    `;
  }

  // Summary totals
  const usdcTotal = chains.reduce((s, c) => s + parseFloat(onChain[c]), 0);
  let tokenEstTotal = 0;
  if (hasTokens) {
    for (const t of aaTokenBalances) {
      const humanAmount = parseFloat(formatTokenBalance(t.balance, t.decimals));
      tokenEstTotal += estimateUSDCOutput(t.symbol, humanAmount);
    }
  }

  return `
    ${usdcSection}
    ${tokenSection}

    <div style="background: var(--color-bg-soft); border-radius: 10px; padding: 14px; margin-bottom: 20px;">
      <div class="flex justify-between text-sm" style="margin-bottom: 4px;">
        <span class="text-muted">Selected total</span>
        <span class="text-mono" style="font-weight: 600;" id="collect-total">${formatUSDC(usdcTotal + tokenEstTotal)}</span>
      </div>
      ${hasTokens ? `
      <div class="flex justify-between text-sm" style="margin-bottom: 4px;">
        <span class="text-muted">USDC direct</span>
        <span class="text-mono text-sm" id="collect-usdc-subtotal">${formatUSDC(usdcTotal)}</span>
      </div>
      <div class="flex justify-between text-sm" style="margin-bottom: 4px;">
        <span class="text-muted">Swap estimate</span>
        <span class="text-mono text-sm" id="collect-swap-subtotal">~${formatUSDC(tokenEstTotal)}</span>
      </div>
      ` : ''}
      <div class="flex justify-between text-sm">
        <span class="text-muted">Destination</span>
        <span style="font-weight: 500;">Arc (gateway)</span>
      </div>
    </div>

    <button id="collect-btn" class="btn btn--primary btn--full">Collect to Arc</button>
    <div id="collect-result" style="margin-top: 16px;"></div>
  `;
}

// ============================================================================
// Top Up rendering
// ============================================================================

function renderTopUp(omniflowAddress) {
  switch (topUpStep) {
    case 'connect':   return renderTopUpConnect();
    case 'balances':  return renderTopUpBalances();
    case 'amount':    return renderTopUpAmount();
    case 'confirm':   return renderTopUpConfirm(omniflowAddress);
    case 'executing': return renderTopUpExecuting();
    case 'success':   return renderTopUpSuccess();
    default:          return renderTopUpConnect();
  }
}

function renderTopUpConnect() {
  return `
    <h3 style="margin-bottom: 8px;">Top Up from External Wallet</h3>
    <p class="text-sm text-muted" style="margin-bottom: 24px;">
      Connect your MetaMask wallet to transfer tokens into your OmniFlow wallet.
      Any ERC-20 token is supported — use Collect to sweep them into your unified balance.
    </p>
    <div style="text-align: center; padding: 24px 0;">
      <svg viewBox="0 0 40 40" width="56" height="56" style="margin-bottom: 16px; opacity: 0.6;">
        <rect x="4" y="12" width="32" height="20" rx="4" stroke="currentColor" stroke-width="2" fill="none"/>
        <path d="M28 22 a2 2 0 1 1 0 0.01" fill="currentColor"/>
        <path d="M12 12 V10 a6 6 0 0 1 12 0 V12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>
      <div style="margin-bottom: 24px;">
        <button id="topup-connect-btn" class="btn btn--primary btn--lg">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><circle cx="16" cy="12" r="1.5" fill="currentColor"/></svg>
          Connect MetaMask
        </button>
      </div>
      <p class="text-sm text-muted">Supports any token: USDC, WETH, USDT and more across 6 chains</p>
    </div>
  `;
}

function renderTopUpBalances() {
  const addr = externalWallet?.address || '';

  let balanceRows = '';
  if (externalBalances === null) {
    balanceRows = `
      <div class="empty-state" style="padding: 24px;">
        <span class="loading-spinner"></span>
        <div class="empty-state__desc" style="margin-top: 12px;">Scanning balances across chains...</div>
      </div>
    `;
  } else if (externalBalances.length === 0) {
    balanceRows = `
      <div class="empty-state" style="padding: 24px;">
        <div class="empty-state__title">No balances found</div>
        <div class="empty-state__desc">This wallet has no tokens on supported chains.</div>
      </div>
    `;
  } else {
    const rows = [];
    for (const b of externalBalances) {
      const meta = getChainMeta(b.chainKey);
      if (b.nativeBalance > 0n) {
        rows.push(`
          <div class="topup-balance-row" data-chain="${b.chainKey}" data-type="native">
            <div class="topup-balance-row__icon">${getChainSVG(b.chainKey, 36)}</div>
            <div class="topup-balance-row__info">
              <div class="topup-balance-row__symbol">${b.nativeSymbol}</div>
              <div class="topup-balance-row__chain">${meta.name}</div>
            </div>
            <div class="topup-balance-row__amount">${b.nativeFormatted}</div>
          </div>
        `);
      }
      if (b.usdcBalance > 0n) {
        rows.push(`
          <div class="topup-balance-row" data-chain="${b.chainKey}" data-type="usdc">
            <div class="topup-balance-row__icon" style="background: #2775ca; border-radius: 50%; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
              <span style="color: white; font-weight: 700; font-size: 14px;">$</span>
            </div>
            <div class="topup-balance-row__info">
              <div class="topup-balance-row__symbol">USDC</div>
              <div class="topup-balance-row__chain">${meta.name}</div>
            </div>
            <div class="topup-balance-row__amount">${b.usdcFormatted}</div>
          </div>
        `);
      }
      // Extra tokens (WETH, USDT, etc.)
      for (const t of (b.tokens || [])) {
        rows.push(`
          <div class="topup-balance-row" data-chain="${b.chainKey}" data-type="token" data-token-address="${t.address}" data-token-symbol="${t.symbol}" data-token-decimals="${t.decimals}">
            <div class="topup-balance-row__icon">${getChainSVG(b.chainKey, 36)}</div>
            <div class="topup-balance-row__info">
              <div class="topup-balance-row__symbol">${t.symbol}</div>
              <div class="topup-balance-row__chain">${meta.name}</div>
            </div>
            <div class="topup-balance-row__amount">${t.formatted}</div>
          </div>
        `);
      }
    }
    balanceRows = rows.join('');
  }

  return `
    <div class="flex items-center justify-between" style="margin-bottom: 20px;">
      <h3 style="margin: 0;">Select Token</h3>
      <div class="wallet-badge">
        <span class="wallet-badge__dot"></span>
        ${formatAddress(addr)}
        <button class="wallet-badge__disconnect" id="topup-disconnect" title="Disconnect">✕</button>
      </div>
    </div>
    <p class="text-sm text-muted" style="margin-bottom: 16px;">
      Choose a token to deposit into your OmniFlow wallet.
    </p>
    ${balanceRows}
  `;
}

function renderTopUpAmount() {
  if (!selectedToken) return '';

  const meta = getChainMeta(selectedToken.chainKey);

  return `
    <div class="flex items-center justify-between" style="margin-bottom: 20px;">
      <button class="btn btn--ghost btn--sm" id="topup-back">← Back</button>
      <div class="wallet-badge">
        <span class="wallet-badge__dot"></span>
        ${formatAddress(externalWallet?.address || '')}
      </div>
    </div>

    <div class="topup-selected-token">
      <div class="topup-selected-token__icon">
        ${selectedToken.type === 'usdc'
          ? '<div style="background: #2775ca; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: 700; font-size: 13px;">$</span></div>'
          : getChainSVG(selectedToken.chainKey, 32)}
      </div>
      <div>
        <div class="topup-selected-token__name">${selectedToken.symbol}</div>
        <div class="topup-selected-token__chain">${meta.name}</div>
      </div>
    </div>

    <div class="input-group" style="margin-bottom: 20px;">
      <label class="input-label">Amount</label>
      <div class="topup-amount-wrapper">
        <input type="text" inputmode="decimal" class="input input--lg" id="topup-amount-input" placeholder="0.00" value="${topUpAmount}" autocomplete="off">
        <button class="topup-max-btn" id="topup-max-btn">MAX</button>
      </div>
      <div class="input-help">
        Available: ${formatTokenBalance(selectedToken.balance, selectedToken.decimals)} ${selectedToken.symbol}
      </div>
    </div>

    <button id="topup-get-quote" class="btn btn--primary btn--full" ${!topUpAmount ? 'disabled' : ''}>
      Continue
    </button>
  `;
}

function renderTopUpConfirm(omniflowAddress) {
  if (!selectedToken) return '';

  const meta = getChainMeta(selectedToken.chainKey);

  return `
    <div class="flex items-center justify-between" style="margin-bottom: 20px;">
      <button class="btn btn--ghost btn--sm" id="topup-back">← Back</button>
      <h3 style="margin: 0;">Review Top Up</h3>
    </div>

    <div class="quote-card" style="margin-bottom: 20px;">
      <div class="quote-card__row">
        <span class="text-muted">Amount</span>
        <span style="font-weight: 600;">${topUpAmount} ${selectedToken.symbol}</span>
      </div>
      <div class="quote-card__row">
        <span class="text-muted">Chain</span>
        <span>${meta.name}</span>
      </div>
      <div class="quote-card__arrow">↓</div>
      <div class="quote-card__row">
        <span class="text-muted">Destination</span>
        <span>OmniFlow Wallet</span>
      </div>
    </div>

    <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 16px; text-align: center;">
      Tokens will be transferred to: <span class="text-mono">${formatAddress(omniflowAddress)}</span>
    </div>

    <button id="topup-confirm" class="btn btn--primary btn--full btn--lg">Confirm Top Up</button>
  `;
}

function renderTopUpExecuting() {
  return `
    <h3 style="margin-bottom: 20px; text-align: center;">Executing Top Up</h3>
    <div class="topup-exec-steps">
      ${topUpExecSteps.map((step, i) => {
        const cls = step.status === 'active' ? 'active' : step.status === 'done' ? 'done' : '';
        const icon = step.status === 'done' ? '✓' : step.status === 'active' ? `<span class="topup-exec-step__spinner"></span>` : (i + 1);
        return `
          <div class="topup-exec-step ${cls}">
            <div class="topup-exec-step__indicator">${icon}</div>
            <span>${step.label}</span>
          </div>
        `;
      }).join('')}
    </div>
    <p class="text-sm text-muted" style="text-align: center; margin-top: 16px;">
      Confirm the MetaMask transaction when prompted.
    </p>
  `;
}

function renderTopUpSuccess() {
  const chainKey = selectedToken?.chainKey || HUB_CHAIN;
  const explorerBase = getExplorerUrl(chainKey);
  const txLink = topUpTxHash ? `${explorerBase}/tx/${topUpTxHash}` : '';

  return `
    <div style="text-align: center; padding: 24px 0;">
      <div class="success-checkmark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      <h3 style="margin-bottom: 8px;">Top Up Submitted!</h3>
      <p class="text-sm text-muted" style="margin-bottom: 24px;">
        ${topUpAmount} ${selectedToken?.symbol || ''} has been transferred to your wallet.
        Use Collect to sweep funds into your unified balance.
      </p>
      ${txLink ? `<a href="${txLink}" target="_blank" class="btn btn--secondary btn--sm" style="margin-bottom: 12px;">View on Explorer ↗</a><br>` : ''}
      <button id="topup-done" class="btn btn--primary" style="margin-top: 8px;">Done</button>
    </div>
  `;
}

function getExplorerUrl(chainKey) {
  const explorers = {
    base: 'https://basescan.org',
    arbitrum: 'https://arbiscan.io',
    avalanche: 'https://snowtrace.io',
    ethereum: 'https://etherscan.io',
    optimism: 'https://optimistic.etherscan.io',
    polygon: 'https://polygonscan.com',
  };
  return explorers[chainKey] || 'https://etherscan.io';
}

// ============================================================================
// Listeners
// ============================================================================

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

  // Collect checkboxes → update total (USDC + token estimates)
  const updateCollectTotal = () => {
    const onChain = balanceData?.onChainBalances || {};
    const checkedChains = [...container.querySelectorAll('.collect-chain-check:checked')].map(el => el.value);
    const usdcTotal = checkedChains.reduce((s, c) => s + parseFloat(onChain[c] || 0), 0);

    let tokenEstTotal = 0;
    container.querySelectorAll('.collect-token-check:checked').forEach(el => {
      const idx = parseInt(el.dataset.idx);
      const t = aaTokenBalances?.[idx];
      if (t) {
        const amountInput = container.querySelector(`.collect-token-amount[data-idx="${idx}"]`);
        const maxAmount = parseFloat(formatTokenBalance(t.balance, t.decimals));
        let userAmount = amountInput ? parseFloat(amountInput.value) : maxAmount;
        if (isNaN(userAmount) || userAmount <= 0) userAmount = 0;
        if (userAmount > maxAmount) userAmount = maxAmount;
        const est = estimateUSDCOutput(t.symbol, userAmount);
        tokenEstTotal += est;
        const estEl = document.getElementById(`collect-token-est-${idx}`);
        if (estEl) estEl.textContent = '~' + formatUSDC(est);
      }
    });

    const totalEl = document.getElementById('collect-total');
    if (totalEl) totalEl.textContent = formatUSDC(usdcTotal + tokenEstTotal);
    const usdcSub = document.getElementById('collect-usdc-subtotal');
    if (usdcSub) usdcSub.textContent = formatUSDC(usdcTotal);
    const swapSub = document.getElementById('collect-swap-subtotal');
    if (swapSub) swapSub.textContent = '~' + formatUSDC(tokenEstTotal);
  };
  container.querySelectorAll('.collect-chain-check').forEach(cb => cb.addEventListener('change', updateCollectTotal));
  container.querySelectorAll('.collect-token-check').forEach(cb => cb.addEventListener('change', updateCollectTotal));
  container.querySelectorAll('.collect-token-amount').forEach(input => {
    input.addEventListener('input', () => {
      const max = parseFloat(input.dataset.max);
      let val = parseFloat(input.value);
      if (!isNaN(val) && val > max) { input.value = max.toFixed(4); }
      updateCollectTotal();
    });
    // Prevent checkbox toggle when clicking inside the input
    input.addEventListener('click', e => e.stopPropagation());
  });

  // Collect button
  document.getElementById('collect-btn')?.addEventListener('click', handleCollect);

  // --- Top Up listeners ---

  // Connect MetaMask
  document.getElementById('topup-connect-btn')?.addEventListener('click', handleTopUpConnect);

  // Disconnect
  document.getElementById('topup-disconnect')?.addEventListener('click', () => {
    disconnectWallet();
    resetTopUpState();
    render();
  });

  // Balance row click → select token
  container.querySelectorAll('.topup-balance-row').forEach(row => {
    row.addEventListener('click', () => {
      const chainKey = row.dataset.chain;
      const type = row.dataset.type;
      const balEntry = externalBalances?.find(b => b.chainKey === chainKey);
      if (!balEntry) return;

      const cfg = CHAIN_CONFIG[chainKey];
      if (type === 'native') {
        selectedToken = {
          chainKey,
          type: 'native',
          balance: balEntry.nativeBalance,
          symbol: balEntry.nativeSymbol,
          decimals: 18,
          address: null,
        };
      } else if (type === 'token') {
        const tokenAddr = row.dataset.tokenAddress;
        const tokenEntry = balEntry.tokens?.find(t => t.address === tokenAddr);
        if (!tokenEntry) return;
        selectedToken = {
          chainKey,
          type: 'token',
          balance: tokenEntry.balance,
          symbol: tokenEntry.symbol,
          decimals: tokenEntry.decimals,
          address: tokenAddr,
        };
      } else {
        selectedToken = {
          chainKey,
          type: 'usdc',
          balance: balEntry.usdcBalance,
          symbol: 'USDC',
          decimals: 6,
          address: cfg.usdc,
        };
      }

      topUpAmount = '';
      topUpQuote = null;
      topUpStep = 'amount';
      render();
    });
  });

  // Amount input
  document.getElementById('topup-amount-input')?.addEventListener('input', (e) => {
    topUpAmount = e.target.value;
    const btn = document.getElementById('topup-get-quote');
    if (btn) btn.disabled = !topUpAmount || parseFloat(topUpAmount) <= 0;
  });

  // MAX button
  document.getElementById('topup-max-btn')?.addEventListener('click', () => {
    if (!selectedToken) return;
    const formatted = formatTokenBalance(selectedToken.balance, selectedToken.decimals);
    topUpAmount = formatted;
    const input = document.getElementById('topup-amount-input');
    if (input) input.value = formatted;
    const btn = document.getElementById('topup-get-quote');
    if (btn) btn.disabled = false;
  });

  // Get Quote
  document.getElementById('topup-get-quote')?.addEventListener('click', handleGetQuote);

  // Confirm
  document.getElementById('topup-confirm')?.addEventListener('click', handleTopUpExecute);

  // Back
  document.getElementById('topup-back')?.addEventListener('click', () => {
    if (topUpStep === 'amount') {
      topUpStep = 'balances';
      selectedToken = null;
    } else if (topUpStep === 'confirm') {
      topUpStep = 'amount';
      topUpQuote = null;
    }
    render();
  });

  // Done
  document.getElementById('topup-done')?.addEventListener('click', () => {
    resetTopUpState();
    render();
  });
}

// ============================================================================
// Top Up handlers
// ============================================================================

async function handleTopUpConnect() {
  const btn = document.getElementById('topup-connect-btn');
  btn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Connecting...';
  btn.disabled = true;

  try {
    externalWallet = await connectWallet();
    topUpStep = 'balances';
    externalBalances = null;
    render();

    // Fetch balances in background
    externalBalances = await getMultiChainBalances(externalWallet.address);
    render();
  } catch (err) {
    showToast(`MetaMask: ${err.message}`, 'error');
    btn.textContent = 'Connect MetaMask';
    btn.disabled = false;
  }
}

async function handleGetQuote() {
  if (!selectedToken || !topUpAmount) return;

  // No LI.FI quote needed — we use Gateway bridge (approve+deposit) via backend
  topUpQuote = null;
  topUpStep = 'confirm';
  render();
}

async function handleTopUpExecute() {
  if (!selectedToken || !topUpAmount) return;

  const user = state.getUser();
  const walletInfo = state.getWallet();
  const omniflowAddress = user?.walletAddress || walletInfo?.address || '';

  const srcChainId = CHAIN_CONFIG[selectedToken.chainKey].chainId;

  // Build execution steps — just switch + transfer + confirm
  topUpExecSteps = [
    { label: `Switch to ${getChainMeta(selectedToken.chainKey).name}`, status: 'pending' },
    { label: `Transfer ${selectedToken.symbol} to wallet`, status: 'pending' },
    { label: 'Confirming transaction', status: 'pending' },
  ];

  topUpStep = 'executing';
  render();

  let stepIdx = 0;

  try {
    // Step 1: Switch chain (MetaMask)
    topUpExecSteps[stepIdx].status = 'active';
    render();
    await switchChain(srcChainId);
    topUpExecSteps[stepIdx].status = 'done';
    stepIdx++;
    render();

    // Step 2: Transfer token to AA wallet (MetaMask sends)
    topUpExecSteps[stepIdx].status = 'active';
    render();

    const amountBig = parseAmountToSmallestUnit(topUpAmount, selectedToken.decimals);
    let txHash;

    if (selectedToken.type === 'native') {
      // Native token (ETH/AVAX) — plain value transfer
      txHash = await sendTransaction({
        from: externalWallet.address,
        to: omniflowAddress,
        value: '0x' + BigInt(amountBig).toString(16),
      });
    } else {
      // ERC20 token — transfer(address, uint256)
      const tokenAddress = selectedToken.type === 'usdc'
        ? CHAIN_CONFIG[selectedToken.chainKey].usdc
        : selectedToken.address;
      const transferData = buildTransferData(omniflowAddress, amountBig);
      txHash = await sendTransaction({
        from: externalWallet.address,
        to: tokenAddress,
        data: transferData,
      });
    }

    topUpTxHash = txHash;
    topUpExecSteps[stepIdx].status = 'done';
    stepIdx++;
    render();

    // Step 3: Wait for tx to be mined
    topUpExecSteps[stepIdx].status = 'active';
    render();
    await waitForReceipt(txHash, srcChainId);
    topUpExecSteps[stepIdx].status = 'done';
    render();

    topUpStep = 'success';
    render();

  } catch (err) {
    showToast(`Transaction failed: ${err.message}`, 'error');
    topUpStep = 'confirm';
    render();
  }
}

function resetTopUpState() {
  externalWallet = null;
  externalBalances = null;
  selectedToken = null;
  topUpAmount = '';
  topUpQuote = null;
  topUpStep = 'connect';
  topUpTxHash = null;
  topUpExecSteps = [];
}

// ============================================================================
// Collect handler
// ============================================================================

function parseEstimatedTime(str) {
  if (!str) return 120;
  const rangeMatch = str.match(/(\d+)\s*-\s*(\d+)\s*min/i);
  if (rangeMatch) return parseInt(rangeMatch[2]) * 60;
  const secMatch = str.match(/~?(\d+)\s*s/i);
  if (secMatch) return parseInt(secMatch[1]);
  const minMatch = str.match(/(\d+)\s*min/i);
  if (minMatch) return parseInt(minMatch[1]) * 60;
  return 120;
}

function formatCountdown(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function pollOperation(op, steps, renderSteps) {
  let attempts = 0;
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 3000));
    const updated = await operations.get(op.result.id);
    if (updated.status === 'COMPLETED') {
      steps[op.stepIdx].status = 'done';
      renderSteps();
      return;
    }
    if (updated.status === 'FAILED') {
      steps[op.stepIdx].status = 'error';
      renderSteps();
      throw new Error(`Operation failed: ${op.type}`);
    }
    attempts++;
  }
  steps[op.stepIdx].status = 'error';
  renderSteps();
  throw new Error(`Timeout waiting for ${op.type}`);
}

async function handleCollect() {
  const checkedChains = [...container.querySelectorAll('.collect-chain-check:checked')].map(el => el.value);
  const checkedTokens = [...container.querySelectorAll('.collect-token-check:checked')].map(el => {
    const idx = parseInt(el.dataset.idx);
    const t = aaTokenBalances?.[idx];
    if (!t) return null;
    const amountInput = container.querySelector(`.collect-token-amount[data-idx="${idx}"]`);
    const maxAmount = parseFloat(formatTokenBalance(t.balance, t.decimals));
    let userAmount = amountInput ? parseFloat(amountInput.value) : maxAmount;
    if (isNaN(userAmount) || userAmount <= 0) return null;
    if (userAmount > maxAmount) userAmount = maxAmount;
    return { ...t, userAmount };
  }).filter(Boolean);

  if (checkedChains.length === 0 && checkedTokens.length === 0) {
    showToast('Select at least one item to collect', 'warning');
    return;
  }

  const btn = document.getElementById('collect-btn');
  const resultEl = document.getElementById('collect-result');
  btn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Collecting...';
  btn.disabled = true;

  // Build progress steps
  const steps = [];
  for (const t of checkedTokens) {
    steps.push({ label: `Swapping ${t.userAmount.toFixed(4)} ${t.symbol} → USDC on ${getChainMeta(t.chainKey).name}`, status: 'pending' });
  }
  if (checkedChains.length > 0) {
    steps.push({ label: `Collecting USDC from ${checkedChains.map(c => getChainMeta(c).name).join(', ')}`, status: 'pending' });
  }

  let remainingSec = 0;
  let countdownInterval = null;

  const renderSteps = () => {
    const hasActive = steps.some(s => s.status === 'active');
    const countdownHtml = remainingSec > 0 && hasActive
      ? `<div class="collect-countdown">
           <span class="collect-countdown__time">~${formatCountdown(remainingSec)} remaining</span>
         </div>`
      : '';
    resultEl.innerHTML = countdownHtml + `
      <div class="topup-exec-steps">
        ${steps.map((step, i) => {
          const cls = step.status === 'active' ? 'active' : step.status === 'done' ? 'done' : step.status === 'error' ? 'done' : '';
          const icon = step.status === 'done' ? '✓' : step.status === 'active' ? '<span class="topup-exec-step__spinner"></span>' : step.status === 'error' ? '✕' : (i + 1);
          return `
            <div class="topup-exec-step ${cls}">
              <div class="topup-exec-step__indicator">${icon}</div>
              <span>${step.label}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  try {
    // Phase 1: Prepare all operations in parallel
    const allOps = [];
    const preparePromises = [];
    let stepIdx = 0;

    for (const t of checkedTokens) {
      const idx = stepIdx++;
      steps[idx].status = 'active';
      preparePromises.push(
        operations.swapDeposit(t.chainKey, t.address, t.userAmount, t.decimals)
          .then(result => allOps.push({ type: 'swap', result, stepIdx: idx }))
      );
    }
    if (checkedChains.length > 0) {
      const idx = stepIdx++;
      steps[idx].status = 'active';
      preparePromises.push(
        operations.collect(checkedChains, HUB_CHAIN)
          .then(result => allOps.push({ type: 'collect', result, stepIdx: idx }))
      );
    }
    renderSteps();
    await Promise.all(preparePromises);

    // Phase 2: Collect all client-side signRequests and sign in one batch
    const allClientSteps = allOps.flatMap(op =>
      (op.result.signRequests || []).filter(r => !r.serverSide)
    );
    const allSignatures = allClientSteps.length > 0
      ? await signAndSubmitUserOps(allClientSteps)
      : [];

    // Phase 3: Map signatures back to operations and submit all in parallel
    await Promise.all(allOps.map(op => {
      const opStepIds = new Set(
        (op.result.signRequests || []).filter(r => !r.serverSide).map(r => r.stepId)
      );
      const opSigs = allSignatures.filter(s => opStepIds.has(s.stepId));
      return operations.submit(op.result.id, opSigs);
    }));

    // Phase 4: Start countdown timer based on estimated times
    const maxEstSec = Math.max(...allOps.map(op => parseEstimatedTime(op.result.summary?.estimatedTime)));
    remainingSec = maxEstSec;
    renderSteps();
    countdownInterval = setInterval(() => {
      remainingSec = Math.max(0, remainingSec - 1);
      renderSteps();
    }, 1000);

    // Poll ALL operations in parallel
    await Promise.allSettled(allOps.map(op => pollOperation(op, steps, renderSteps)));

    clearInterval(countdownInterval);
    countdownInterval = null;
    remainingSec = 0;

    // Check if any operation failed
    const failed = steps.filter(s => s.status === 'error');
    if (failed.length > 0) {
      renderSteps();
      showToast(`${failed.length} operation(s) failed`, 'error');
    } else {
      renderSteps();
      showToast('Collect completed', 'success');
    }

    // Refresh balances
    try {
      balanceData = await wallet.balances();
      aaTokenBalances = null;
      render();
    } catch {}

  } catch (err) {
    if (countdownInterval) clearInterval(countdownInterval);
    remainingSec = 0;
    // Mark any still-pending steps as error
    steps.forEach(s => { if (s.status === 'active' || s.status === 'pending') s.status = 'error'; });
    renderSteps();
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (countdownInterval) clearInterval(countdownInterval);
    btn.textContent = 'Collect to Arc';
    btn.disabled = false;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function parseAmountToSmallestUnit(amount, decimals) {
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  let frac = parts[1] || '';
  frac = frac.padEnd(decimals, '0').slice(0, decimals);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac)).toString();
}

/** Encode ERC20 transfer(address,uint256) */
function buildTransferData(to, amount) {
  // transfer(address,uint256) selector = 0xa9059cbb
  const addr = to.slice(2).toLowerCase().padStart(64, '0');
  const amt = BigInt(amount).toString(16).padStart(64, '0');
  return '0xa9059cbb' + addr + amt;
}

// ============================================================================
// Lifecycle
// ============================================================================

export function init() {
  container = document.getElementById('deposit-content');

  // Listen for external wallet changes
  window.addEventListener('wallet-external-change', async () => {
    if (topUpStep === 'balances' && externalWallet) {
      const addr = getConnectedAddress();
      if (addr) {
        externalWallet.address = addr;
        externalBalances = null;
        render();
        externalBalances = await getMultiChainBalances(addr);
        render();
      }
    }
  });
}

export async function show() {
  document.getElementById('header-title').textContent = 'Receive & Collect';
  activeTab = 'receive';
  balanceData = null;
  aaTokenBalances = null;
  resetTopUpState();

  render();

  // Fetch balances for Collect tab in background
  try {
    balanceData = await wallet.balances();
  } catch {
    balanceData = { total: '0', onChainBalances: {} };
  }
  render();

  // Scan non-USDC tokens + native ETH in AA wallet in parallel
  const user = state.getUser();
  const walletAddress = user?.walletAddress || state.getWallet()?.address;
  if (walletAddress) {
    const results = [];
    const promises = [];
    // Scan known ERC20 tokens
    for (const [chainKey, tokens] of Object.entries(KNOWN_TOKENS)) {
      const rpc = CHAIN_CONFIG[chainKey]?.rpc;
      if (!rpc) continue;
      for (const token of tokens) {
        promises.push(
          getTokenBalance(rpc, token.address, walletAddress)
            .then(bal => { if (bal > 0n) results.push({ chainKey, ...token, balance: bal }); })
            .catch(() => {})
        );
      }
    }
    // Scan native ETH/AVAX balance per chain (for swap-deposit)
    for (const [chainKey, cfg] of Object.entries(CHAIN_CONFIG)) {
      if (chainKey === HUB_CHAIN) continue;
      promises.push(
        fetch(cfg.rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [walletAddress, 'latest'] }),
        }).then(r => r.json()).then(json => {
          const bal = BigInt(json.result || '0x0');
          if (bal > 0n) results.push({ chainKey, symbol: cfg.nativeSymbol, address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, balance: bal });
        }).catch(() => {})
      );
    }
    await Promise.allSettled(promises);
    aaTokenBalances = results;
    render();
  }
}

export function hide() {}
