/**
 * Circle Smart Account utilities for Account Abstraction
 *
 * This module provides functions to create and use Circle Smart Accounts
 * with an EOA signer (private key) instead of passkeys.
 */

import { createPublicClient, http, type Chain, type PublicClient } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import {
  createBundlerClient,
  type BundlerClient,
  type SmartAccount,
} from 'viem/account-abstraction';
import {
  toCircleSmartAccount,
  toModularTransport,
} from '@circle-fin/modular-wallets-core';

import { CIRCLE_CLIENT_KEY } from '../../config/circle';

// Circle bundler RPC endpoints for each chain
export const CIRCLE_BUNDLER_RPCS: Record<string, string> = {
  'ethereum-sepolia': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/ethereumSepolia',
  'base-sepolia': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/baseSepolia',
  'sonic-testnet': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/sonicTestnet',
  'arc-testnet': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/arcTestnet',
};

// Chain definitions for viem
export const CHAIN_DEFINITIONS: Record<string, Chain> = {
  'ethereum-sepolia': {
    id: 11155111,
    name: 'Ethereum Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://rpc.sepolia.org'] },
    },
  },
  'base-sepolia': {
    id: 84532,
    name: 'Base Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://sepolia.base.org'] },
    },
  },
  'sonic-testnet': {
    id: 64165,
    name: 'Sonic Testnet',
    nativeCurrency: { name: 'S', symbol: 'S', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://rpc.blaze.soniclabs.com'] },
    },
  },
  'arc-testnet': {
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://rpc.testnet.arc.network'] },
    },
  },
};

export interface SmartAccountSetup {
  account: SmartAccount;
  bundlerClient: BundlerClient;
  publicClient: PublicClient;
  owner: PrivateKeyAccount;
}

/**
 * Create a Circle Smart Account for a specific chain
 *
 * @param chainKey - Chain identifier (e.g., 'ethereum-sepolia', 'arc-testnet')
 * @param ownerPrivateKey - Private key of the EOA owner (hex string with 0x prefix)
 * @returns Smart account setup with bundler client
 */
export async function createSmartAccountForChain(
  chainKey: string,
  ownerPrivateKey: `0x${string}`
): Promise<SmartAccountSetup> {
  const bundlerRpc = CIRCLE_BUNDLER_RPCS[chainKey];
  const chain = CHAIN_DEFINITIONS[chainKey];

  if (!bundlerRpc || !chain) {
    throw new Error(`Unsupported chain: ${chainKey}`);
  }

  if (!CIRCLE_CLIENT_KEY) {
    throw new Error('CIRCLE_CLIENT_KEY is not set in environment');
  }

  // Create EOA owner account from private key
  const owner = privateKeyToAccount(ownerPrivateKey);

  // Create modular transport for Circle bundler
  const transport = toModularTransport(bundlerRpc, CIRCLE_CLIENT_KEY);

  // Create public client with Circle transport
  const publicClient = createPublicClient({
    chain,
    transport,
  });

  // Create Circle Smart Account with EOA owner
  const account = await toCircleSmartAccount({
    client: publicClient,
    owner,
  });

  // Create bundler client for UserOperations
  const bundlerClient = createBundlerClient({
    account,
    chain,
    transport,
  });

  console.log(`[${chainKey}] Smart Account created: ${account.address}`);
  console.log(`[${chainKey}] Owner EOA: ${owner.address}`);

  return {
    account,
    bundlerClient,
    publicClient,
    owner,
  };
}

export interface UserOperationCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

export interface UserOperationResult {
  userOpHash: `0x${string}`;
  txHash: `0x${string}`;
}

/**
 * Send a UserOperation from the Smart Account
 *
 * @param setup - Smart account setup from createSmartAccountForChain
 * @param calls - Array of contract calls to execute
 * @returns UserOperation hash and transaction hash
 */
export async function sendUserOperation(
  setup: SmartAccountSetup,
  calls: UserOperationCall[]
): Promise<UserOperationResult> {
  console.log(`Sending UserOperation with ${calls.length} call(s)...`);

  // Send the UserOperation via bundler
  const userOpHash = await setup.bundlerClient.sendUserOperation({
    calls,
  });

  console.log(`UserOperation sent: ${userOpHash}`);

  // Wait for the UserOperation to be included
  const receipt = await setup.bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log(`UserOperation included in tx: ${receipt.receipt.transactionHash}`);

  return {
    userOpHash,
    txHash: receipt.receipt.transactionHash,
  };
}

/**
 * Get the Smart Account address for a given owner on any chain
 * (Same address across all chains due to CREATE2)
 *
 * @param ownerPrivateKey - Private key of the EOA owner
 * @returns The deterministic Smart Account address
 */
export async function getSmartAccountAddress(
  ownerPrivateKey: `0x${string}`
): Promise<`0x${string}`> {
  // Use any chain to get the address (it's the same on all chains)
  const setup = await createSmartAccountForChain('ethereum-sepolia', ownerPrivateKey);
  return setup.account.address;
}
