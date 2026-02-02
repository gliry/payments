/**
 * Circle Smart Account utilities for Account Abstraction
 *
 * ⚠️  IMPORTANT: OWNER TYPE AFFECTS AA ADDRESS!
 *
 * The Smart Account address is determined by CREATE2 using:
 *   mixedSalt = keccak256(owner + salt)
 *
 * Different owner types produce DIFFERENT addresses:
 *   - EOA owner (privateKey)  → AA address 0xAAA...
 *   - Passkey owner (WebAuthn) → AA address 0xBBB... (DIFFERENT!)
 *
 * For automation/CLI scripts, use EOA mode.
 * For browser UX with biometrics, use Passkey mode.
 *
 * @see https://developers.circle.com/wallets/account-types
 * @see https://developers.circle.com/wallets/modular/web-sdk
 */

// Polyfill for Node.js environment
// Circle SDK checks window.location.hostname for API key validation
declare const globalThis: any;
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { hostname: 'localhost' }
  };
}

import {
  createPublicClient,
  http,
  type Chain,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import {
  toCircleSmartAccount,
  toModularTransport,
} from '@circle-fin/modular-wallets-core';
import { createBundlerClient } from 'viem/account-abstraction';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CIRCLE_CLIENT_KEY = process.env.CIRCLE_CLIENT_KEY || '';

/**
 * Circle bundler RPC endpoints for each chain
 * Note: Not all Gateway chains have Circle bundler support
 */
export const CIRCLE_BUNDLER_RPCS: Record<string, string> = {
  // Supported by Circle Modular Wallets SDK
  'arbitrum-sepolia': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/arbitrumSepolia',
  'arc-testnet': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/arcTestnet',
  'avalanche-fuji': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/avalancheFuji',
  'base-sepolia': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/baseSepolia',
  'monad-testnet': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/monadTestnet',
  'optimism-sepolia': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/optimismSepolia',
  'polygon-amoy': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/polygonAmoy',
  'unichain-sepolia': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/unichainSepolia',
};

/**
 * Chain definitions for viem
 */
export const CHAIN_DEFINITIONS: Record<string, Chain> = {
  // AA-supported chains (Circle Modular Wallets SDK)
  'arbitrum-sepolia': {
    id: 421614,
    name: 'Arbitrum Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] },
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
  'avalanche-fuji': {
    id: 43113,
    name: 'Avalanche Fuji',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://api.avax-test.network/ext/bc/C/rpc'] },
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
  'monad-testnet': {
    id: 10143,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://testnet-rpc.monad.xyz'] },
    },
  },
  'optimism-sepolia': {
    id: 11155420,
    name: 'Optimism Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://optimism-sepolia-public.nodies.app'] },
    },
  },
  'polygon-amoy': {
    id: 80002,
    name: 'Polygon Amoy',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://rpc-amoy.polygon.technology'] },
    },
  },
  'unichain-sepolia': {
    id: 1301,
    name: 'Unichain Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://sepolia.unichain.org'] },
    },
  },
};

// =============================================================================
// TYPES
// =============================================================================

export interface SmartAccountSetup {
  accountAddress: Hex;
  bundlerClient: any;
  publicClient: PublicClient;
  owner: PrivateKeyAccount;
  chainKey: string;
  bundlerRpc: string;
}

export interface UserOperationCall {
  to: Hex;
  data: Hex;
  value?: bigint;
}

export interface UserOperationResult {
  userOpHash: Hex;
  txHash: Hex;
}

// =============================================================================
// EOA MODE (CLI + Browser)
// =============================================================================

/**
 * Create a Circle Smart Account with EOA signer
 *
 * ✅ Works in: Node.js, Browser
 * ✅ Automation: Full (private key can sign without user interaction)
 *
 * @param chainKey - Chain identifier (e.g., 'ethereum-sepolia', 'arc-testnet')
 * @param ownerPrivateKey - Private key of the EOA owner (hex string with 0x prefix)
 * @returns Smart account setup with bundler client
 */
export async function createSmartAccountWithEOA(
  chainKey: string,
  ownerPrivateKey: Hex
): Promise<SmartAccountSetup> {
  const bundlerRpc = CIRCLE_BUNDLER_RPCS[chainKey];
  const chain = CHAIN_DEFINITIONS[chainKey];

  if (!bundlerRpc || !chain) {
    throw new Error(`Unsupported chain: ${chainKey}. Supported: ${Object.keys(CIRCLE_BUNDLER_RPCS).join(', ')}`);
  }

  if (!CIRCLE_CLIENT_KEY) {
    throw new Error(
      'CIRCLE_CLIENT_KEY is not set in environment. ' +
      'Get your Client Key from https://console.circle.com'
    );
  }

  console.log(`[EOA MODE] Creating Smart Account on ${chainKey}...`);

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
  // The SDK accepts LocalAccount (from privateKeyToAccount) as owner
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

  const accountAddress = await account.getAddress();

  console.log(`[${chainKey}] Smart Account: ${accountAddress}`);
  console.log(`[${chainKey}] Owner EOA: ${owner.address}`);

  return {
    accountAddress,
    bundlerClient,
    publicClient,
    owner,
    chainKey,
    bundlerRpc,
  };
}

/**
 * Alias for createSmartAccountWithEOA (backwards compatibility)
 * @deprecated Use createSmartAccountWithEOA for clarity
 */
export const createSmartAccountForChain = createSmartAccountWithEOA;

// =============================================================================
// PASSKEY MODE (Browser only)
// =============================================================================

/**
 * Create a Circle Smart Account with Passkey (WebAuthn) signer
 *
 * ⚠️  BROWSER ONLY - Does NOT work in Node.js!
 */
export async function createSmartAccountWithPasskey(
  _chainKey: string,
  _credential: unknown
): Promise<SmartAccountSetup> {
  throw new Error(
    'Passkey mode is only available in the browser with WebAuthn support. ' +
    'For CLI/Node.js scripts, use createSmartAccountWithEOA() instead.'
  );
}

// =============================================================================
// USER OPERATIONS
// =============================================================================

/**
 * Send a UserOperation from the Smart Account
 */
export async function sendUserOperation(
  setup: SmartAccountSetup,
  calls: UserOperationCall[]
): Promise<UserOperationResult> {
  console.log(`[${setup.chainKey}] Sending UserOperation with ${calls.length} call(s)...`);

  const userOpHash = await setup.bundlerClient.sendUserOperation({
    calls,
  });
  console.log(`[${setup.chainKey}] UserOperation sent: ${userOpHash}`);

  const receipt = await setup.bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log(`[${setup.chainKey}] UserOperation included in tx: ${receipt.receipt.transactionHash}`);

  return {
    userOpHash,
    txHash: receipt.receipt.transactionHash,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the Smart Account address for a given EOA owner
 */
export async function getSmartAccountAddress(
  ownerPrivateKey: Hex
): Promise<Hex> {
  const setup = await createSmartAccountWithEOA('ethereum-sepolia', ownerPrivateKey);
  return setup.accountAddress;
}

/**
 * Create Smart Accounts on multiple chains with the same owner
 */
export async function createSmartAccountsOnMultipleChains(
  chainKeys: string[],
  ownerPrivateKey: Hex
): Promise<Map<string, SmartAccountSetup>> {
  const accounts = new Map<string, SmartAccountSetup>();

  for (const chainKey of chainKeys) {
    const setup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
    accounts.set(chainKey, setup);
  }

  return accounts;
}

