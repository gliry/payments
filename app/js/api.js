// ============================================================================
// OmniFlow Dashboard — API Client
// ============================================================================

const API_BASE = 'http://localhost:3001';

// Global API log — used by API Explorer screen
window.__apiLog = window.__apiLog || [];

/**
 * Make API call with logging
 */
export async function apiCall(method, path, body = null) {
  const url = `${API_BASE}${path}`;
  const startTime = performance.now();

  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

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

  // Keep only last 100 entries
  if (window.__apiLog.length > 100) {
    window.__apiLog.length = 100;
  }

  // Dispatch event for API Explorer live feed
  window.dispatchEvent(new CustomEvent('api-log', { detail: logEntry }));

  if (error) {
    throw error;
  }

  if (!response.ok) {
    const apiError = new Error(data?.error?.message || `API error: ${status}`);
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
  delete: (path) => apiCall('DELETE', path),
};

// Account endpoints
export const accounts = {
  create: (email) => api.post('/v1/accounts', { email }),
  get: (id) => api.get(`/v1/accounts/${id}`),
  getBalance: (id) => api.get(`/v1/accounts/${id}/balance`),
  list: () => api.get('/v1/accounts'),
};

// Deposit endpoints
export const deposits = {
  getAddress: (accountId, chain) => api.post('/v1/deposits/address', { account_id: accountId, chain }),
  simulate: (accountId, chain, amount) => api.post('/v1/deposits/simulate', { account_id: accountId, chain, amount: String(amount) }),
  get: (id) => api.get(`/v1/deposits/${id}`),
  list: (accountId) => api.get(`/v1/deposits?account_id=${accountId}`),
};

// Payout endpoints
export const payouts = {
  create: (accountId, amount, destination) => api.post('/v1/payouts', { account_id: accountId, amount: String(amount), destination }),
  batch: (accountId, payoutItems) => api.post('/v1/payouts/batch', { account_id: accountId, payouts: payoutItems }),
  get: (id) => api.get(`/v1/payouts/${id}`),
  list: (accountId) => api.get(`/v1/payouts?account_id=${accountId}`),
};

// Transfer endpoints
export const transfers = {
  create: (fromAccountId, to, amount) => api.post('/v1/transfers', { from_account_id: fromAccountId, to, amount: String(amount) }),
  get: (id) => api.get(`/v1/transfers/${id}`),
  list: (accountId) => api.get(`/v1/transfers?account_id=${accountId}`),
};

// Webhook endpoints
export const webhooks = {
  create: (url, events) => api.post('/v1/webhooks', { url, events }),
  list: () => api.get('/v1/webhooks'),
  get: (id) => api.get(`/v1/webhooks/${id}`),
  delete: (id) => api.delete(`/v1/webhooks/${id}`),
};
