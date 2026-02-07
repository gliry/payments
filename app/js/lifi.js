// ============================================================================
// OmniFlow Dashboard — LI.FI SDK Integration
// ============================================================================
// LI.FI provides cross-chain + cross-token swaps
// Users deposit any token on any chain → auto-swapped to USDC on Arc

// Token prices (approximate, for quote estimates)
const TOKEN_PRICES_USD = {
  ETH: 3200,
  WBTC: 95000,
  DAI: 1,
  USDT: 1,
  USDC: 1,
  ARB: 1.2,
  MATIC: 0.8,
  SOL: 180,
  LINK: 15,
  UNI: 12,
  AAVE: 290,
  OP: 2.5,
};

// Chain IDs for LI.FI
const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  optimism: 10,
  sonic: 146,
};

/**
 * Estimate USDC output for a given token amount
 */
export function estimateUSDCOutput(token, amount) {
  const price = TOKEN_PRICES_USD[token] || 1;
  const usdValue = amount * price;
  // Assume ~0.3% slippage + bridge fee
  const afterSlippage = usdValue * 0.997;
  return afterSlippage;
}

/**
 * Get a quote estimate (without calling actual LI.FI API)
 * In production, this would use LI.FI SDK's getQuote()
 */
export function getQuoteEstimate(sourceToken, sourceChain, amount) {
  const usdcOut = estimateUSDCOutput(sourceToken, amount);

  return {
    source: {
      token: sourceToken,
      chain: sourceChain,
      amount: amount,
      amountUSD: amount * (TOKEN_PRICES_USD[sourceToken] || 1),
    },
    destination: {
      token: 'USDC',
      chain: 'arc',
      amount: usdcOut,
      amountUSD: usdcOut,
    },
    route: {
      steps: sourceChain === 'ethereum' ? 2 : 1,
      via: 'LI.FI Aggregator',
      estimatedTime: sourceChain === 'ethereum' ? '3-5 min' : '1-3 min',
      gasCost: sourceChain === 'ethereum' ? '~$8' : '~$0.50',
    },
    fees: {
      bridgeFee: usdcOut * 0.001,
      slippage: usdcOut * 0.002,
    },
  };
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
    ETH: 'Ethereum',
    WBTC: 'Wrapped Bitcoin',
    DAI: 'Dai Stablecoin',
    USDT: 'Tether USD',
    USDC: 'USD Coin',
    ARB: 'Arbitrum',
    MATIC: 'Polygon',
    SOL: 'Solana',
    LINK: 'Chainlink',
    UNI: 'Uniswap',
    AAVE: 'Aave',
    OP: 'Optimism',
  };
  return names[symbol] || symbol;
}
