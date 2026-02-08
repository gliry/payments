// ============================================================================
// Screen: Receive, Collect & Top Up
// ============================================================================

import * as state from '../state.js';
import { wallet, operations } from '../api.js';
import { formatUSDC, getChainSVG, getAllChains, getChainMeta, copyToClipboard, formatAddress, CHAIN_CONFIG, getChainKeyByChainId, formatTokenBalance } from '../utils.js';
import { showToast } from '../components/toast.js';
import { statusBadge } from '../components/status-badge.js';
import { chainBadge } from '../components/chain-icon.js';
import { navigate } from '../app.js';
import { connectWallet, disconnectWallet, getConnectedAddress, getMultiChainBalances, switchChain, sendTransaction, waitForReceipt } from '../wallet-connect.js';
import { signAndSubmitUserOps } from '../userop.js';

let container;
let activeTab = 'receive';
let balanceData = null;

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
      Connect your MetaMask wallet to deposit USDC from any chain into your OmniFlow account.
      Funds are deposited into your Gateway unified balance.
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
      <p class="text-sm text-muted">Supports USDC across 6 chains</p>
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
  const isHubChain = selectedToken.type === 'usdc' && selectedToken.chainKey === HUB_CHAIN;

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
        <div class="topup-selected-token__chain">${meta.name}${isHubChain ? ' — Direct deposit' : ' — Cross-chain deposit'}</div>
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
  const isHubChain = selectedToken.type === 'usdc' && selectedToken.chainKey === HUB_CHAIN;

  const toAmount = topUpAmount;
  const estimatedTime = isHubChain ? '~30 sec' : '~2 min';
  const toolUsed = 'Gateway Bridge';

  return `
    <div class="flex items-center justify-between" style="margin-bottom: 20px;">
      <button class="btn btn--ghost btn--sm" id="topup-back">← Back</button>
      <h3 style="margin: 0;">Review Top Up</h3>
    </div>

    <div class="quote-card" style="margin-bottom: 20px;">
      <div class="quote-card__row">
        <span class="text-muted">From</span>
        <span style="font-weight: 600;">${topUpAmount} ${selectedToken.symbol}</span>
      </div>
      <div class="quote-card__row">
        <span class="text-muted">Chain</span>
        <span>${meta.name}</span>
      </div>
      <div class="quote-card__arrow">↓</div>
      <div class="quote-card__row">
        <span class="text-muted">To</span>
        <span style="font-weight: 600;">${toAmount} USDC</span>
      </div>
      <div class="quote-card__row">
        <span class="text-muted">Destination</span>
        <span>Arc → OmniFlow Wallet</span>
      </div>
      <div class="quote-card__row" style="border-top: 1px solid var(--color-border); margin-top: 8px; padding-top: 8px;">
        <span class="text-muted">Estimated time</span>
        <span>${estimatedTime}</span>
      </div>
      <div class="quote-card__row">
        <span class="text-muted">Via</span>
        <span>${toolUsed}</span>
      </div>
    </div>

    <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 16px; text-align: center;">
      Funds will be deposited to: <span class="text-mono">${formatAddress(omniflowAddress)}</span>
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
        ${topUpAmount} ${selectedToken?.symbol || ''} has been deposited into Gateway.
        Your unified balance will update shortly.
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
          address: NATIVE_TOKEN,
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

  // Build execution steps
  topUpExecSteps = [
    { label: `Switch to ${getChainMeta(selectedToken.chainKey).name}`, status: 'pending' },
    { label: 'Transfer USDC to wallet', status: 'pending' },
    { label: 'Confirming transaction', status: 'pending' },
    { label: 'Bridge deposit (passkey)', status: 'pending' },
    { label: 'Waiting for completion', status: 'pending' },
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

    // Step 2: Transfer USDC to AA wallet (MetaMask sends)
    topUpExecSteps[stepIdx].status = 'active';
    render();

    const amountBig = parseAmountToSmallestUnit(topUpAmount, selectedToken.decimals);
    const transferData = buildTransferData(omniflowAddress, amountBig);
    const txHash = await sendTransaction({
      from: externalWallet.address,
      to: CHAIN_CONFIG[selectedToken.chainKey].usdc,
      data: transferData,
    });

    topUpTxHash = txHash;
    topUpExecSteps[stepIdx].status = 'done';
    stepIdx++;
    render();

    // Step 3: Wait for tx to be mined
    topUpExecSteps[stepIdx].status = 'active';
    render();
    await waitForReceipt(txHash, srcChainId);
    topUpExecSteps[stepIdx].status = 'done';
    stepIdx++;
    render();

    // Step 4: Create bridge operation + sign deposit UserOp with passkey
    topUpExecSteps[stepIdx].status = 'active';
    render();

    const bridgeResult = await operations.bridge(selectedToken.chainKey, HUB_CHAIN, topUpAmount);
    const clientSteps = (bridgeResult.signRequests || []).filter(r => !r.serverSide);

    if (clientSteps.length > 0) {
      const signatures = await signAndSubmitUserOps(clientSteps, { paymaster: false });
      await operations.submit(bridgeResult.id, signatures);
    }

    topUpExecSteps[stepIdx].status = 'done';
    stepIdx++;
    render();

    // Step 5: Poll for cross-chain completion
    topUpExecSteps[stepIdx].status = 'active';
    render();

    let attempts = 0;
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const updated = await operations.get(bridgeResult.id);
        if (updated.status === 'COMPLETED') break;
        if (updated.status === 'FAILED') throw new Error('Bridge operation failed');
      } catch (e) {
        if (e.message === 'Bridge operation failed') throw e;
      }
      attempts++;
    }

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

async function handleCollect() {
  const checked = [...container.querySelectorAll('.collect-chain-check:checked')].map(el => el.value);
  if (checked.length === 0) {
    showToast('Select at least one chain', 'warning');
    return;
  }

  const btn = document.getElementById('collect-btn');
  const resultEl = document.getElementById('collect-result');
  btn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Collecting...';
  btn.disabled = true;

  try {
    // 1. Create collect operation
    const result = await operations.collect(checked, HUB_CHAIN);

    resultEl.innerHTML = `
      <div class="card" style="background: rgba(59, 130, 246, 0.05); border-color: rgba(59, 130, 246, 0.2);">
        <div class="text-sm" style="font-weight: 600; color: var(--color-primary); margin-bottom: 4px;">Processing collect...</div>
        <div class="text-sm">Chains: ${checked.map(c => getChainMeta(c).name).join(', ')}</div>
        <div class="text-sm" style="margin-top: 8px;" id="collect-poll-status">${statusBadge(result.status)}</div>
      </div>
    `;

    // 2. Sign UserOps with passkey (approve+deposit per chain)
    const clientSteps = (result.signRequests || []).filter(r => !r.serverSide);
    if (clientSteps.length > 0) {
      resultEl.querySelector('.text-sm[style*="font-weight: 600"]').textContent = 'Signing with passkey...';
      const signatures = await signAndSubmitUserOps(clientSteps);
      await operations.submit(result.id, signatures);
    }

    // 3. Poll until completed
    let attempts = 0;
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const updated = await operations.get(result.id);
        const pollEl = document.getElementById('collect-poll-status');
        if (pollEl) pollEl.innerHTML = statusBadge(updated.status);

        if (updated.status === 'COMPLETED') {
          resultEl.innerHTML = `
            <div class="card" style="background: rgba(16, 185, 129, 0.05); border-color: rgba(16, 185, 129, 0.2);">
              <div class="text-sm" style="font-weight: 600; color: var(--color-success); margin-bottom: 4px;">Collect completed!</div>
              <div class="text-sm">Chains: ${checked.map(c => getChainMeta(c).name).join(', ')}</div>
            </div>
          `;
          showToast('Collect completed', 'success');
          // Refresh balances
          try { balanceData = await wallet.balances(); render(); } catch {}
          return;
        }
        if (updated.status === 'FAILED') {
          throw new Error('Collect operation failed');
        }
      } catch (e) {
        if (e.message === 'Collect operation failed') throw e;
      }
      attempts++;
    }

    showToast('Collect submitted — check History for updates', 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
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
  resetTopUpState();

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
