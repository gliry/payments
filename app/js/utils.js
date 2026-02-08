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
  base:      { name: 'Base',      color: '#0052ff', icon: 'base' },
  arbitrum:  { name: 'Arbitrum',  color: '#28a0f0', icon: 'arbitrum' },
  avalanche: { name: 'Avalanche', color: '#e84142', icon: 'avalanche' },
  optimism:  { name: 'Optimism',  color: '#ff0420', icon: 'optimism' },
  polygon:   { name: 'Arc',       color: '#1894E8', icon: 'arc' },
  ethereum:  { name: 'Ethereum',  color: '#627eea', icon: 'ethereum' },
};

export const CHAIN_CONFIG = {
  base:      { chainId: 8453,  rpc: 'https://mainnet.base.org',              usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', nativeSymbol: 'ETH',  nativeDecimals: 18 },
  arbitrum:  { chainId: 42161, rpc: 'https://arb1.arbitrum.io/rpc',          usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', nativeSymbol: 'ETH',  nativeDecimals: 18 },
  avalanche: { chainId: 43114, rpc: 'https://api.avax.network/ext/bc/C/rpc', usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', nativeSymbol: 'AVAX', nativeDecimals: 18 },
  ethereum:  { chainId: 1,     rpc: 'https://eth.drpc.org',                  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', nativeSymbol: 'ETH',  nativeDecimals: 18 },
  optimism:  { chainId: 10,    rpc: 'https://mainnet.optimism.io',           usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', nativeSymbol: 'ETH',  nativeDecimals: 18 },
  polygon:   { chainId: 137,   rpc: 'https://polygon-rpc.com',              usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', nativeSymbol: 'USDC', nativeDecimals: 18 },
};

export function getChainKeyByChainId(chainId) {
  return Object.entries(CHAIN_CONFIG).find(([, c]) => c.chainId === chainId)?.[0];
}

export function formatTokenBalance(balance, decimals) {
  const str = balance.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, str.length - decimals) || '0';
  const frac = str.slice(str.length - decimals, str.length - decimals + 4);
  return `${whole}.${frac}`;
}

export function getChainMeta(chain) {
  return CHAINS[chain] || { name: chain, color: '#6b7280', icon: 'ethereum' };
}

export function getAllChains() {
  return Object.keys(CHAINS);
}

/** Fee calculation (mirrors backend logic) */
export function calculateFee(amount, destChain, srcChain, isBatch = false) {
  const num = parseFloat(amount);
  if (isBatch) return num * 0.0025; // 0.25%
  if (srcChain && destChain && srcChain !== destChain) return num * 0.003; // 0.3% cross-chain
  if (!srcChain && destChain) return num * 0.003; // cross-chain default
  return 0; // same-chain: free
}

/** Fee percentage label */
export function getFeeLabel(destChain, srcChain, isBatch = false) {
  if (isBatch) return '0.25%';
  if (srcChain && destChain && srcChain === destChain) return '0%';
  return '0.3%';
}

/** Operation type labels */
const OP_TYPE_LABELS = {
  SEND: 'Send',
  COLLECT: 'Collect',
  BRIDGE: 'Bridge',
  BATCH_SEND: 'Batch Send',
};

export function getOpTypeLabel(type) {
  return OP_TYPE_LABELS[type] || type;
}

/** Operation status labels */
const OP_STATUS_LABELS = {
  AWAITING_SIGNATURE: 'Awaiting Signature',
  AWAITING_SIGNATURE_PHASE2: 'Awaiting Signature (Phase 2)',
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

export function getOpStatusLabel(status) {
  return OP_STATUS_LABELS[status] || status;
}

/** Generate chain icon SVG inline */
export function getChainSVG(chain, size = 32) {
  const svgs = {
    ethereum: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><polygon points="16,2 26,16 16,22 6,16" fill="#627eea" opacity="0.9"/><polygon points="16,22 26,16 16,30 6,16" fill="#627eea" opacity="0.6"/></svg>`,
    base: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><circle cx="16" cy="16" r="12" fill="#0052ff"/><path d="M16 8 L16 24 M10 16 L22 16" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`,
    arbitrum: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><polygon points="16,3 28,10 28,22 16,29 4,22 4,10" fill="#28a0f0" opacity="0.85"/><path d="M12,20 L16,10 L20,20" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    polygon: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><circle cx="16" cy="16" r="13" fill="#1894E8"/><path d="M10 20 Q16 6 22 20" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/><circle cx="16" cy="12" r="2" fill="#fff"/></svg>`,
    avalanche: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><circle cx="16" cy="16" r="13" fill="#e84142"/><path d="M10 22 L16 8 L22 22" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="18" x2="20" y2="18" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
    optimism: `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none"><circle cx="16" cy="16" r="13" fill="#ff0420"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-size="14" font-weight="bold">O</text></svg>`,
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
