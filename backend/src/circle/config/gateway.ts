import { GATEWAY_CHAINS } from './chains';

export const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
export const GATEWAY_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';
export const GATEWAY_API = 'https://gateway-api.circle.com';

export const GATEWAY_DOMAINS: Record<string, number> = Object.fromEntries(
  Object.entries(GATEWAY_CHAINS)
    .filter(([, config]) => config.gatewayDomain !== undefined)
    .map(([key, config]) => [key, config.gatewayDomain!]),
);

export const DOMAIN_TO_CHAIN: Record<number, string> = Object.fromEntries(
  Object.entries(GATEWAY_DOMAINS).map(([chain, domain]) => [domain, chain]),
);

export function getDomain(chainKey: string): number {
  const domain = GATEWAY_DOMAINS[chainKey];
  if (domain === undefined) {
    throw new Error(
      `Unknown chain: ${chainKey}. Supported: ${Object.keys(GATEWAY_DOMAINS).join(', ')}`,
    );
  }
  return domain;
}
