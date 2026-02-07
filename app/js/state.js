// ============================================================================
// OmniFlow Dashboard — State Management
// ============================================================================

const WALLET_KEY = 'omniflow_wallet';
const USER_KEY = 'omniflow_user';
const TOKEN_KEY = 'omniflow_token';

const bus = new EventTarget();

export function getWallet() {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setWallet(wallet) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
  bus.dispatchEvent(new CustomEvent('wallet-change', { detail: wallet }));
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  bus.dispatchEvent(new CustomEvent('user-change', { detail: user }));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAll() {
  localStorage.removeItem(WALLET_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  bus.dispatchEvent(new CustomEvent('logout'));
}

export function isAuthenticated() {
  return getToken() !== null && getUser() !== null;
}

export function on(event, callback) {
  bus.addEventListener(event, callback);
}

export function off(event, callback) {
  bus.removeEventListener(event, callback);
}
