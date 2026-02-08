// ============================================================================
// OmniFlow Dashboard — LI.FI API Client (Browser)
// ============================================================================
// Cross-chain swap/bridge via LI.FI REST API
// Ported from frontend/src/lib/lifi/api.ts

const LIFI_API = 'https://li.quest/v1';
const INTEGRATOR = 'omniflow';
const DEFAULT_SLIPPAGE = 0.005; // 0.5%

/**
 * Get a swap/bridge quote from LI.FI
 * @param {{ fromChain: number, toChain: number, fromToken: string, toToken: string, fromAmount: string, fromAddress: string, toAddress: string, slippage?: number }} params
 * @returns {Promise<Object>} quote with transactionRequest
 */
export async function getQuote({ fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, toAddress, slippage }) {
  const params = new URLSearchParams({
    fromChain: String(fromChain),
    toChain: String(toChain),
    fromToken,
    toToken,
    fromAmount,
    fromAddress,
    toAddress,
    slippage: String(slippage || DEFAULT_SLIPPAGE),
    integrator: INTEGRATOR,
    allowExchanges: 'all',
    allowBridges: 'all',
  });

  const res = await fetch(`${LIFI_API}/quote?${params}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `LI.FI quote error: ${res.status}`);
  }
  return res.json();
}

/**
 * Build ERC20 approve calldata
 * @param {string} spenderAddress — address to approve
 * @param {bigint|string} amount — amount to approve (use max uint256 for unlimited)
 * @returns {string} hex calldata
 */
export function buildApproveData(spenderAddress, amount) {
  // approve(address,uint256) selector = 0x095ea7b3
  const spender = spenderAddress.slice(2).toLowerCase().padStart(64, '0');
  const amt = BigInt(amount).toString(16).padStart(64, '0');
  return '0x095ea7b3' + spender + amt;
}

// Token prices (approximate, for UI estimates when LI.FI is unavailable)
const TOKEN_PRICES_USD = {
  ETH: 3200, WBTC: 95000, DAI: 1, USDT: 1, USDC: 1,
  ARB: 1.2, MATIC: 0.8, SOL: 180, LINK: 15, UNI: 12, AAVE: 290, OP: 2.5,
};

/**
 * Estimate USDC output for a given token amount (fallback when API unavailable)
 */
export function estimateUSDCOutput(token, amount) {
  const price = TOKEN_PRICES_USD[token] || 1;
  const usdValue = amount * price;
  return usdValue * 0.997;
}

/**
 * Get supported tokens for display
 */
export function getSupportedTokens() {
  return Object.entries(TOKEN_PRICES_USD).map(([symbol, price]) => ({
    symbol,
    price,
    name: getTokenName(symbol),
  }));
}

function getTokenName(symbol) {
  const names = {
    ETH: 'Ethereum', WBTC: 'Wrapped Bitcoin', DAI: 'Dai Stablecoin',
    USDT: 'Tether USD', USDC: 'USD Coin', ARB: 'Arbitrum',
    MATIC: 'Polygon', SOL: 'Solana', LINK: 'Chainlink',
    UNI: 'Uniswap', AAVE: 'Aave', OP: 'Optimism',
  };
  return names[symbol] || symbol;
}
