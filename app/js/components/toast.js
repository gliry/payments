// ============================================================================
// Toast Notifications
// ============================================================================

let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'info', duration = 3000) {
  const c = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;

  c.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function success(msg) { showToast(msg, 'success'); }
export function error(msg) { showToast(msg, 'error', 5000); }
export function info(msg) { showToast(msg, 'info'); }
export function warning(msg) { showToast(msg, 'warning'); }
