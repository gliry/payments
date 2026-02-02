#!/usr/bin/env ts-node
/**
 * Gateway Deposit Script - Deposit USDC from AA to Circle Gateway
 *
 * This script:
 * 1. Creates Circle Smart Account on specified chain
 * 2. Sends UserOperation: USDC.approve + GatewayWallet.deposit
 *
 * After deposit, funds are in Gateway unified balance and can be
 * transferred cross-chain using gateway-transfer.ts
 *
 * Usage:
 *   npx ts-node scripts/gateway-deposit.ts <chain> <amount>
 *   npx ts-node scripts/gateway-deposit.ts all <amount>
 *   npx ts-node scripts/gateway-deposit.ts info
 *
 * Example:
 *   npx ts-node scripts/gateway-deposit.ts base-sepolia 1
 *   npx ts-node scripts/gateway-deposit.ts info
 */

import 'dotenv/config';
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  type Hex,
} from 'viem';
import {
  createSmartAccountWithEOA,
  sendUserOperation,
  CHAIN_DEFINITIONS,
} from '../src/lib/aa/circle-smart-account';
import { ALL_CHAINS } from '../src/config/chains';
import {
  buildGatewayDepositCalls,
  getGatewayBalance,
  GATEWAY_DOMAINS,
} from '../src/lib/gateway';

// =============================================================================
// CONFIGURATION
// =============================================================================

const USDC_DECIMALS = 6;

// Chains that support Gateway deposits
const GATEWAY_CHAINS = Object.keys(GATEWAY_DOMAINS);

const ERC20_ABI = [
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

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

async function showInfo(ownerPrivateKey: Hex): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('Gateway Balance Info');
  console.log('='.repeat(60));

  // Get AA address
  const setup = await createSmartAccountWithEOA('base-sepolia', ownerPrivateKey);
  const aaAddress = setup.accountAddress;

  console.log(`Smart Account: ${aaAddress}`);
  console.log('');

  // Check USDC balances in AA wallet
  console.log('USDC in AA Wallet:');
  for (const chainKey of Object.keys(ALL_CHAINS)) {
    try {
      const balance = await getUsdcBalance(chainKey, aaAddress);
      const formatted = formatUnits(balance, USDC_DECIMALS);
      console.log(`  ${chainKey}: ${formatted} USDC`);
    } catch (e) {
      console.log(`  ${chainKey}: (error)`);
    }
  }

  // Check Gateway unified balance
  console.log('');
  console.log('Gateway Unified Balance:');
  try {
    const balances = await getGatewayBalance(aaAddress);
    let total = 0n;

    for (const { chain, balance } of balances) {
      const formatted = formatUnits(balance, USDC_DECIMALS);
      if (balance > 0n) {
        console.log(`  ${chain}: ${formatted} USDC`);
        total += balance;
      }
    }

    if (total === 0n) {
      console.log('  (no deposits yet)');
    } else {
      console.log(`  ---`);
      console.log(`  Total: ${formatUnits(total, USDC_DECIMALS)} USDC`);
    }
  } catch (e) {
    console.log(`  (error fetching balances: ${e})`);
  }
}

async function depositOnChain(
  chainKey: string,
  amount: bigint,
  ownerPrivateKey: Hex
): Promise<{ aaAddress: Hex; txHash: Hex }> {
  console.log(`\n[${chainKey}] Depositing ${formatUnits(amount, USDC_DECIMALS)} USDC to Gateway...`);

  // Create AA
  const setup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
  const aaAddress = setup.accountAddress;

  // Check current AA USDC balance
  const currentBalance = await getUsdcBalance(chainKey, aaAddress);
  console.log(`[${chainKey}] AA USDC balance: ${formatUnits(currentBalance, USDC_DECIMALS)} USDC`);

  if (currentBalance < amount) {
    console.log(`[${chainKey}] Insufficient balance, need ${formatUnits(amount, USDC_DECIMALS)} USDC`);
    return { aaAddress, txHash: '0x0' as Hex };
  }

  // Build deposit calls
  const chainConfig = ALL_CHAINS[chainKey];
  const calls = buildGatewayDepositCalls(chainConfig.usdc as Hex, amount);

  console.log(`[${chainKey}] Sending UserOperation (approve + deposit)...`);

  // Send UserOperation
  const result = await sendUserOperation(setup, calls);

  console.log(`[${chainKey}] Deposit confirmed: ${result.txHash}`);

  return { aaAddress, txHash: result.txHash };
}

async function depositAll(
  amount: bigint,
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('Depositing USDC to Gateway on ALL chains');
  console.log('='.repeat(60));

  const setup = await createSmartAccountWithEOA('base-sepolia', ownerPrivateKey);
  console.log(`Smart Account: ${setup.accountAddress}`);
  console.log(`Amount per chain: ${formatUnits(amount, USDC_DECIMALS)} USDC`);

  const results: { chain: string; txHash: Hex }[] = [];

  for (const chainKey of GATEWAY_CHAINS) {
    try {
      const chainConfig = ALL_CHAINS[chainKey];
      if (!chainConfig) {
        console.log(`\n[${chainKey}] Skipping - chain config not found`);
        continue;
      }

      const { txHash } = await depositOnChain(chainKey, amount, ownerPrivateKey);

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
  console.log('Deposit Complete');
  console.log('='.repeat(60));

  if (results.length > 0) {
    console.log('Transactions:');
    for (const { chain, txHash } of results) {
      const explorer = ALL_CHAINS[chain]?.explorer || '';
      console.log(`  ${chain}: ${explorer}/tx/${txHash}`);
    }
  }

  // Show updated Gateway balance
  console.log('');
  await showInfo(ownerPrivateKey);
}

// =============================================================================
// CLI
// =============================================================================

function printUsage(): void {
  console.log('');
  console.log('Gateway Deposit Script - Deposit USDC to Circle Gateway');
  console.log('');
  console.log('Usage:');
  console.log('  npx ts-node scripts/gateway-deposit.ts <chain> <amount>');
  console.log('  npx ts-node scripts/gateway-deposit.ts all <amount>');
  console.log('  npx ts-node scripts/gateway-deposit.ts info');
  console.log('');
  console.log('Commands:');
  console.log('  <chain> <amount>  - Deposit on specific chain');
  console.log('  all <amount>      - Deposit on all Gateway-supported chains');
  console.log('  info              - Show AA and Gateway balances');
  console.log('');
  console.log(`Supported chains: ${GATEWAY_CHAINS.join(', ')}`);
  console.log('');
  console.log('Environment variables:');
  console.log('  CIRCLE_CLIENT_KEY  - Circle Modular Wallets client key');
  console.log('  OWNER_PRIVATE_KEY  - Private key for AA owner (EOA signer)');
  console.log('');
  console.log('Examples:');
  console.log('  npx ts-node scripts/gateway-deposit.ts info');
  console.log('  npx ts-node scripts/gateway-deposit.ts base-sepolia 1');
  console.log('  npx ts-node scripts/gateway-deposit.ts all 0.5');
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

  // Deposit command
  if (args.length < 2) {
    console.error('Error: Missing amount argument');
    printUsage();
    process.exit(1);
  }

  const [chainArg, amountStr] = args;
  const amount = parseUnits(amountStr, USDC_DECIMALS);

  if (chainArg === 'all') {
    await depositAll(amount, ownerPrivateKey);
  } else {
    if (!GATEWAY_CHAINS.includes(chainArg)) {
      console.error(`Error: Unsupported chain "${chainArg}"`);
      console.error(`Supported chains: ${GATEWAY_CHAINS.join(', ')}`);
      process.exit(1);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Gateway Deposit');
    console.log('='.repeat(60));

    const { aaAddress, txHash } = await depositOnChain(chainArg, amount, ownerPrivateKey);

    console.log('');
    console.log('Done!');
    console.log(`Smart Account: ${aaAddress}`);
    console.log(`Transaction: ${txHash}`);

    if (txHash !== '0x0') {
      const explorer = ALL_CHAINS[chainArg]?.explorer || '';
      console.log(`Explorer: ${explorer}/tx/${txHash}`);
    }
  }
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
