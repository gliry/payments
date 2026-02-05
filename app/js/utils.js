// ============================================================================
// OmniFlow Dashboard — Utilities
// ============================================================================

/** Format USDC amount: 12880.50 → "$12,880.50" */
export function formatUSDC(amount) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0.00';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Truncate address: "0x1234...5678" */
export function formatAddress(addr) {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

/** Time ago: "2 min ago", "1 hr ago", "3 days ago" */
export function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

/** Copy text to clipboard */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  }
}

/** Chain metadata */
const CHAINS = {
  arc:       { name: 'Arc',       color: '#1894E8', icon: 'arc' },
  arbitrum:  { name: 'Arbitrum',  color: '#28a0f0', icon: 'arbitrum' },
  base:      { name: 'Base',      color: '#0052ff', icon: 'base' },
  ethereum:  { name: 'Ethereum',  color: '#627eea', icon: 'ethereum' },
  polygon:   { name: 'Polygon',   color: '#8247e5', icon: 'polygon' },
  sonic:     { name: 'Sonic',     color: '#16c784', icon: 'sonic' },
};

export function getChainMeta(chain) {
  return CHAINS[chain] || { name: chain, color: '#6b7280', icon: 'ethereum' };
}

export function getAllChains() {
  return Object.keys(CHAINS);
}

/** Fee calculation (mirrors API logic) */
export function calculateFee(amount, chain, isBatch = false) {
  const num = parseFloat(amount);
  if (isBatch) return num * 0.0025;
  if (chain === 'arc') return num * 0.001;
  return num * 0.004;
}

/** Fee percentage label */
export function getFeeLabel(chain, isBatch = false) {
  if (isBatch) return '0.25%';
  if (chain === 'arc') return '0.1%';
  return '0.4%';
}

/** Generate chain icon SVG inline */
export function getChainSVG(chain, size = 32) {
  const svgs = {
    ethereum: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><polygon points="16,2 26,16 16,22 6,16" fill="#627eea" opacity="0.9"/><polygon points="16,22 26,16 16,30 6,16" fill="#627eea" opacity="0.6"/></svg>`,
    base: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><circle cx="16" cy="16" r="12" fill="#0052ff"/><path d="M16 8 L16 24 M10 16 L22 16" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`,
    arbitrum: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><polygon points="16,3 28,10 28,22 16,29 4,22 4,10" fill="#28a0f0" opacity="0.85"/><path d="M12,20 L16,10 L20,20" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    polygon: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><polygon points="16,4 28,12 28,20 16,28 4,20 4,12" fill="#8247e5" opacity="0.85"/><polygon points="16,10 22,14 22,18 16,22 10,18 10,14" fill="#fff" opacity="0.3"/></svg>`,
    sonic: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><circle cx="16" cy="16" r="13" fill="#16c784"/><path d="M10 18 L14 12 L18 16 L22 10" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    arc: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><circle cx="16" cy="16" r="13" fill="#1894E8"/><path d="M10 20 L16 10 L22 20" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="17" x2="20" y2="17" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
  };
  return svgs[chain] || svgs.ethereum;
}

/** Simple ID generator */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Debounce function */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Format date */
export function formatDate(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Validate Ethereum address */
export function isValidAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}
