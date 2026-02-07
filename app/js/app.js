// ============================================================================
// OmniFlow Dashboard — Router & App Init
// ============================================================================

import * as state from './state.js';
import { formatAddress } from './utils.js';

// Screen registry
const screens = {};
let currentScreen = null;

export function registerScreen(hash, module) {
  screens[hash] = module;
}

function getHash() {
  return window.location.hash.slice(1) || '';
}

function navigate(hash) {
  window.location.hash = hash;
}

async function showScreen(hash) {
  // Hide current
  if (currentScreen && screens[currentScreen]) {
    const el = document.getElementById(`screen-${currentScreen}`);
    if (el) {
      el.classList.remove('active');
    }
    if (screens[currentScreen].hide) screens[currentScreen].hide();
  }

  // Show new
  const el = document.getElementById(`screen-${hash}`);
  if (el) {
    el.classList.add('active');
  }

  if (screens[hash]?.show) {
    await screens[hash].show();
  }

  currentScreen = hash;
  updateSidebarActive(hash);
}

function updateSidebarActive(hash) {
  document.querySelectorAll('.sidebar__link').forEach(link => {
    const linkHash = link.getAttribute('data-screen');
    link.classList.toggle('active', linkHash === hash);
  });
}

// Layout visibility
function showAppLayout(show) {
  const layout = document.getElementById('app-layout');
  const onboarding = document.getElementById('screen-onboarding');
  if (layout) layout.style.display = show ? 'flex' : 'none';
  if (onboarding) onboarding.style.display = show ? 'none' : '';
}

// Update sidebar user info
function updateSidebarUser() {
  const wallet = state.getWallet();
  const user = state.getUser();

  const nameEl = document.getElementById('sidebar-user-name');
  const addrEl = document.getElementById('sidebar-user-address');
  const avatarEl = document.getElementById('sidebar-user-avatar');

  if (nameEl) {
    nameEl.textContent = user?.username || wallet?.username || 'User';
  }
  if (addrEl) {
    addrEl.textContent = formatAddress(user?.walletAddress || wallet?.address);
  }
  if (avatarEl) {
    const name = user?.username || wallet?.username || 'U';
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }
}

// Router handler
async function handleRoute() {
  const hash = getHash();
  const authenticated = state.isAuthenticated();

  if (!authenticated && hash !== 'onboarding') {
    navigate('onboarding');
    return;
  }

  if (authenticated && hash === 'onboarding') {
    navigate('dashboard');
    return;
  }

  if (authenticated && !hash) {
    navigate('dashboard');
    return;
  }

  if (!hash) {
    navigate('onboarding');
    return;
  }

  showAppLayout(hash !== 'onboarding');

  if (hash !== 'onboarding') {
    updateSidebarUser();
  }

  await showScreen(hash);
}

// Sidebar navigation
function setupSidebar() {
  document.querySelectorAll('.sidebar__link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const screen = link.getAttribute('data-screen');
      if (screen) navigate(screen);
    });
  });

  // Logout
  const logoutBtn = document.getElementById('sidebar-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      state.clearAll();
      navigate('onboarding');
    });
  }
}

// Mobile menu toggle
function setupMobileMenu() {
  const menuBtn = document.getElementById('header-menu-btn');
  const sidebar = document.querySelector('.sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
    // Close on navigation
    document.querySelectorAll('.sidebar__link').forEach(link => {
      link.addEventListener('click', () => {
        sidebar.classList.remove('open');
      });
    });
  }
}

// Initialize app
export async function init() {
  // Import all screen modules
  const [
    onboarding,
    dashboard,
    deposit,
    send,
    batch,
    history,
    apiExplorer,
    settings,
  ] = await Promise.all([
    import('./screens/onboarding.js'),
    import('./screens/dashboard.js'),
    import('./screens/deposit.js'),
    import('./screens/send.js'),
    import('./screens/batch.js'),
    import('./screens/history.js'),
    import('./screens/api-explorer.js'),
    import('./screens/settings.js'),
  ]);

  // Register screens
  registerScreen('onboarding', onboarding);
  registerScreen('dashboard', dashboard);
  registerScreen('deposit', deposit);
  registerScreen('send', send);
  registerScreen('batch', batch);
  registerScreen('history', history);
  registerScreen('api', apiExplorer);
  registerScreen('settings', settings);

  // Init all screens
  for (const [, mod] of Object.entries(screens)) {
    if (mod.init) await mod.init();
  }

  // Setup navigation
  setupSidebar();
  setupMobileMenu();

  // Listen for hash changes
  window.addEventListener('hashchange', handleRoute);

  // Listen for auth changes
  state.on('logout', () => navigate('onboarding'));
  state.on('user-change', updateSidebarUser);

  // Initial route
  await handleRoute();
}

// Export navigate for use in screens
export { navigate };
