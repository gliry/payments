/**
 * DeBank Cloud API wrapper
 *
 * Provides access to user portfolio data across chains via DeBank's REST API.
 * Requires a DEBANK_ACCESS_KEY from https://cloud.debank.com/
 *
 * @see https://docs.cloud.debank.com/en/readme/api-pro-reference/user
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEBANK_API = 'https://pro-openapi.debank.com/v1';

function getAccessKey(): string {
  const key = process.env.DEBANK_ACCESS_KEY;
  if (!key) {
    throw new Error(
      'DEBANK_ACCESS_KEY is not set in environment.\n' +
      'Get your key from https://cloud.debank.com/',
    );
  }
  return key;
}

// =============================================================================
// TYPES
// =============================================================================

export interface DebankToken {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  display_symbol?: string;
  decimals: number;
  logo_url?: string;
  price: number;
  amount: number;
  raw_amount: number;
  raw_amount_hex_str?: string;
  is_verified?: boolean;
  is_core?: boolean;
  is_wallet?: boolean;
}

export interface DebankChainBalance {
  id: string;
  community_id: number;
  name: string;
  native_token_id: string;
  logo_url: string;
  usd_value: number;
}

export interface DebankTotalBalance {
  total_usd_value: number;
  chain_list: DebankChainBalance[];
}

export interface DebankChainInfo {
  id: string;
  community_id: number;
  name: string;
  logo_url: string;
  native_token_id: string;
  wrapped_token_id: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function debankGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${DEBANK_API}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'AccessKey': getAccessKey(),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeBank API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Get total USD balance across all chains
 */
export async function getUserTotalBalance(address: string): Promise<DebankTotalBalance> {
  return debankGet<DebankTotalBalance>('/user/total_balance', { id: address });
}

/**
 * Get all tokens for a user across all chains
 */
export async function getUserAllTokens(address: string): Promise<DebankToken[]> {
  return debankGet<DebankToken[]>('/user/all_token_list', { id: address });
}

/**
 * Get tokens on a specific chain
 */
export async function getUserTokensOnChain(
  address: string,
  chainId: string,
): Promise<DebankToken[]> {
  return debankGet<DebankToken[]>('/user/token_list', {
    id: address,
    chain_id: chainId,
  });
}

/**
 * Get list of chains where the user has activity
 */
export async function getUserUsedChains(address: string): Promise<DebankChainInfo[]> {
  return debankGet<DebankChainInfo[]>('/user/used_chain_list', { id: address });
}
