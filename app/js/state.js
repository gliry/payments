// ============================================================================
// OmniFlow Dashboard — State Management
// ============================================================================

const WALLET_KEY = 'omniflow_wallet';
const ACCOUNT_KEY = 'omniflow_account';

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

export function getAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setAccount(account) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  bus.dispatchEvent(new CustomEvent('account-change', { detail: account }));
}

export function getAccountId() {
  const account = getAccount();
  return account?.id || null;
}

export function clearAll() {
  localStorage.removeItem(WALLET_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
  bus.dispatchEvent(new CustomEvent('logout'));
}

export function isAuthenticated() {
  return getWallet() !== null && getAccount() !== null;
}

export function on(event, callback) {
  bus.addEventListener(event, callback);
}

export function off(event, callback) {
  bus.removeEventListener(event, callback);
}
