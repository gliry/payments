/**
 * UserOperation builders for Circle Gateway
 *
 * These functions create call arrays for AA UserOperations
 * to interact with Gateway contracts.
 */

import { encodeFunctionData, type Hex } from 'viem';
import type { UserOperationCall } from '../aa/circle-smart-account';
import { GATEWAY_WALLET, GATEWAY_MINTER } from './config';

// =============================================================================
// ABIs
// =============================================================================

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

const GATEWAY_WALLET_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const GATEWAY_MINTER_ABI = [
  {
    type: 'function',
    name: 'gatewayMint',
    inputs: [
      { name: 'attestationPayload', type: 'bytes' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

/**
 * GatewayWallet ABI for delegate management
 * Used by MSCA to add a delegate EOA that can sign burn intents
 */
const GATEWAY_WALLET_DELEGATE_ABI = [
  {
    type: 'function',
    name: 'addDelegate',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'delegate', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeDelegate',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'delegate', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// =============================================================================
// OPERATIONS
// =============================================================================

/**
 * Build calls for depositing USDC to Gateway
 *
 * Creates an atomic batch of:
 * 1. USDC.approve(GatewayWallet, amount)
 * 2. GatewayWallet.deposit(USDC, amount)
 *
 * @param usdcAddress - USDC contract address on the source chain
 * @param amount - Amount to deposit (in USDC base units, 6 decimals)
 * @returns Array of calls to include in UserOperation
 */
export function buildGatewayDepositCalls(
  usdcAddress: Hex,
  amount: bigint
): UserOperationCall[] {
  // Encode approve call
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [GATEWAY_WALLET, amount],
  });

  // Encode deposit call
  const depositData = encodeFunctionData({
    abi: GATEWAY_WALLET_ABI,
    functionName: 'deposit',
    args: [usdcAddress, amount],
  });

  return [
    {
      to: usdcAddress,
      data: approveData,
    },
    {
      to: GATEWAY_WALLET,
      data: depositData,
    },
  ];
}

/**
 * Build calls for minting USDC via Gateway on destination chain
 *
 * Creates a call to:
 * GatewayMinter.gatewayMint(attestation, operatorSignature)
 *
 * @param attestation - Attestation payload from Gateway API
 * @param operatorSignature - Operator signature from Gateway API
 * @returns Array of calls to include in UserOperation
 */
export function buildGatewayMintCalls(
  attestation: Hex,
  operatorSignature: Hex
): UserOperationCall[] {
  const mintData = encodeFunctionData({
    abi: GATEWAY_MINTER_ABI,
    functionName: 'gatewayMint',
    args: [attestation, operatorSignature],
  });

  return [
    {
      to: GATEWAY_MINTER,
      data: mintData,
    },
  ];
}

// =============================================================================
// MSCA DELEGATE OPERATIONS
// =============================================================================

/**
 * Build calls for MSCA to deposit USDC to Gateway
 *
 * This is an alias for buildGatewayDepositCalls, used for clarity when
 * the depositor is an MSCA (Circle Modular Smart Account).
 *
 * After deposit, the Gateway balance is tied to the MSCA address (sourceDepositor).
 * A delegate EOA can then sign burn intents on behalf of the MSCA.
 *
 * @param usdcAddress - USDC contract address on the source chain
 * @param amount - Amount to deposit (in USDC base units, 6 decimals)
 * @returns Array of calls to include in UserOperation
 */
export function buildMscaDepositCalls(
  usdcAddress: Hex,
  amount: bigint
): UserOperationCall[] {
  return buildGatewayDepositCalls(usdcAddress, amount);
}

/**
 * Build calls for MSCA to add a delegate to Gateway
 *
 * A delegate can sign burn intents on behalf of the MSCA depositor.
 * This is required because Gateway's burn intent uses EIP-712 signature
 * which requires EOA signing (EIP-1271 is NOT supported).
 *
 * The delegate mechanism allows:
 * - MSCA deposits to Gateway (sourceDepositor = MSCA address)
 * - Delegate EOA signs burn intents (sourceSigner = delegate address)
 * - Funds are burned from MSCA's Gateway balance
 *
 * @param usdcAddress - USDC contract address (token to delegate for)
 * @param delegate - EOA address to add as delegate
 * @returns Array of calls to include in UserOperation
 */
export function buildAddDelegateCalls(
  usdcAddress: Hex,
  delegate: Hex
): UserOperationCall[] {
  const addDelegateData = encodeFunctionData({
    abi: GATEWAY_WALLET_DELEGATE_ABI,
    functionName: 'addDelegate',
    args: [usdcAddress, delegate],
  });

  return [
    {
      to: GATEWAY_WALLET,
      data: addDelegateData,
    },
  ];
}

/**
 * Build calls for MSCA to remove a delegate from Gateway
 *
 * @param usdcAddress - USDC contract address (token to remove delegate for)
 * @param delegate - EOA address to remove as delegate
 * @returns Array of calls to include in UserOperation
 */
export function buildRemoveDelegateCalls(
  usdcAddress: Hex,
  delegate: Hex
): UserOperationCall[] {
  const removeDelegateData = encodeFunctionData({
    abi: GATEWAY_WALLET_DELEGATE_ABI,
    functionName: 'removeDelegate',
    args: [usdcAddress, delegate],
  });

  return [
    {
      to: GATEWAY_WALLET,
      data: removeDelegateData,
    },
  ];
}

// Export ABIs for external use
export { ERC20_ABI, GATEWAY_WALLET_ABI, GATEWAY_MINTER_ABI, GATEWAY_WALLET_DELEGATE_ABI };
