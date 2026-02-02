/**
 * Circle Gateway API interactions
 * Based on: https://developers.circle.com/gateway/quickstarts/unified-balance-evm
 *
 * Handles:
 * - Checking unified balance across chains
 * - Creating transfer requests (burn intents)
 * - Getting attestations for minting
 */

import { type Hex, maxUint256, toHex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import {
  GATEWAY_API,
  GATEWAY_WALLET,
  GATEWAY_MINTER,
  GATEWAY_DOMAINS,
  DOMAIN_TO_CHAIN,
  getDomain,
} from './config';
import { ALL_CHAINS } from '../../config/chains';
import type {
  BurnIntent,
  BurnIntentSpec,
  BurnIntentRequest,
  TransferResponse,
  BalancesResponse,
  ParsedBalance,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

const USDC_DECIMALS = 6;
const ZERO_ADDRESS: Hex = '0x0000000000000000000000000000000000000000';

/**
 * EIP-712 types for BurnIntent signing
 * Based on Circle Gateway documentation
 * Note: Addresses are bytes32 in the spec, domain has no chainId/verifyingContract
 */
const BURN_INTENT_TYPES = {
  BurnIntent: [
    { name: 'maxBlockHeight', type: 'uint256' },
    { name: 'maxFee', type: 'uint256' },
    { name: 'spec', type: 'TransferSpec' },
  ],
  TransferSpec: [
    { name: 'version', type: 'uint32' },
    { name: 'sourceDomain', type: 'uint32' },
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'sourceContract', type: 'bytes32' },
    { name: 'destinationContract', type: 'bytes32' },
    { name: 'sourceToken', type: 'bytes32' },
    { name: 'destinationToken', type: 'bytes32' },
    { name: 'sourceDepositor', type: 'bytes32' },
    { name: 'destinationRecipient', type: 'bytes32' },
    { name: 'sourceSigner', type: 'bytes32' },
    { name: 'destinationCaller', type: 'bytes32' },
    { name: 'value', type: 'uint256' },
    { name: 'salt', type: 'bytes32' },
    { name: 'hookData', type: 'bytes' },
  ],
} as const;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate random 32 bytes for salt
 */
function generateSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * Convert address to bytes32 format (pad to 32 bytes for API)
 */
function addressToBytes32(address: Hex): Hex {
  // Remove 0x prefix, pad to 64 chars (32 bytes), add 0x back
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}` as Hex;
}

/**
 * Get USDC address for a chain
 */
function getUsdcAddress(chainKey: string): Hex {
  const chain = ALL_CHAINS[chainKey];
  if (!chain) {
    throw new Error(`Unknown chain: ${chainKey}`);
  }
  return chain.usdc as Hex;
}

// =============================================================================
// BALANCE API
// =============================================================================

/**
 * Get Gateway unified balance for a depositor across all chains
 *
 * @param depositor - The depositor address (AA address)
 * @returns Array of balances per chain
 */
export async function getGatewayBalance(
  depositor: Hex
): Promise<ParsedBalance[]> {
  const sources = Object.entries(GATEWAY_DOMAINS).map(([_chain, domain]) => ({
    domain,
    depositor,
  }));

  const response = await fetch(`${GATEWAY_API}/v1/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'USDC',
      sources,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway API error: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as BalancesResponse;

  return data.balances.map((entry) => ({
    chain: DOMAIN_TO_CHAIN[entry.domain] || `unknown-${entry.domain}`,
    domain: entry.domain,
    // Balance might be in string format like "2.000000" or base units
    balance: parseBalance(entry.balance),
  }));
}

/**
 * Parse balance from API response (handles both formats)
 */
function parseBalance(balance: string): bigint {
  // Check if it's a decimal string like "2.000000"
  if (balance.includes('.')) {
    const [whole, frac = ''] = balance.split('.');
    const paddedFrac = frac.padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);
    return BigInt(whole + paddedFrac);
  }
  // Otherwise assume it's already in base units
  return BigInt(balance);
}

/**
 * Get total unified balance across all chains
 */
export async function getTotalGatewayBalance(depositor: Hex): Promise<bigint> {
  const balances = await getGatewayBalance(depositor);
  return balances.reduce((sum, b) => sum + b.balance, 0n);
}

// =============================================================================
// TRANSFER API
// =============================================================================

/**
 * Create a burn intent for transferring USDC
 *
 * @param sourceChain - Source chain key
 * @param destinationChain - Destination chain key
 * @param amount - Amount to transfer (in base units)
 * @param depositor - Address that deposited (AA address)
 * @param recipient - Recipient address on destination chain
 * @param signer - Address signing the intent (EOA that owns AA)
 * @param maxFee - Maximum fee (default: 2.01 USDC)
 */
export function createBurnIntent(
  sourceChain: string,
  destinationChain: string,
  amount: bigint,
  depositor: Hex,
  recipient: Hex,
  signer: Hex,
  maxFee: bigint = 2_010000n // 2.01 USDC default
): BurnIntent {
  const sourceDomain = getDomain(sourceChain);
  const destinationDomain = getDomain(destinationChain);
  const sourceToken = getUsdcAddress(sourceChain);
  const destinationToken = getUsdcAddress(destinationChain);

  const spec: BurnIntentSpec = {
    version: 1,
    sourceDomain,
    destinationDomain,
    sourceContract: GATEWAY_WALLET,
    destinationContract: GATEWAY_MINTER,
    sourceToken,
    destinationToken,
    sourceDepositor: depositor,
    destinationRecipient: recipient,
    sourceSigner: signer,
    destinationCaller: ZERO_ADDRESS, // Anyone can call mint
    value: amount,
    salt: generateSalt(),
    hookData: '0x',
  };

  return {
    maxBlockHeight: maxUint256,
    maxFee,
    spec,
  };
}

/**
 * Create EIP-712 typed data for signing burn intent
 * Note: Domain has only name and version (no chainId or verifyingContract)
 * Note: All addresses in spec must be bytes32 format
 */
function createBurnIntentTypedData(burnIntent: BurnIntent) {
  return {
    domain: {
      name: 'GatewayWallet',
      version: '1',
    },
    types: BURN_INTENT_TYPES,
    primaryType: 'BurnIntent' as const,
    message: {
      maxBlockHeight: burnIntent.maxBlockHeight,
      maxFee: burnIntent.maxFee,
      spec: {
        version: burnIntent.spec.version,
        sourceDomain: burnIntent.spec.sourceDomain,
        destinationDomain: burnIntent.spec.destinationDomain,
        sourceContract: addressToBytes32(burnIntent.spec.sourceContract),
        destinationContract: addressToBytes32(burnIntent.spec.destinationContract),
        sourceToken: addressToBytes32(burnIntent.spec.sourceToken),
        destinationToken: addressToBytes32(burnIntent.spec.destinationToken),
        sourceDepositor: addressToBytes32(burnIntent.spec.sourceDepositor),
        destinationRecipient: addressToBytes32(burnIntent.spec.destinationRecipient),
        sourceSigner: addressToBytes32(burnIntent.spec.sourceSigner),
        destinationCaller: addressToBytes32(burnIntent.spec.destinationCaller),
        value: burnIntent.spec.value,
        salt: burnIntent.spec.salt,
        hookData: burnIntent.spec.hookData,
      },
    },
  };
}

/**
 * Format burn intent for API request
 * Note: API expects addresses in bytes32 format (padded to 32 bytes)
 */
function formatBurnIntentForApi(burnIntent: BurnIntent): BurnIntentRequest['burnIntent'] {
  return {
    maxBlockHeight: burnIntent.maxBlockHeight.toString(),
    maxFee: burnIntent.maxFee.toString(),
    spec: {
      version: burnIntent.spec.version,
      sourceDomain: burnIntent.spec.sourceDomain,
      destinationDomain: burnIntent.spec.destinationDomain,
      sourceContract: addressToBytes32(burnIntent.spec.sourceContract),
      destinationContract: addressToBytes32(burnIntent.spec.destinationContract),
      sourceToken: addressToBytes32(burnIntent.spec.sourceToken),
      destinationToken: addressToBytes32(burnIntent.spec.destinationToken),
      sourceDepositor: addressToBytes32(burnIntent.spec.sourceDepositor),
      destinationRecipient: addressToBytes32(burnIntent.spec.destinationRecipient),
      sourceSigner: addressToBytes32(burnIntent.spec.sourceSigner),
      destinationCaller: addressToBytes32(burnIntent.spec.destinationCaller),
      value: burnIntent.spec.value.toString(),
      salt: burnIntent.spec.salt,
      hookData: burnIntent.spec.hookData,
    },
  };
}

/**
 * Request a transfer through Gateway API
 *
 * Signs the burn intent with EOA and submits to Gateway.
 * Returns attestation and operator signature for minting on destination.
 *
 * @param burnIntent - The burn intent to execute
 * @param account - EOA account to sign with (must match sourceSigner)
 */
export async function requestTransfer(
  burnIntent: BurnIntent,
  account: PrivateKeyAccount
): Promise<TransferResponse> {
  // Create EIP-712 typed data
  const typedData = createBurnIntentTypedData(burnIntent);

  // Sign with EOA
  const signature = await account.signTypedData(typedData);

  // Format request for API
  const request: BurnIntentRequest = {
    burnIntent: formatBurnIntentForApi(burnIntent),
    signature,
  };

  console.log('[gateway] Submitting transfer request...');

  // Submit to Gateway API
  const response = await fetch(`${GATEWAY_API}/v1/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([request]), // API expects array
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway transfer error: ${response.status} - ${text}`);
  }

  const data = await response.json();

  // API returns array, we sent one intent
  const result = Array.isArray(data) ? data[0] : data;

  if (!result.attestation) {
    throw new Error(`Gateway returned no attestation: ${JSON.stringify(result)}`);
  }

  return {
    attestation: result.attestation as Hex,
    signature: result.signature as Hex,
    success: result.success,
  };
}

/**
 * High-level function to transfer USDC via Gateway
 *
 * This creates a burn intent, signs it, and gets the attestation.
 * The caller must then mint on the destination chain using buildGatewayMintCalls.
 *
 * @param sourceChain - Source chain key
 * @param destinationChain - Destination chain key
 * @param amount - Amount to transfer
 * @param depositor - Address that deposited to Gateway
 * @param recipient - Recipient on destination (usually same as depositor)
 * @param account - EOA signer (must match depositor for AA, or be depositor for EOA)
 */
export async function initiateTransfer(
  sourceChain: string,
  destinationChain: string,
  amount: bigint,
  depositor: Hex,
  recipient: Hex,
  account: PrivateKeyAccount
): Promise<{ burnIntent: BurnIntent; transfer: TransferResponse }> {
  const burnIntent = createBurnIntent(
    sourceChain,
    destinationChain,
    amount,
    depositor,
    recipient,
    account.address // EOA signs the intent (sourceSigner)
  );

  console.log(`[gateway] Creating burn intent...`);
  console.log(`  Source: ${sourceChain} (domain ${burnIntent.spec.sourceDomain})`);
  console.log(`  Destination: ${destinationChain} (domain ${burnIntent.spec.destinationDomain})`);
  console.log(`  Amount: ${amount} (${Number(amount) / 10 ** USDC_DECIMALS} USDC)`);
  console.log(`  Depositor: ${depositor}`);
  console.log(`  Recipient: ${recipient}`);
  console.log(`  Signer: ${account.address}`);

  const transfer = await requestTransfer(burnIntent, account);

  console.log(`[gateway] Attestation received!`);

  return { burnIntent, transfer };
}

// Export for external use
export { BURN_INTENT_TYPES, createBurnIntentTypedData };
