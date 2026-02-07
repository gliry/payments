// ============================================================================
// OmniFlow Dashboard — API Client
// ============================================================================

import { getToken, clearAll } from './state.js';

const API_BASE = 'http://localhost:3000';

// Global API log — used by API Explorer screen
window.__apiLog = window.__apiLog || [];

/**
 * Make API call with logging + JWT auth
 */
export async function apiCall(method, path, body = null) {
  const url = `${API_BASE}${path}`;
  const startTime = performance.now();

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  const token = getToken();
  if (token) options.headers['Authorization'] = `Bearer ${token}`;

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  let response, data, error;

  try {
    response = await fetch(url, options);
    data = await response.json();
  } catch (err) {
    error = err;
  }

  const duration = Math.round(performance.now() - startTime);
  const status = response?.status || 0;

  // Log the call
  const logEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    method,
    path,
    url,
    status,
    duration,
    request: body,
    response: data || (error ? { error: error.message } : null),
  };

  window.__apiLog.unshift(logEntry);
  if (window.__apiLog.length > 100) window.__apiLog.length = 100;
  window.dispatchEvent(new CustomEvent('api-log', { detail: logEntry }));

  if (error) throw error;

  // Handle 401 — clear auth and redirect (skip for auth endpoints)
  if (status === 401 && !path.startsWith('/v1/auth/')) {
    clearAll();
    window.location.hash = 'onboarding';
    const authError = new Error('Session expired. Please log in again.');
    authError.status = 401;
    throw authError;
  }

  if (!response.ok) {
    const apiError = new Error(data?.message || data?.error?.message || `API error: ${status}`);
    apiError.status = status;
    apiError.data = data;
    throw apiError;
  }

  return data;
}

// Convenience methods
export const api = {
  get: (path) => apiCall('GET', path),
  post: (path, body) => apiCall('POST', path, body),
  put: (path, body) => apiCall('PUT', path, body),
  delete: (path) => apiCall('DELETE', path),
};

// Auth endpoints
export const auth = {
  register: (username, credentialId, publicKey) => api.post('/v1/auth/register', { username, credentialId, publicKey }),
  login: (username, credentialId) => api.post('/v1/auth/login', { username, credentialId }),
  me: () => api.get('/v1/auth/me'),
};

// Wallet endpoints
export const wallet = {
  info: () => api.get('/v1/wallet'),
  balances: () => api.get('/v1/wallet/balances'),
  prepareDelegate: (chain) => api.post('/v1/wallet/delegate', { chain }),
  submitDelegate: (chain, txHash) => api.post('/v1/wallet/delegate/submit', { chain, txHash }),
};

// Operations endpoints
export const operations = {
  send: (destAddr, destChain, amount, srcChain) => api.post('/v1/operations/send', { destAddr, destChain, amount: String(amount), ...(srcChain ? { srcChain } : {}) }),
  collect: (sourceChains, dest) => api.post('/v1/operations/collect', { sourceChains, ...(dest ? { dest } : {}) }),
  bridge: (src, dest, amount) => api.post('/v1/operations/bridge', { src, dest, amount: String(amount) }),
  batchSend: (recipients, srcChain) => api.post('/v1/operations/batch-send', { recipients, ...(srcChain ? { srcChain } : {}) }),
  list: (type, status, limit, offset) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (limit != null) params.set('limit', limit);
    if (offset != null) params.set('offset', offset);
    const qs = params.toString();
    return api.get(`/v1/operations${qs ? '?' + qs : ''}`);
  },
  get: (id) => api.get(`/v1/operations/${id}`),
  submit: (id, signatures) => api.post(`/v1/operations/${id}/submit`, { signatures }),
};

// Webhook endpoints
export const webhooks = {
  create: (url, events, secret) => api.post('/v1/webhooks', { url, events, ...(secret ? { secret } : {}) }),
  list: () => api.get('/v1/webhooks'),
  delete: (id) => api.delete(`/v1/webhooks/${id}`),
};
