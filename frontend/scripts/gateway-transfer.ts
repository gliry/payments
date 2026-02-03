#!/usr/bin/env ts-node
/**
 * Gateway Transfer Script - Cross-chain USDC transfer via Circle Gateway
 *
 * This script:
 * 1. Creates a burn intent from Gateway unified balance
 * 2. Signs it with EOA (owner of AA)
 * 3. Requests attestation from Gateway API
 * 4. Mints USDC on destination chain via AA UserOperation
 *
 * Prerequisites:
 * - USDC must be deposited to Gateway using gateway-deposit.ts
 * - AA must have gas on destination chain for minting
 *
 * Usage:
 *   npx ts-node scripts/gateway-transfer.ts <dest-chain> <amount> [source-chain]
 *
 * Example:
 *   npx ts-node scripts/gateway-transfer.ts arc-testnet 1
 *   npx ts-node scripts/gateway-transfer.ts arc-testnet 1 base-sepolia
 */

import 'dotenv/config';
import {
  parseUnits,
  formatUnits,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createSmartAccountWithEOA,
  sendUserOperation,
  CHAIN_DEFINITIONS,
} from '../src/lib/aa/circle-smart-account';
import { ALL_CHAINS } from '../src/config/chains';
import {
  buildGatewayMintCalls,
  getGatewayBalance,
  initiateTransfer,
  GATEWAY_DOMAINS,
} from '../src/lib/gateway';

// =============================================================================
// CONFIGURATION
// =============================================================================

const USDC_DECIMALS = 6;

// Chains that support Gateway
const GATEWAY_CHAINS = Object.keys(GATEWAY_DOMAINS);

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

/**
 * Find the best source chain for a transfer amount
 * Returns the chain with sufficient balance, preferring chains with higher balance
 */
async function findSourceChain(
  depositor: Hex,
  amount: bigint
): Promise<string | null> {
  const balances = await getGatewayBalance(depositor);

  // Sort by balance descending
  const sorted = balances
    .filter((b) => b.balance >= amount)
    .sort((a, b) => (b.balance > a.balance ? 1 : -1));

  if (sorted.length === 0) {
    return null;
  }

  return sorted[0].chain;
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

async function transfer(
  destinationChain: string,
  amount: bigint,
  sourceChain: string | null,
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('Gateway Cross-Chain Transfer');
  console.log('='.repeat(60));

  // Create EOA account for signing
  const owner = privateKeyToAccount(ownerPrivateKey);
  console.log(`EOA Signer: ${owner.address}`);

  // Get AA address
  const destSetup = await createSmartAccountWithEOA(destinationChain, ownerPrivateKey);
  const aaAddress = destSetup.accountAddress;
  console.log(`Smart Account: ${aaAddress}`);

  // Check Gateway balance
  console.log('');
  console.log('Checking Gateway balance...');
  const balances = await getGatewayBalance(aaAddress);
  let totalBalance = 0n;

  for (const { chain, balance } of balances) {
    if (balance > 0n) {
      console.log(`  ${chain}: ${formatUnits(balance, USDC_DECIMALS)} USDC`);
      totalBalance += balance;
    }
  }

  if (totalBalance === 0n) {
    console.error('');
    console.error('No Gateway balance found!');
    console.error('First deposit USDC using: npx ts-node scripts/gateway-deposit.ts <chain> <amount>');
    process.exit(1);
  }

  console.log(`  Total: ${formatUnits(totalBalance, USDC_DECIMALS)} USDC`);

  // Find or validate source chain
  if (!sourceChain) {
    console.log('');
    console.log('Finding best source chain...');
    sourceChain = await findSourceChain(aaAddress, amount);

    if (!sourceChain) {
      console.error('');
      console.error(`No chain has sufficient balance for ${formatUnits(amount, USDC_DECIMALS)} USDC`);
      console.error('Deposit more USDC using: npx ts-node scripts/gateway-deposit.ts <chain> <amount>');
      process.exit(1);
    }
  }

  // Validate source chain has enough balance
  const sourceBalance = balances.find((b) => b.chain === sourceChain);
  if (!sourceBalance || sourceBalance.balance < amount) {
    console.error('');
    console.error(`Insufficient balance on ${sourceChain}`);
    console.error(`Available: ${formatUnits(sourceBalance?.balance || 0n, USDC_DECIMALS)} USDC`);
    console.error(`Required: ${formatUnits(amount, USDC_DECIMALS)} USDC`);
    process.exit(1);
  }

  console.log(`Source chain: ${sourceChain}`);

  // Step 1: Create burn intent and get attestation
  console.log('');
  console.log('Step 1: Creating burn intent and requesting attestation...');

  const { transfer: transferResult } = await initiateTransfer(
    sourceChain,
    destinationChain,
    amount,
    aaAddress,   // depositor (where funds are in Gateway)
    aaAddress,   // recipient (where to send on destination)
    owner        // EOA signer
  );

  console.log('Attestation received!');

  // Step 2: Mint on destination chain
  console.log('');
  console.log(`Step 2: Minting on ${destinationChain}...`);

  const mintCalls = buildGatewayMintCalls(
    transferResult.attestation,
    transferResult.signature
  );

  const mintResult = await sendUserOperation(destSetup, mintCalls);

  console.log('');
  console.log('='.repeat(60));
  console.log('Transfer Complete!');
  console.log('='.repeat(60));
  console.log(`Amount: ${formatUnits(amount, USDC_DECIMALS)} USDC`);
  console.log(`From: ${sourceChain} (Gateway)`);
  console.log(`To: ${destinationChain} (AA wallet)`);
  console.log(`Mint TX: ${mintResult.txHash}`);

  const destExplorer = ALL_CHAINS[destinationChain]?.explorer || '';
  if (destExplorer) {
    console.log(`Explorer: ${destExplorer}/tx/${mintResult.txHash}`);
  }
}

// =============================================================================
// CLI
// =============================================================================

function printUsage(): void {
  console.log('');
  console.log('Gateway Transfer Script - Cross-chain USDC via Circle Gateway');
  console.log('');
  console.log('Usage:');
  console.log('  npx ts-node scripts/gateway-transfer.ts <dest-chain> <amount> [source-chain]');
  console.log('');
  console.log('Arguments:');
  console.log('  dest-chain    - Destination chain for USDC');
  console.log('  amount        - Amount of USDC to transfer');
  console.log('  source-chain  - (Optional) Source chain, auto-detected if not specified');
  console.log('');
  console.log(`Supported chains: ${GATEWAY_CHAINS.join(', ')}`);
  console.log('');
  console.log('Environment variables:');
  console.log('  CIRCLE_CLIENT_KEY  - Circle Modular Wallets client key');
  console.log('  OWNER_PRIVATE_KEY  - Private key for AA owner (EOA signer)');
  console.log('');
  console.log('Prerequisites:');
  console.log('  1. Deposit USDC to Gateway: npx ts-node scripts/gateway-deposit.ts <chain> <amount>');
  console.log('  2. AA must have native gas on destination chain for minting');
  console.log('');
  console.log('Examples:');
  console.log('  npx ts-node scripts/gateway-transfer.ts arc-testnet 1');
  console.log('  npx ts-node scripts/gateway-transfer.ts arc-testnet 1 base-sepolia');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  if (args.length < 2) {
    console.error('Error: Missing required arguments');
    printUsage();
    process.exit(1);
  }

  const [destChain, amountStr, sourceChain] = args;

  // Validate destination chain
  if (!GATEWAY_CHAINS.includes(destChain)) {
    console.error(`Error: Unsupported destination chain "${destChain}"`);
    console.error(`Supported chains: ${GATEWAY_CHAINS.join(', ')}`);
    process.exit(1);
  }

  // Validate source chain if provided
  if (sourceChain && !GATEWAY_CHAINS.includes(sourceChain)) {
    console.error(`Error: Unsupported source chain "${sourceChain}"`);
    console.error(`Supported chains: ${GATEWAY_CHAINS.join(', ')}`);
    process.exit(1);
  }

  // Parse amount
  const amount = parseUnits(amountStr, USDC_DECIMALS);

  const ownerPrivateKey = getEnvOrThrow('OWNER_PRIVATE_KEY') as Hex;

  await transfer(destChain, amount, sourceChain || null, ownerPrivateKey);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
