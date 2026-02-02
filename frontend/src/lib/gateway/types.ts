/**
 * TypeScript types for Circle Gateway
 * Based on: https://developers.circle.com/gateway/quickstarts/unified-balance-evm
 */

import type { Hex } from 'viem';

/**
 * Burn intent specification (inner structure)
 */
export interface BurnIntentSpec {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  sourceContract: Hex;       // GatewayWallet address
  destinationContract: Hex;  // GatewayMinter address
  sourceToken: Hex;          // USDC on source chain
  destinationToken: Hex;     // USDC on destination chain
  sourceDepositor: Hex;      // Address that deposited (AA address)
  destinationRecipient: Hex; // Recipient on destination (usually same AA)
  sourceSigner: Hex;         // Address signing the intent (AA or EOA)
  destinationCaller: Hex;    // Who can call mint (0x0 for anyone)
  value: bigint;             // Amount in USDC base units
  salt: Hex;                 // Random 32 bytes for uniqueness
  hookData: Hex;             // Usually "0x"
}

/**
 * Complete burn intent structure
 */
export interface BurnIntent {
  maxBlockHeight: bigint;    // Usually maxUint256
  maxFee: bigint;            // Max fee willing to pay (e.g., 2_010000n for 2.01 USDC)
  spec: BurnIntentSpec;
}

/**
 * API request format for burn intent
 */
export interface BurnIntentRequest {
  burnIntent: {
    maxBlockHeight: string;
    maxFee: string;
    spec: {
      version: number;
      sourceDomain: number;
      destinationDomain: number;
      sourceContract: string;
      destinationContract: string;
      sourceToken: string;
      destinationToken: string;
      sourceDepositor: string;
      destinationRecipient: string;
      sourceSigner: string;
      destinationCaller: string;
      value: string;
      salt: string;
      hookData: string;
    };
  };
  signature: string;
}

/**
 * Response from Gateway transfer API
 */
export interface TransferResponse {
  attestation: Hex;
  signature: Hex;
  success?: boolean;
}

/**
 * Balance entry from Gateway API
 */
export interface BalanceEntry {
  domain: number;
  depositor?: string;
  balance: string;
}

/**
 * Response from Gateway balances API
 */
export interface BalancesResponse {
  token?: string;
  balances: BalanceEntry[];
}

/**
 * Parsed balance for easy consumption
 */
export interface ParsedBalance {
  chain: string;
  domain: number;
  balance: bigint;
}

/**
 * EIP-712 typed data domain for Gateway
 */
export interface GatewayTypedDataDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Hex;
}
