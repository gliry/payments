export interface ChainConfig {
  chainId: number;
  rpc: string;
  usdc: string;
  explorer: string;
  gatewayDomain?: number;   // Circle Gateway domain ID (if supported)
  aaSupported?: boolean;    // Circle Modular Wallets AA support
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

/**
 * Chains supporting BOTH Circle AA and Gateway
 * These are the only chains where full cross-chain AA flow works
 */
export const AA_GATEWAY_CHAINS: Record<string, ChainConfig> = {
  'base-sepolia': {
    chainId: 84532,
    rpc: 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    explorer: 'https://sepolia.basescan.org',
    gatewayDomain: 6,
    aaSupported: true,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
  'avalanche-fuji': {
    chainId: 43113,
    rpc: 'https://api.avax-test.network/ext/bc/C/rpc',
    usdc: '0x5425890298aed601595a70ab815c96711a31bc65',
    explorer: 'https://testnet.snowtrace.io',
    gatewayDomain: 1,
    aaSupported: true,
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
  },
  'arc-testnet': {
    chainId: 5042002,
    rpc: 'https://rpc.testnet.arc.network',
    usdc: '0x3600000000000000000000000000000000000000',
    explorer: 'https://testnet.arcscan.app',
    gatewayDomain: 26,
    aaSupported: true,
    nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
  },
};

/**
 * Chains supporting Circle AA only (no Gateway)
 */
export const AA_ONLY_CHAINS: Record<string, ChainConfig> = {
  'arbitrum-sepolia': {
    chainId: 421614,
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    explorer: 'https://sepolia.arbiscan.io',
    aaSupported: true,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
  'optimism-sepolia': {
    chainId: 11155420,
    rpc: 'https://sepolia.optimism.io',
    usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    explorer: 'https://sepolia-optimism.etherscan.io',
    aaSupported: true,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
  'unichain-sepolia': {
    chainId: 1301,
    rpc: 'https://sepolia.unichain.org',
    usdc: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
    explorer: 'https://sepolia.uniscan.xyz',
    aaSupported: true,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
  'monad-testnet': {
    chainId: 10143,
    rpc: 'https://testnet-rpc.monad.xyz',
    usdc: '0x0000000000000000000000000000000000000000', // TBD
    explorer: 'https://testnet.monadexplorer.com',
    aaSupported: true,
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  },
};

/**
 * Chains supporting Gateway only (no AA)
 */
export const GATEWAY_ONLY_CHAINS: Record<string, ChainConfig> = {
  'ethereum-sepolia': {
    chainId: 11155111,
    rpc: 'https://rpc.sepolia.org',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    explorer: 'https://sepolia.etherscan.io',
    gatewayDomain: 0,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
  'sonic-testnet': {
    chainId: 64165,
    rpc: 'https://rpc.blaze.soniclabs.com',
    usdc: '0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51',
    explorer: 'https://testnet.sonicscan.org',
    gatewayDomain: 13,
    nativeCurrency: { name: 'S', symbol: 'S', decimals: 18 },
  },
  'worldchain-sepolia': {
    chainId: 4801,
    rpc: 'https://worldchain-sepolia.g.alchemy.com/public',
    usdc: '0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88',
    explorer: 'https://worldchain-sepolia.explorer.alchemy.com',
    gatewayDomain: 14,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
  'sei-testnet': {
    chainId: 1328,
    rpc: 'https://evm-rpc-testnet.sei-apis.com',
    usdc: '0x4fCF1784B31630811181f670Aea7A7bEF803eaED',
    explorer: 'https://seistream.app',
    gatewayDomain: 16,
    nativeCurrency: { name: 'SEI', symbol: 'SEI', decimals: 18 },
  },
  'hyperevm-testnet': {
    chainId: 998,
    rpc: 'https://api.hyperliquid-testnet.xyz/evm',
    usdc: '0x2B3370eE501B4a559b57D449569354196457D8Ab',
    explorer: 'https://testnet.purrsec.com',
    gatewayDomain: 19,
    nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  },
};

/**
 * All Gateway-supported chains (for Gateway operations)
 */
export const GATEWAY_CHAINS: Record<string, ChainConfig> = {
  ...AA_GATEWAY_CHAINS,
  ...GATEWAY_ONLY_CHAINS,
};

/**
 * All AA-supported chains (for AA operations)
 */
export const AA_CHAINS: Record<string, ChainConfig> = {
  ...AA_GATEWAY_CHAINS,
  ...AA_ONLY_CHAINS,
};

/**
 * All chains combined
 */
export const ALL_CHAINS: Record<string, ChainConfig> = {
  ...AA_GATEWAY_CHAINS,
  ...AA_ONLY_CHAINS,
  ...GATEWAY_ONLY_CHAINS,
};

// Legacy aliases
export const CHAINS = GATEWAY_CHAINS;
export const ARC_TESTNET = AA_GATEWAY_CHAINS['arc-testnet'];

export type SupportedChain = keyof typeof ALL_CHAINS;
export type GatewayChain = keyof typeof GATEWAY_CHAINS;
export type AAChain = keyof typeof AA_CHAINS;

/**
 * Get chain by Gateway domain ID
 */
export function getChainByDomain(domain: number): ChainConfig | undefined {
  return Object.values(GATEWAY_CHAINS).find(c => c.gatewayDomain === domain);
}

/**
 * Get chain key by Gateway domain ID
 */
export function getChainKeyByDomain(domain: number): string | undefined {
  return Object.entries(GATEWAY_CHAINS).find(([_, c]) => c.gatewayDomain === domain)?.[0];
}

/**
 * Check if chain supports both AA and Gateway
 */
export function supportsFullFlow(chainKey: string): boolean {
  return chainKey in AA_GATEWAY_CHAINS;
}
