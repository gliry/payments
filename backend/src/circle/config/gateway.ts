import { GATEWAY_CHAINS } from './chains';

export const GATEWAY_WALLET = '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE';
export const GATEWAY_MINTER = '0x2222222d7164433c4C09B0b0D809a9b52C04C205';
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
