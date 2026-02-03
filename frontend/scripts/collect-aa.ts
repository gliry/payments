#!/usr/bin/env ts-node
/**
 * AA Collection Script - Collect USDC to Smart Account addresses
 *
 * This script:
 * 1. Creates Circle Smart Account on specified chain(s)
 * 2. Transfers USDC from EOA to Smart Account
 *
 * The AA address is the same on all chains (CREATE2 deterministic).
 * After collection, use Circle Gateway to move funds cross-chain.
 *
 * ⚠️  EOA MODE ONLY - Passkeys require browser with WebAuthn
 *
 * Usage:
 *   npx ts-node scripts/collect-aa.ts <chain> <amount>
 *   npx ts-node scripts/collect-aa.ts all <amount>  # All chains
 *   npx ts-node scripts/collect-aa.ts info          # Show AA address
 *
 * Example:
 *   npx ts-node scripts/collect-aa.ts base-sepolia 1
 *   npx ts-node scripts/collect-aa.ts all 0.5
 */

import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createSmartAccountWithEOA,
  CHAIN_DEFINITIONS,
  type SmartAccountSetup,
} from '../src/lib/aa/circle-smart-account';
import { AA_CHAINS, ALL_CHAINS, type AAChain, type SupportedChain } from '../src/config/chains';

// Use AA_CHAINS as CHAINS for this script
const CHAINS = AA_CHAINS;

// =============================================================================
// CONFIGURATION
// =============================================================================

const USDC_DECIMALS = 6;

// Map chain keys to private key env vars (for funding EOA)
const CHAIN_PRIVATE_KEY_ENV: Record<string, string> = {
  'base-sepolia': 'BASE_PRIVATE_KEY',
  'arc-testnet': 'ARC_PRIVATE_KEY',
  'optimism-sepolia': 'OPTIMISM_PRIVATE_KEY',
  'arbitrum-sepolia': 'ARBITRUM_PRIVATE_KEY',
  'unichain-sepolia': 'UNICHAIN_PRIVATE_KEY',
  'avalanche-fuji': 'AVALANCHE_PRIVATE_KEY',
  'polygon-amoy': 'POLYGON_PRIVATE_KEY',
  'monad-testnet': 'MONAD_PRIVATE_KEY',
};

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// =============================================================================
// HELPERS
// =============================================================================

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

async function getUsdcBalance(chainKey: string, address: Hex): Promise<bigint> {
  const chainConfig = ALL_CHAINS[chainKey];
  const chainDef = CHAIN_DEFINITIONS[chainKey];

  if (!chainConfig || !chainDef) {
    throw new Error(`Unknown chain: ${chainKey}`);
  }

  const publicClient = createPublicClient({
    chain: chainDef,
    transport: http(chainConfig.rpc),
  });

  const balance = await publicClient.readContract({
    address: chainConfig.usdc as Hex,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  return balance as bigint;
}

async function transferUsdc(
  chainKey: AAChain,
  to: Hex,
  amount: bigint,
  privateKey: Hex
): Promise<Hex> {
  const chainConfig = AA_CHAINS[chainKey];
  const chainDef = CHAIN_DEFINITIONS[chainKey];

  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: chainDef,
    transport: http(chainConfig.rpc),
  });

  const walletClient = createWalletClient({
    account,
    chain: chainDef,
    transport: http(chainConfig.rpc),
  });

  const txHash = await walletClient.writeContract({
    address: chainConfig.usdc as Hex,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to, amount],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return txHash;
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

async function getAAAddress(ownerPrivateKey: Hex): Promise<Hex> {
  // Use base-sepolia to get the address (it's the same on all chains)
  const setup = await createSmartAccountWithEOA('base-sepolia', ownerPrivateKey);
  return setup.accountAddress;
}

async function showInfo(ownerPrivateKey: Hex): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('Smart Account Info');
  console.log('='.repeat(60));

  const owner = privateKeyToAccount(ownerPrivateKey);
  console.log(`Owner EOA: ${owner.address}`);

  const aaAddress = await getAAAddress(ownerPrivateKey);
  console.log(`Smart Account: ${aaAddress}`);
  console.log('');
  console.log('This address is the same on ALL chains (CREATE2 deterministic)');
  console.log('');

  // Check balances on all chains
  console.log('USDC Balances:');
  for (const chainKey of Object.keys(ALL_CHAINS)) {
    try {
      const balance = await getUsdcBalance(chainKey, aaAddress);
      const formatted = formatUnits(balance, USDC_DECIMALS);
      console.log(`  ${chainKey}: ${formatted} USDC`);
    } catch (e) {
      console.log(`  ${chainKey}: (error reading balance)`);
    }
  }
}

async function collectOnChain(
  chainKey: AAChain,
  amount: bigint,
  ownerPrivateKey: Hex,
  fundingPrivateKey: Hex
): Promise<{ aaAddress: Hex; txHash: Hex }> {
  console.log(`\n[${chainKey}] Collecting ${formatUnits(amount, USDC_DECIMALS)} USDC to AA...`);

  // Get AA address
  const setup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
  const aaAddress = setup.accountAddress;

  // Check current balance
  const currentBalance = await getUsdcBalance(chainKey, aaAddress);
  console.log(`[${chainKey}] Current AA balance: ${formatUnits(currentBalance, USDC_DECIMALS)} USDC`);

  // Check EOA balance
  const eoaAccount = privateKeyToAccount(fundingPrivateKey);
  const eoaBalance = await getUsdcBalance(chainKey, eoaAccount.address);
  console.log(`[${chainKey}] EOA balance: ${formatUnits(eoaBalance, USDC_DECIMALS)} USDC`);

  if (eoaBalance < amount) {
    console.log(`[${chainKey}] Insufficient EOA balance, skipping`);
    return { aaAddress, txHash: '0x0' as Hex };
  }

  // Transfer
  console.log(`[${chainKey}] Transferring...`);
  const txHash = await transferUsdc(chainKey, aaAddress, amount, fundingPrivateKey);
  console.log(`[${chainKey}] Transfer tx: ${txHash}`);

  // New balance
  const newBalance = await getUsdcBalance(chainKey, aaAddress);
  console.log(`[${chainKey}] New AA balance: ${formatUnits(newBalance, USDC_DECIMALS)} USDC`);

  return { aaAddress, txHash };
}

async function collectAll(
  amount: bigint,
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('Collecting USDC to Smart Account on ALL chains');
  console.log('='.repeat(60));

  const aaAddress = await getAAAddress(ownerPrivateKey);
  console.log(`Smart Account: ${aaAddress}`);
  console.log(`Amount per chain: ${formatUnits(amount, USDC_DECIMALS)} USDC`);

  const results: { chain: string; txHash: Hex }[] = [];

  for (const chainKey of Object.keys(CHAINS) as AAChain[]) {
    try {
      const privateKeyEnv = CHAIN_PRIVATE_KEY_ENV[chainKey];
      const fundingPrivateKey = process.env[privateKeyEnv] as Hex | undefined;

      if (!fundingPrivateKey) {
        console.log(`\n[${chainKey}] Skipping - no private key (${privateKeyEnv})`);
        continue;
      }

      const { txHash } = await collectOnChain(
        chainKey,
        amount,
        ownerPrivateKey,
        fundingPrivateKey
      );

      if (txHash !== '0x0') {
        results.push({ chain: chainKey, txHash });
      }
    } catch (e) {
      console.log(`\n[${chainKey}] Error: ${e}`);
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('Collection Complete');
  console.log('='.repeat(60));
  console.log(`Smart Account: ${aaAddress}`);
  console.log('');
  console.log('Transactions:');
  for (const { chain, txHash } of results) {
    console.log(`  ${chain}: ${txHash}`);
  }

  // Final balances
  console.log('');
  console.log('Final Balances:');
  for (const chainKey of Object.keys(ALL_CHAINS)) {
    try {
      const balance = await getUsdcBalance(chainKey, aaAddress);
      const formatted = formatUnits(balance, USDC_DECIMALS);
      if (parseFloat(formatted) > 0) {
        console.log(`  ${chainKey}: ${formatted} USDC`);
      }
    } catch {
      // Skip errors
    }
  }
}

// =============================================================================
// CLI
// =============================================================================

function printUsage(): void {
  console.log('');
  console.log('AA Collection Script - Collect USDC to Smart Account');
  console.log('');
  console.log('Usage:');
  console.log('  npx ts-node scripts/collect-aa.ts <chain> <amount>');
  console.log('  npx ts-node scripts/collect-aa.ts all <amount>');
  console.log('  npx ts-node scripts/collect-aa.ts info');
  console.log('');
  console.log('Commands:');
  console.log('  <chain> <amount>  - Collect on specific chain');
  console.log('  all <amount>      - Collect on all chains');
  console.log('  info              - Show AA address and balances');
  console.log('');
  console.log('Chains: ethereum-sepolia, base-sepolia, sonic-testnet');
  console.log('');
  console.log('Environment variables:');
  console.log('  CIRCLE_CLIENT_KEY    - Circle Modular Wallets client key');
  console.log('  OWNER_PRIVATE_KEY    - Private key for AA owner (EOA signer)');
  console.log('  ETHEREUM_PRIVATE_KEY - Private key for Ethereum Sepolia EOA');
  console.log('  BASE_PRIVATE_KEY     - Private key for Base Sepolia EOA');
  console.log('  SONIC_PRIVATE_KEY    - Private key for Sonic Testnet EOA');
  console.log('');
  console.log('Examples:');
  console.log('  npx ts-node scripts/collect-aa.ts info');
  console.log('  npx ts-node scripts/collect-aa.ts base-sepolia 1');
  console.log('  npx ts-node scripts/collect-aa.ts all 0.5');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const ownerPrivateKey = getEnvOrThrow('OWNER_PRIVATE_KEY') as Hex;

  // Info command
  if (args[0] === 'info') {
    await showInfo(ownerPrivateKey);
    return;
  }

  // Collect command
  if (args.length < 2) {
    console.error('Error: Missing amount argument');
    printUsage();
    process.exit(1);
  }

  const [chainArg, amountStr] = args;
  const amount = parseUnits(amountStr, USDC_DECIMALS);

  if (chainArg === 'all') {
    await collectAll(amount, ownerPrivateKey);
  } else {
    if (!CHAINS[chainArg]) {
      console.error(`Error: Unknown chain "${chainArg}"`);
      console.error(`Supported chains: ${Object.keys(CHAINS).join(', ')}`);
      process.exit(1);
    }

    const chainKey = chainArg as AAChain;
    const privateKeyEnv = CHAIN_PRIVATE_KEY_ENV[chainKey];
    const fundingPrivateKey = getEnvOrThrow(privateKeyEnv) as Hex;

    console.log('');
    console.log('='.repeat(60));
    console.log('Collecting USDC to Smart Account');
    console.log('='.repeat(60));

    const { aaAddress, txHash } = await collectOnChain(
      chainKey,
      amount,
      ownerPrivateKey,
      fundingPrivateKey
    );

    console.log('');
    console.log('Done!');
    console.log(`Smart Account: ${aaAddress}`);
    console.log(`Transaction: ${txHash}`);
  }
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
