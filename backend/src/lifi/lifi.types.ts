/**
 * LI.FI API types — adapted from frontend/src/lib/lifi/api.ts
 */

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
