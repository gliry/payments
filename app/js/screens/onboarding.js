// ============================================================================
// Screen: Onboarding
// ============================================================================

import { registerPasskey, loginPasskey } from '../auth.js';
import * as state from '../state.js';
import { auth } from '../api.js';
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

    let wallet;
    try {
      wallet = mode === 'register'
        ? await registerPasskey(username)
        : await loginPasskey(username);
    } catch (passkeyErr) {
      // If register fails (username duplicated in Circle), try login passkey instead
      if (mode === 'register' && passkeyErr.message?.includes('duplicated')) {
        showStatus('Passkey exists, authenticating...', 'info');
        wallet = await loginPasskey(username);
      } else {
        throw passkeyErr;
      }
    }

    state.setWallet(wallet);

    showStatus('Connecting to server...', 'info');

    // Try the intended backend call; fall back if needed
    let result;
    try {
      if (mode === 'register') {
        result = await auth.register(wallet.username, wallet.credentialId, wallet.publicKey);
      } else {
        result = await auth.login(wallet.username, wallet.credentialId);
      }
    } catch (apiErr) {
      // If login fails (user not in DB), try register on backend
      if (mode === 'login' && apiErr.status === 401) {
        showStatus('Registering new account...', 'info');
        result = await auth.register(wallet.username, wallet.credentialId, wallet.publicKey);
      }
      // If register fails (user already exists in DB), try login
      else if (mode === 'register' && apiErr.status === 409) {
        showStatus('Account exists, logging in...', 'info');
        result = await auth.login(wallet.username, wallet.credentialId);
      }
      else {
        throw apiErr;
      }
    }

    state.setToken(result.accessToken);
    state.setUser(result.user);

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
