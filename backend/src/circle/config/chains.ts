export interface ChainConfig {
  chainId: number;
  rpc: string;
  usdc: string;
  explorer: string;
  gatewayDomain?: number;
  aaSupported?: boolean;
  finalitySeconds: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

/**
 * Chains supporting BOTH Circle AA and Gateway (full cross-chain flow)
 * Polygon = hub chain (primary liquidity hub)
 */
export const AA_GATEWAY_CHAINS: Record<string, ChainConfig> = {
  polygon: {
    chainId: 137,
    rpc: 'https://polygon-rpc.com',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    explorer: 'https://polygonscan.com',
    gatewayDomain: 7,
    aaSupported: true,
    finalitySeconds: 180,
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  },
  avalanche: {
    chainId: 43114,
    rpc: 'https://api.avax.network/ext/bc/C/rpc',
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    explorer: 'https://snowtrace.io',
    gatewayDomain: 1,
    aaSupported: true,
    finalitySeconds: 30,
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
  },
  base: {
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorer: 'https://basescan.org',
    gatewayDomain: 6,
    aaSupported: true,
    finalitySeconds: 1200,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
  optimism: {
    chainId: 10,
    rpc: 'https://mainnet.optimism.io',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    explorer: 'https://optimistic.etherscan.io',
    gatewayDomain: 2,
    aaSupported: true,
    finalitySeconds: 1200,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
  arbitrum: {
    chainId: 42161,
    rpc: 'https://arb1.arbitrum.io/rpc',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    explorer: 'https://arbiscan.io',
    gatewayDomain: 3,
    aaSupported: true,
    finalitySeconds: 1200,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
};

/**
 * Chains supporting Circle AA only (no Gateway)
 */
export const AA_ONLY_CHAINS: Record<string, ChainConfig> = {};

/**
 * Chains supporting Gateway only (no AA)
 */
export const GATEWAY_ONLY_CHAINS: Record<string, ChainConfig> = {};

/**
 * Hub chain key.
 *
 * OmniFlow will run on Arc as the production hub. Arc advantages over any
 * alternative hub chain:
 *
 *  - 1-second finality → deposits and payouts settle instantly on the hub,
 *    no waiting for block confirmations.
 *  - Native USDC as base asset → the hub holds only issuer-native USDC,
 *    eliminating bridged/wrapped token risk entirely.
 *  - Circle Gas Station → all hub transactions are gas-sponsored, users
 *    never need native tokens on the hub chain.
 *  - Deep Circle stack integration → Modular Wallets, Gateway (CCTP V2),
 *    Bundler, and Gas Station are all first-class citizens on Arc.
 *  - USDC issuer's own L1 → maximum trust for the chain where all
 *    protocol liquidity rests.
 *
 * The full flow is validated end-to-end on Arc testnet. For the mainnet demo
 * (with real liquidity) we stage on Polygon while Arc mainnet is not yet
 * available. The architecture is chain-agnostic: switching the hub requires
 * changing only this constant — zero other code changes.
 */
export const HUB_CHAIN = 'polygon';

export const GATEWAY_CHAINS: Record<string, ChainConfig> = {
  ...AA_GATEWAY_CHAINS,
  ...GATEWAY_ONLY_CHAINS,
};

export const AA_CHAINS: Record<string, ChainConfig> = {
  ...AA_GATEWAY_CHAINS,
  ...AA_ONLY_CHAINS,
};

export const ALL_CHAINS: Record<string, ChainConfig> = {
  ...AA_GATEWAY_CHAINS,
  ...AA_ONLY_CHAINS,
  ...GATEWAY_ONLY_CHAINS,
};

export type SupportedChain = keyof typeof ALL_CHAINS;
export type GatewayChain = keyof typeof GATEWAY_CHAINS;

export function getChainByDomain(
  domain: number,
): ChainConfig | undefined {
  return Object.values(GATEWAY_CHAINS).find(
    (c) => c.gatewayDomain === domain,
  );
}

export function getChainKeyByDomain(domain: number): string | undefined {
  return Object.entries(GATEWAY_CHAINS).find(
    ([, c]) => c.gatewayDomain === domain,
  )?.[0];
}

export function supportsFullFlow(chainKey: string): boolean {
  return chainKey in AA_GATEWAY_CHAINS;
}

export function getUsdcAddress(chainKey: string): string {
  const chain = ALL_CHAINS[chainKey];
  if (!chain) {
    throw new Error(`Unknown chain: ${chainKey}`);
  }
  return chain.usdc;
}
