/**
 * Circle Gateway Configuration
 *
 * Gateway enables cross-chain USDC transfers using unified balance.
 * Contracts are the same on all supported networks.
 */

import type { Hex } from 'viem';
import { GATEWAY_CHAINS } from '../../config/chains';

// Gateway contract addresses (same on all chains)
export const GATEWAY_WALLET: Hex = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
export const GATEWAY_MINTER: Hex = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';

// Gateway API endpoint (testnet)
export const GATEWAY_API = 'https://gateway-api-testnet.circle.com';

/**
 * Circle domain IDs for each chain (derived from chain config)
 */
export const GATEWAY_DOMAINS: Record<string, number> = Object.fromEntries(
  Object.entries(GATEWAY_CHAINS)
    .filter(([_, config]) => config.gatewayDomain !== undefined)
    .map(([key, config]) => [key, config.gatewayDomain!])
);

/**
 * Reverse lookup: domain ID -> chain key
 */
export const DOMAIN_TO_CHAIN: Record<number, string> = Object.fromEntries(
  Object.entries(GATEWAY_DOMAINS).map(([chain, domain]) => [domain, chain])
);

/**
 * Get domain ID for a chain, throws if not found
 */
export function getDomain(chainKey: string): number {
  const domain = GATEWAY_DOMAINS[chainKey];
  if (domain === undefined) {
    throw new Error(
      `Unknown chain: ${chainKey}. Supported: ${Object.keys(GATEWAY_DOMAINS).join(', ')}`
    );
  }
  return domain;
}
