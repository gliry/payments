// ============================================================================
// Screen: Onboarding
// ============================================================================

import { registerPasskey, loginPasskey } from '../auth.js';
import * as state from '../state.js';
import { accounts } from '../api.js';
import { navigate } from '../app.js';

let statusEl, walletEl, walletAddrEl;

function showStatus(msg, type = 'info') {
  statusEl.className = `onboarding-card__status show ${type}`;
  statusEl.innerHTML = type === 'info'
    ? `<span class="loading-spinner loading-spinner--sm"></span> ${msg}`
    : msg;
}

function hideStatus() {
  statusEl.className = 'onboarding-card__status';
}

function setButtonLoading(btn, loading) {
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Processing...';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.originalText || btn.textContent;
    btn.disabled = false;
  }
}

async function handleAuth(mode) {
  const username = document.getElementById('onboarding-username').value.trim();
  if (!username) {
    showStatus('Please enter an email or username', 'error');
    return;
  }

  const btn = mode === 'register'
    ? document.getElementById('onboarding-register-btn')
    : document.getElementById('onboarding-login-btn');

  setButtonLoading(btn, true);
  hideStatus();

  try {
    showStatus(mode === 'register' ? 'Creating passkey (Touch ID / Face ID)...' : 'Authenticating with passkey...');

    const wallet = mode === 'register'
      ? await registerPasskey(username)
      : await loginPasskey(username);

    state.setWallet(wallet);

    showStatus('Creating account...', 'info');

    // Create or get account from API
    let account;
    try {
      account = await accounts.create(wallet.username || username);
    } catch (err) {
      // Account might already exist — try to find it
      if (err.data?.error?.code === 'email_exists') {
        const list = await accounts.list();
        account = list.data.find(a => a.email === username);
      }
      if (!account) throw err;
    }

    state.setAccount(account);

    showStatus('Wallet created successfully!', 'success');

    // Show wallet address
    walletAddrEl.textContent = wallet.address;
    walletEl.classList.add('show');

  } catch (err) {
    console.error('Auth error:', err);
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

export function init() {
  statusEl = document.getElementById('onboarding-status');
  walletEl = document.getElementById('onboarding-wallet');
  walletAddrEl = document.getElementById('onboarding-wallet-address');

  document.getElementById('onboarding-register-btn').addEventListener('click', () => handleAuth('register'));
  document.getElementById('onboarding-login-btn').addEventListener('click', () => handleAuth('login'));
  document.getElementById('onboarding-continue-btn').addEventListener('click', () => {
    navigate('dashboard');
  });

  // Pre-fill if existing wallet
  const wallet = state.getWallet();
  if (wallet?.username) {
    document.getElementById('onboarding-username').value = wallet.username;
  }
}

export function show() {
  document.getElementById('header-title').textContent = 'Welcome';
}

export function hide() {
  hideStatus();
  walletEl.classList.remove('show');
}
