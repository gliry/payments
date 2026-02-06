/**
 * ENS resolution and DeFi payment preferences
 *
 * Uses viem's built-in ENS support for name resolution and text records.
 * Introduces "DeFi Payment Preferences" — arbitrary payment config stored
 * in ENS text records under the `com.omniflow.*` namespace.
 *
 * Creative ENS use case: when paying `merchant.eth`, the payer reads
 * the recipient's on-chain preferences (preferred chain, token, slippage)
 * and auto-configures the optimal swap/bridge route.
 *
 * @see https://docs.ens.domains
 * @see https://viem.sh/docs/ens/actions
 */

import {
  createPublicClient,
  http,
  namehash,
  encodeFunctionData,
  type Hex,
} from 'viem';
import { normalize } from 'viem/ens';
import { mainnet, sepolia } from 'viem/chains';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * ENS Public Resolver addresses
 * Mainnet: 0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63 (ENS Public Resolver 2)
 * Sepolia: 0x8FADE66B79cC9f707aB26799354482EB93a5B7dD
 */
const ENS_RESOLVERS = {
  mainnet: '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63' as Hex,
  sepolia: '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD' as Hex,
};

/** ABI for ENS PublicResolver setText */
const RESOLVER_ABI = [
  {
    type: 'function',
    name: 'setText',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// =============================================================================
// DEFI PREFERENCE KEYS
// =============================================================================

/**
 * Custom ENS text record keys for DeFi payment preferences.
 *
 * These follow the ENS text record convention (ENSIP-5/ERC-634)
 * using reverse-domain notation: `com.omniflow.*`
 *
 * When a payer resolves `merchant.eth`, they can read these records
 * to auto-configure the payment route without off-chain coordination.
 */
export const DEFI_PREF_KEYS = {
  /** Preferred receiving chain ID or key (e.g., "8453" for Base, "42161" for Arbitrum) */
  PREFERRED_CHAIN: 'com.omniflow.chain',
  /** Preferred receiving token address or symbol (e.g., "USDC", "0x...") */
  PREFERRED_TOKEN: 'com.omniflow.token',
  /** Maximum acceptable slippage as decimal (e.g., "0.005" = 0.5%) */
  MAX_SLIPPAGE: 'com.omniflow.slippage',
  /** Preferred swap/bridge router (e.g., "lifi", "1inch") */
  PREFERRED_ROUTER: 'com.omniflow.router',
  /** Override receiving address (if different from ENS-resolved address) */
  PAYMENT_ADDRESS: 'com.omniflow.address',
} as const;

/** Standard ENS text record keys to read */
export const STANDARD_KEYS = [
  'email',
  'url',
  'avatar',
  'description',
  'notice',
  'com.twitter',
  'com.github',
  'com.discord',
  'org.telegram',
] as const;

export interface DefiPreferences {
  preferredChain?: string;
  preferredToken?: string;
  maxSlippage?: number;
  preferredRouter?: string;
  paymentAddress?: Hex;
}

// =============================================================================
// CLIENT
// =============================================================================

let _mainnetClient: ReturnType<typeof createPublicClient> | null = null;
let _sepoliaClient: ReturnType<typeof createPublicClient> | null = null;

function getEnsClient(testnet = false) {
  if (testnet) {
    if (!_sepoliaClient) {
      _sepoliaClient = createPublicClient({
        chain: sepolia,
        transport: http(process.env.SEPOLIA_RPC || 'https://rpc.sepolia.org'),
      });
    }
    return _sepoliaClient;
  }
  if (!_mainnetClient) {
    _mainnetClient = createPublicClient({
      chain: mainnet,
      transport: http(process.env.MAINNET_RPC || 'https://cloudflare-eth.com'),
    });
  }
  return _mainnetClient;
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Resolve ENS name to address (forward resolution)
 *
 * @param name - ENS name (e.g., "vitalik.eth")
 * @param testnet - Use Sepolia ENS instead of mainnet
 * @returns Resolved address or null
 */
export async function resolveAddress(name: string, testnet = false): Promise<Hex | null> {
  const client = getEnsClient(testnet);
  const address = await client.getEnsAddress({
    name: normalize(name),
  });
  return address as Hex | null;
}

/**
 * Reverse resolution: address to ENS name
 *
 * @param address - Ethereum address
 * @param testnet - Use Sepolia ENS instead of mainnet
 * @returns ENS name or null
 */
export async function resolveName(address: Hex, testnet = false): Promise<string | null> {
  const client = getEnsClient(testnet);
  return client.getEnsName({ address });
}

// =============================================================================
// TEXT RECORDS
// =============================================================================

/**
 * Read a single ENS text record
 *
 * @param name - ENS name
 * @param key - Text record key
 * @param testnet - Use Sepolia ENS
 * @returns Text record value or null
 */
export async function getTextRecord(
  name: string,
  key: string,
  testnet = false,
): Promise<string | null> {
  const client = getEnsClient(testnet);
  return client.getEnsText({
    name: normalize(name),
    key,
  });
}

/**
 * Read multiple ENS text records in parallel
 *
 * @param name - ENS name
 * @param keys - Array of text record keys
 * @param testnet - Use Sepolia ENS
 * @returns Map of key -> value (null for missing records)
 */
export async function getTextRecords(
  name: string,
  keys: readonly string[],
  testnet = false,
): Promise<Record<string, string | null>> {
  const results = await Promise.all(
    keys.map(async (key) => {
      const value = await getTextRecord(name, key, testnet);
      return [key, value] as const;
    }),
  );
  return Object.fromEntries(results);
}

/**
 * Read all standard ENS text records
 */
export async function getStandardRecords(
  name: string,
  testnet = false,
): Promise<Record<string, string | null>> {
  return getTextRecords(name, STANDARD_KEYS, testnet);
}

// =============================================================================
// DEFI PREFERENCES
// =============================================================================

/**
 * Read DeFi payment preferences from ENS text records
 *
 * Reads all `com.omniflow.*` text records and returns a typed object.
 * This is the core of the creative ENS use case.
 *
 * @param name - ENS name (e.g., "merchant.eth")
 * @param testnet - Use Sepolia ENS
 * @returns Parsed DeFi preferences
 */
export async function getDefiPreferences(
  name: string,
  testnet = false,
): Promise<DefiPreferences> {
  const keys = Object.values(DEFI_PREF_KEYS);
  const records = await getTextRecords(name, keys, testnet);

  const prefs: DefiPreferences = {};

  if (records[DEFI_PREF_KEYS.PREFERRED_CHAIN]) {
    prefs.preferredChain = records[DEFI_PREF_KEYS.PREFERRED_CHAIN]!;
  }
  if (records[DEFI_PREF_KEYS.PREFERRED_TOKEN]) {
    prefs.preferredToken = records[DEFI_PREF_KEYS.PREFERRED_TOKEN]!;
  }
  if (records[DEFI_PREF_KEYS.MAX_SLIPPAGE]) {
    prefs.maxSlippage = parseFloat(records[DEFI_PREF_KEYS.MAX_SLIPPAGE]!);
  }
  if (records[DEFI_PREF_KEYS.PREFERRED_ROUTER]) {
    prefs.preferredRouter = records[DEFI_PREF_KEYS.PREFERRED_ROUTER]!;
  }
  if (records[DEFI_PREF_KEYS.PAYMENT_ADDRESS]) {
    prefs.paymentAddress = records[DEFI_PREF_KEYS.PAYMENT_ADDRESS] as Hex;
  }

  return prefs;
}

// =============================================================================
// WRITE HELPERS (encode calldata for AA batching)
// =============================================================================

/**
 * Encode a setText call on the ENS PublicResolver
 *
 * Returns a UserOperationCall-compatible object that can be included
 * in an AA UserOp batch to set an ENS text record.
 *
 * @param name - ENS name
 * @param key - Text record key
 * @param value - Text record value
 * @param testnet - Use Sepolia resolver
 * @returns {to, data} call for UserOperation
 */
export function encodeSetText(
  name: string,
  key: string,
  value: string,
  testnet = false,
): { to: Hex; data: Hex } {
  const node = namehash(normalize(name));
  const resolver = testnet ? ENS_RESOLVERS.sepolia : ENS_RESOLVERS.mainnet;

  const data = encodeFunctionData({
    abi: RESOLVER_ABI,
    functionName: 'setText',
    args: [node, key, value],
  });

  return { to: resolver, data };
}

/**
 * Encode multiple setText calls for DeFi payment preferences
 *
 * Returns an array of UserOperationCall-compatible objects that set
 * all provided DeFi preferences in a single AA UserOp batch.
 *
 * @param name - ENS name
 * @param prefs - Partial DeFi preferences to set
 * @param testnet - Use Sepolia resolver
 * @returns Array of {to, data} calls for UserOperation batching
 */
export function encodeSetDefiPreferences(
  name: string,
  prefs: Partial<DefiPreferences>,
  testnet = false,
): Array<{ to: Hex; data: Hex }> {
  const calls: Array<{ to: Hex; data: Hex }> = [];

  if (prefs.preferredChain !== undefined) {
    calls.push(encodeSetText(name, DEFI_PREF_KEYS.PREFERRED_CHAIN, prefs.preferredChain, testnet));
  }
  if (prefs.preferredToken !== undefined) {
    calls.push(encodeSetText(name, DEFI_PREF_KEYS.PREFERRED_TOKEN, prefs.preferredToken, testnet));
  }
  if (prefs.maxSlippage !== undefined) {
    calls.push(encodeSetText(name, DEFI_PREF_KEYS.MAX_SLIPPAGE, String(prefs.maxSlippage), testnet));
  }
  if (prefs.preferredRouter !== undefined) {
    calls.push(encodeSetText(name, DEFI_PREF_KEYS.PREFERRED_ROUTER, prefs.preferredRouter, testnet));
  }
  if (prefs.paymentAddress !== undefined) {
    calls.push(encodeSetText(name, DEFI_PREF_KEYS.PAYMENT_ADDRESS, prefs.paymentAddress, testnet));
  }

  return calls;
}
