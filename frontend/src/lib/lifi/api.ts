/**
 * LI.FI REST API wrapper
 *
 * Provides typed access to LI.FI quote/route/chains/tokens endpoints.
 * Uses fetch() directly (no SDK dependency) — matches the gateway/api.ts pattern.
 *
 * @see https://apidocs.li.fi
 * @see https://docs.li.fi
 */

import { type Hex } from 'viem';

// =============================================================================
// CONFIGURATION
// =============================================================================

const LIFI_API = 'https://li.quest/v1';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (process.env.LIFI_API_KEY) {
    headers['x-lifi-api-key'] = process.env.LIFI_API_KEY;
  }
  return headers;
}

// =============================================================================
// TYPES
// =============================================================================

export interface LifiQuoteRequest {
  fromChain: string | number;
  toChain: string | number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  order?: 'FASTEST' | 'CHEAPEST';
  slippage?: number;
  integrator?: string;
}

export interface LifiTokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
  name: string;
  coinKey?: string;
  logoURI?: string;
  priceUSD?: string;
}

export interface LifiEstimate {
  toAmount: string;
  toAmountMin: string;
  approvalAddress: string;
  executionDuration: number;
  fromAmountUSD?: string;
  toAmountUSD?: string;
  feeCosts?: Array<{
    name: string;
    percentage: string;
    token: LifiTokenInfo;
    amount: string;
    amountUSD?: string;
  }>;
  gasCosts?: Array<{
    type: string;
    estimate: string;
    limit: string;
    amount: string;
    amountUSD?: string;
    token: LifiTokenInfo;
  }>;
}

export interface LifiTransactionRequest {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
  gasPrice?: string;
  chainId: number;
}

export interface LifiAction {
  fromChainId: number;
  toChainId: number;
  fromToken: LifiTokenInfo;
  toToken: LifiTokenInfo;
  fromAmount: string;
  slippage: number;
  fromAddress: string;
  toAddress: string;
}

export interface LifiQuoteResponse {
  id: string;
  type: string;
  tool: string;
  toolDetails?: { key: string; name: string; logoURI: string };
  action: LifiAction;
  estimate: LifiEstimate;
  transactionRequest: LifiTransactionRequest;
  includedSteps?: any[];
}

export interface LifiChain {
  id: number;
  key: string;
  name: string;
  coin: string;
  mainnet: boolean;
  logoURI?: string;
  nativeToken?: LifiTokenInfo;
}

export interface LifiRoutesRequest {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  fromAddress?: string;
  toAddress?: string;
  options?: {
    order?: 'FASTEST' | 'CHEAPEST' | 'SAFEST' | 'RECOMMENDED';
    slippage?: number;
    integrator?: string;
    bridges?: { allow?: string[]; deny?: string[] };
    exchanges?: { allow?: string[]; deny?: string[] };
  };
}

export interface LifiRoute {
  id: string;
  fromChainId: number;
  toChainId: number;
  fromAmountUSD: string;
  toAmountUSD: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  fromToken: LifiTokenInfo;
  toToken: LifiTokenInfo;
  steps: LifiQuoteResponse[];
  tags?: string[];
}

export interface LifiRoutesResponse {
  routes: LifiRoute[];
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function lifiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${LIFI_API}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LI.FI API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function lifiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${LIFI_API}${path}`, {
    method: 'POST',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LI.FI API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Get a single-step swap/bridge quote
 *
 * @param params - Quote parameters (fromChain, toChain, fromToken, toToken, fromAmount, fromAddress)
 * @returns Quote with transactionRequest ready to sign
 */
export async function getQuote(params: LifiQuoteRequest): Promise<LifiQuoteResponse> {
  return lifiGet<LifiQuoteResponse>('/quote', {
    fromChain: String(params.fromChain),
    toChain: String(params.toChain),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    ...(params.toAddress && { toAddress: params.toAddress }),
    ...(params.order && { order: params.order }),
    ...(params.slippage !== undefined && { slippage: String(params.slippage) }),
    integrator: params.integrator || 'omniflow',
  });
}

/**
 * Get multi-step routes (advanced routing)
 */
export async function getRoutes(params: LifiRoutesRequest): Promise<LifiRoutesResponse> {
  return lifiPost<LifiRoutesResponse>('/advanced/routes', {
    ...params,
    options: {
      ...(params.options || {}),
      integrator: params.options?.integrator || 'omniflow',
    },
  });
}

/**
 * Get all chains supported by LI.FI
 */
export async function getSupportedChains(): Promise<LifiChain[]> {
  const res = await lifiGet<{ chains: LifiChain[] }>('/chains');
  return res.chains;
}

/**
 * Get tokens supported by LI.FI on specific chains
 *
 * @param chainIds - Array of chain IDs to query
 * @returns Map of chainId -> token list
 */
export async function getTokens(chainIds?: number[]): Promise<Record<string, LifiTokenInfo[]>> {
  const params: Record<string, string> = {};
  if (chainIds?.length) {
    params.chains = chainIds.join(',');
  }
  const res = await lifiGet<{ tokens: Record<string, LifiTokenInfo[]> }>('/tokens', params);
  return res.tokens;
}

/**
 * Build UserOperationCall-compatible objects from a LI.FI quote
 *
 * Creates [approve, swap/bridge] calls that can be batched into a single UserOp.
 * Mirrors the pattern from gateway/operations.ts buildGatewayDepositCalls().
 *
 * @param quote - LI.FI quote response
 * @param fromTokenAddress - ERC20 token being sent (for approval)
 * @param amount - Amount in base units (for approval)
 * @returns Array of {to, data, value} calls for UserOperation
 */
export function buildLifiSwapCalls(
  quote: LifiQuoteResponse,
  fromTokenAddress: Hex,
  amount: bigint,
): Array<{ to: Hex; data: Hex; value?: bigint }> {
  const tx = quote.transactionRequest;
  const approvalAddress = quote.estimate.approvalAddress;
  const nativeValue = BigInt(tx.value || '0');

  const calls: Array<{ to: Hex; data: Hex; value?: bigint }> = [];

  // If sending ERC20 (not native token), add approval
  if (fromTokenAddress !== '0x0000000000000000000000000000000000000000' && approvalAddress) {
    // encodeFunctionData for approve is done inline to avoid importing ABI here
    // approve(address spender, uint256 amount) = 0x095ea7b3
    const spenderPadded = approvalAddress.slice(2).toLowerCase().padStart(64, '0');
    const amountHex = amount.toString(16).padStart(64, '0');
    const approveData = `0x095ea7b3${spenderPadded}${amountHex}` as Hex;

    calls.push({
      to: fromTokenAddress,
      data: approveData,
    });
  }

  // The actual swap/bridge call
  calls.push({
    to: tx.to as Hex,
    data: tx.data as Hex,
    ...(nativeValue > 0n && { value: nativeValue }),
  });

  return calls;
}
