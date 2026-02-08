// ============================================================================
// Screen: Settings
// ============================================================================

import * as state from '../state.js';
import { webhooks } from '../api.js';
import { formatAddress, copyToClipboard } from '../utils.js';
import { showToast } from '../components/toast.js';

let container;
let webhookList = [];

function render() {
  const wallet = state.getWallet();
  const user = state.getUser();

  container.innerHTML = `
    <!-- Account Info -->
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="margin-bottom: 20px;">Account Info</h3>
      <div style="display: grid; grid-template-columns: 140px 1fr; gap: 12px; font-size: 0.875rem;">
        <span class="text-muted">Username</span>
        <span style="font-weight: 500;">${user?.username || 'N/A'}</span>
        <span class="text-muted">User ID</span>
        <span class="text-mono" style="font-size: 0.8125rem;">${user?.id || 'N/A'}</span>
        <span class="text-muted">Wallet Address</span>
        <span class="flex items-center gap-8">
          <code class="text-mono" style="font-size: 0.8125rem; word-break: break-all;">${user?.walletAddress || wallet?.address || 'N/A'}</code>
          <button class="copy-btn" id="copy-wallet-addr">
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
          </button>
        </span>
        <span class="text-muted">Delegate Address</span>
        <span class="text-mono" style="font-size: 0.8125rem; word-break: break-all;">${user?.delegateAddress || 'Not set'}</span>
        <span class="text-muted">Status</span>
        <span class="badge badge--active">active</span>
      </div>
    </div>

    <!-- API Access -->
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="margin-bottom: 20px;">API Access</h3>
      <div class="input-group" style="margin-bottom: 16px;">
        <label class="input-label">API Endpoint</label>
        <div class="flex items-center gap-8">
          <code class="input input--mono" style="background: var(--color-bg-soft);" readonly>https://omniflow.up.railway.app</code>
          <button class="copy-btn" id="copy-api-url">
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
          </button>
        </div>
      </div>
      <div class="input-group">
        <label class="input-label">Sample Request</label>
        <div class="code-block">
          <div class="code-block__body">curl https://omniflow.up.railway.app/v1/wallet/balances \\
  -H "Authorization: Bearer YOUR_TOKEN"</div>
        </div>
      </div>
    </div>

    <!-- Webhooks -->
    <div class="card">
      <div class="flex items-center justify-between" style="margin-bottom: 20px;">
        <h3>Webhooks</h3>
        <button id="add-webhook-btn" class="btn btn--primary btn--sm">Add Webhook</button>
      </div>

      ${webhookList.length === 0
        ? `<div class="empty-state" style="padding: 24px;">
            <div class="empty-state__title">No webhooks configured</div>
            <div class="empty-state__desc">Add a webhook to receive real-time notifications</div>
          </div>`
        : `<div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${webhookList.map(wh => `
                  <tr>
                    <td class="text-mono text-sm" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis;">${wh.url}</td>
                    <td class="text-sm">${(wh.events || []).map(e => `<span class="badge badge--processing" style="margin-right: 4px; margin-bottom: 4px;">${e}</span>`).join('')}</td>
                    <td><span class="badge badge--${wh.active !== false ? 'active' : 'failed'}">${wh.active !== false ? 'Active' : 'Inactive'}</span></td>
                    <td><button class="btn btn--ghost btn--sm delete-webhook" data-id="${wh.id}" style="color: var(--color-error);">Delete</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
      }
    </div>

    <!-- Add Webhook Dialog -->
    <div id="webhook-dialog" class="dialog-overlay">
      <div class="dialog">
        <div class="dialog__title">Add Webhook</div>
        <div class="input-group" style="margin-bottom: 16px;">
          <label class="input-label">Endpoint URL</label>
          <input type="url" id="webhook-url" class="input input--mono" placeholder="https://example.com/webhook">
        </div>
        <div class="input-group" style="margin-bottom: 24px;">
          <label class="input-label">Events</label>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
            ${['operation.completed', 'operation.failed'].map(event => `
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" class="webhook-event" value="${event}" checked>
                ${event}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="flex gap-12">
          <button id="webhook-cancel" class="btn btn--secondary" style="flex: 1;">Cancel</button>
          <button id="webhook-save" class="btn btn--primary" style="flex: 1;">Save</button>
        </div>
      </div>
    </div>
  `;

  setupListeners();
}

function setupListeners() {
  const wallet = state.getWallet();
  const user = state.getUser();

  document.getElementById('copy-wallet-addr')?.addEventListener('click', async () => {
    await copyToClipboard(user?.walletAddress || wallet?.address || '');
    showToast('Address copied!', 'success');
  });

  document.getElementById('copy-api-url')?.addEventListener('click', async () => {
    await copyToClipboard('https://omniflow.up.railway.app');
    showToast('API URL copied!', 'success');
  });

  // Add webhook dialog
  document.getElementById('add-webhook-btn')?.addEventListener('click', () => {
    document.getElementById('webhook-dialog').classList.add('open');
  });

  document.getElementById('webhook-cancel')?.addEventListener('click', () => {
    document.getElementById('webhook-dialog').classList.remove('open');
  });

  document.getElementById('webhook-save')?.addEventListener('click', async () => {
    const url = document.getElementById('webhook-url').value.trim();
    const events = [...document.querySelectorAll('.webhook-event:checked')].map(el => el.value);

    if (!url) {
      showToast('Please enter a URL', 'warning');
      return;
    }

    if (events.length === 0) {
      showToast('Please select at least one event', 'warning');
      return;
    }

    try {
      await webhooks.create(url, events);
      document.getElementById('webhook-dialog').classList.remove('open');
      showToast('Webhook created!', 'success');
      await fetchWebhooks();
      render();
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  // Delete webhook
  container.querySelectorAll('.delete-webhook').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await webhooks.delete(btn.dataset.id);
        showToast('Webhook deleted', 'info');
        await fetchWebhooks();
        render();
      } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
      }
    });
  });
}

async function fetchWebhooks() {
  try {
    const result = await webhooks.list();
    webhookList = result.data || result || [];
    if (!Array.isArray(webhookList)) webhookList = [];
  } catch {
    webhookList = [];
  }
}

export function init() {
  container = document.getElementById('settings-content');
}

export async function show() {
  document.getElementById('header-title').textContent = 'Settings';
  await fetchWebhooks();
  render();
}

export function hide() {}
