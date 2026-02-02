#!/usr/bin/env ts-node
/**
 * Gateway to Arc - Complete flow for depositing USDC to Arc via Gateway
 *
 * This script handles the full cross-chain transfer:
 * 1. Deposit USDC from EOA to Gateway on source chain
 * 2. Wait for finality (~15 min for Base)
 * 3. Sign burn intent and get attestation
 * 4. Mint USDC to AA on Arc
 *
 * IMPORTANT:
 * - Depositor must be EOA (not AA) - EIP-712 signing required
 * - Recipient is AA on Arc
 * - AA needs native gas (ARC) on Arc for minting
 *
 * Usage:
 *   npx ts-node scripts/gateway-to-arc.ts <amount> [source-chain]
 *   npx ts-node scripts/gateway-to-arc.ts status
 *   npx ts-node scripts/gateway-to-arc.ts mint  # if attestation ready
 *
 * Examples:
 *   npx ts-node scripts/gateway-to-arc.ts 1 base-sepolia
 *   npx ts-node scripts/gateway-to-arc.ts status
 */

import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  formatEther,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  createSmartAccountWithEOA,
  sendUserOperation,
  CHAIN_DEFINITIONS,
} from '../src/lib/aa/circle-smart-account';
import { ALL_CHAINS } from '../src/config/chains';
import {
  buildGatewayMintCalls,
  initiateTransfer,
  getGatewayBalance,
  GATEWAY_WALLET,
  GATEWAY_DOMAINS,
} from '../src/lib/gateway';

// =============================================================================
// CONFIGURATION
// =============================================================================

const USDC_DECIMALS = 6;
const DESTINATION_CHAIN = 'arc-testnet';
const DEFAULT_SOURCE_CHAIN = 'base-sepolia';

// Finality times (approximate)
const FINALITY_TIMES: Record<string, string> = {
  'base-sepolia': '~13-19 minutes',
  'ethereum-sepolia': '~13-19 minutes',
  'sonic-testnet': '~8 seconds',
  'arc-testnet': '~0.5 seconds',
};

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
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

// =============================================================================
// HELPERS
// =============================================================================

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
}

async function getUsdcBalance(chainKey: string, address: Hex): Promise<bigint> {
  const chainConfig = ALL_CHAINS[chainKey];
  const chainDef = CHAIN_DEFINITIONS[chainKey];
  if (!chainConfig || !chainDef) throw new Error(`Unknown chain: ${chainKey}`);

  const client = createPublicClient({
    chain: chainDef,
    transport: http(chainConfig.rpc),
  });

  return client.readContract({
    address: chainConfig.usdc as Hex,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  }) as Promise<bigint>;
}

async function getNativeBalance(chainKey: string, address: Hex): Promise<bigint> {
  const chainDef = CHAIN_DEFINITIONS[chainKey];
  if (!chainDef) throw new Error(`Unknown chain: ${chainKey}`);

  const client = createPublicClient({
    chain: chainDef,
    transport: http(ALL_CHAINS[chainKey]?.rpc || chainDef.rpcUrls.default.http[0]),
  });

  return client.getBalance({ address });
}

// =============================================================================
// COMMANDS
// =============================================================================

async function showStatus(ownerPrivateKey: Hex): Promise<void> {
  const owner = privateKeyToAccount(ownerPrivateKey);
  const destSetup = await createSmartAccountWithEOA(DESTINATION_CHAIN, ownerPrivateKey);
  const aaAddress = destSetup.accountAddress;

  console.log('');
  console.log('='.repeat(60));
  console.log('Gateway to Arc - Status');
  console.log('='.repeat(60));
  console.log('');
  console.log('Addresses:');
  console.log(`  EOA (depositor/signer): ${owner.address}`);
  console.log(`  AA (recipient on Arc):  ${aaAddress}`);

  // Gateway balance
  console.log('');
  console.log('Gateway Unified Balance (EOA):');
  const balances = await getGatewayBalance(owner.address);
  let totalGateway = 0n;
  for (const { chain, balance } of balances) {
    if (balance > 0n) {
      console.log(`  ${chain}: ${formatUnits(balance, USDC_DECIMALS)} USDC`);
      totalGateway += balance;
    }
  }
  if (totalGateway === 0n) {
    console.log('  (no balance)');
  } else {
    console.log(`  Total: ${formatUnits(totalGateway, USDC_DECIMALS)} USDC`);
  }

  // Arc balances
  console.log('');
  console.log('Arc Testnet:');
  const arcUsdc = await getUsdcBalance(DESTINATION_CHAIN, aaAddress);
  const arcNative = await getNativeBalance(DESTINATION_CHAIN, aaAddress);
  console.log(`  AA USDC: ${formatUnits(arcUsdc, USDC_DECIMALS)} USDC`);
  console.log(`  AA Gas:  ${formatEther(arcNative)} ARC`);

  if (arcNative === 0n) {
    console.log('');
    console.log('⚠️  AA needs ARC for gas to mint! Fund it first.');
  }

  // Source chain balances
  console.log('');
  console.log('Source Chains (EOA USDC):');
  for (const chainKey of Object.keys(GATEWAY_DOMAINS)) {
    if (chainKey === DESTINATION_CHAIN) continue;
    try {
      const balance = await getUsdcBalance(chainKey, owner.address);
      if (balance > 0n) {
        console.log(`  ${chainKey}: ${formatUnits(balance, USDC_DECIMALS)} USDC`);
      }
    } catch {
      // Skip errors
    }
  }
}

async function depositAndTransfer(
  amount: bigint,
  sourceChain: string,
  ownerPrivateKey: Hex
): Promise<void> {
  const owner = privateKeyToAccount(ownerPrivateKey);
  const destSetup = await createSmartAccountWithEOA(DESTINATION_CHAIN, ownerPrivateKey);
  const aaAddress = destSetup.accountAddress;

  console.log('');
  console.log('='.repeat(60));
  console.log('Gateway to Arc - Cross-Chain Transfer');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Amount: ${formatUnits(amount, USDC_DECIMALS)} USDC`);
  console.log(`From: ${sourceChain} (EOA: ${owner.address})`);
  console.log(`To: ${DESTINATION_CHAIN} (AA: ${aaAddress})`);
  console.log(`Finality time: ${FINALITY_TIMES[sourceChain] || 'unknown'}`);

  // Check AA has gas on Arc
  const arcNative = await getNativeBalance(DESTINATION_CHAIN, aaAddress);
  if (arcNative === 0n) {
    console.log('');
    console.log('❌ AA has no ARC for gas! Fund it first:');
    console.log(`   Send ARC to ${aaAddress}`);
    process.exit(1);
  }
  console.log(`AA gas: ${formatEther(arcNative)} ARC ✓`);

  // Check EOA has enough USDC
  const eoaUsdc = await getUsdcBalance(sourceChain, owner.address);
  console.log(`EOA USDC: ${formatUnits(eoaUsdc, USDC_DECIMALS)} USDC`);
  if (eoaUsdc < amount) {
    console.log('');
    console.log('❌ Insufficient USDC balance on EOA!');
    process.exit(1);
  }

  // Step 1: Deposit to Gateway
  console.log('');
  console.log('─'.repeat(60));
  console.log('Step 1: Deposit to Gateway');
  console.log('─'.repeat(60));

  const chainConfig = ALL_CHAINS[sourceChain];
  const chainDef = CHAIN_DEFINITIONS[sourceChain];

  const publicClient = createPublicClient({
    chain: chainDef,
    transport: http(chainConfig.rpc),
  });

  const walletClient = createWalletClient({
    account: owner,
    chain: chainDef,
    transport: http(chainConfig.rpc),
  });

  // Approve
  console.log('Approving USDC...');
  const approveTx = await walletClient.writeContract({
    address: chainConfig.usdc as Hex,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [GATEWAY_WALLET, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`Approved: ${approveTx}`);

  // Deposit
  console.log('Depositing to Gateway...');
  const depositTx = await walletClient.writeContract({
    address: GATEWAY_WALLET,
    abi: GATEWAY_WALLET_ABI,
    functionName: 'deposit',
    args: [chainConfig.usdc as Hex, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  console.log(`Deposited: ${depositTx}`);
  console.log(`Explorer: ${chainConfig.explorer}/tx/${depositTx}`);

  // Step 2: Wait for finality
  console.log('');
  console.log('─'.repeat(60));
  console.log('Step 2: Wait for Finality');
  console.log('─'.repeat(60));
  console.log(`Waiting for Gateway to index deposit (${FINALITY_TIMES[sourceChain]})...`);

  const startTime = Date.now();
  const maxWait = 25 * 60 * 1000; // 25 minutes
  const pollInterval = 30_000; // 30 seconds

  while (Date.now() - startTime < maxWait) {
    const balances = await getGatewayBalance(owner.address);
    const sourceBalance = balances.find(b => b.chain === sourceChain)?.balance || 0n;

    if (sourceBalance >= amount) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`✓ Balance detected after ${elapsed}s`);
      break;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  Waiting... ${elapsed}s elapsed`);
    await new Promise(r => setTimeout(r, pollInterval));
  }

  console.log('');

  // Step 3: Transfer via Gateway
  console.log('');
  console.log('─'.repeat(60));
  console.log('Step 3: Transfer via Gateway API');
  console.log('─'.repeat(60));

  // Check actual available balance (might be less due to fees)
  const balances = await getGatewayBalance(owner.address);
  const availableBalance = balances.find(b => b.chain === sourceChain)?.balance || 0n;

  // Use slightly less to account for fees
  const transferAmount = availableBalance > 100000n
    ? availableBalance - 50000n // Leave 0.05 USDC for fees
    : availableBalance;

  if (transferAmount <= 0n) {
    console.log('❌ No balance available for transfer');
    process.exit(1);
  }

  console.log(`Transferring: ${formatUnits(transferAmount, USDC_DECIMALS)} USDC`);

  const { transfer: transferResult } = await initiateTransfer(
    sourceChain,
    DESTINATION_CHAIN,
    transferAmount,
    owner.address,
    aaAddress,
    owner
  );

  console.log('✓ Attestation received');

  // Step 4: Mint on Arc
  console.log('');
  console.log('─'.repeat(60));
  console.log('Step 4: Mint on Arc');
  console.log('─'.repeat(60));

  const mintCalls = buildGatewayMintCalls(
    transferResult.attestation,
    transferResult.signature
  );

  const mintResult = await sendUserOperation(destSetup, mintCalls);

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ SUCCESS!');
  console.log('='.repeat(60));
  console.log(`Transferred: ${formatUnits(transferAmount, USDC_DECIMALS)} USDC`);
  console.log(`From: ${sourceChain}`);
  console.log(`To: ${DESTINATION_CHAIN}`);
  console.log(`Mint TX: ${mintResult.txHash}`);
  console.log(`Explorer: ${ALL_CHAINS[DESTINATION_CHAIN].explorer}/tx/${mintResult.txHash}`);

  // Final balance
  const finalUsdc = await getUsdcBalance(DESTINATION_CHAIN, aaAddress);
  console.log(`AA USDC on Arc: ${formatUnits(finalUsdc, USDC_DECIMALS)} USDC`);
}

// =============================================================================
// CLI
// =============================================================================

function printUsage(): void {
  console.log('');
  console.log('Gateway to Arc - Cross-chain USDC transfer');
  console.log('');
  console.log('Usage:');
  console.log('  npx ts-node scripts/gateway-to-arc.ts <amount> [source-chain]');
  console.log('  npx ts-node scripts/gateway-to-arc.ts status');
  console.log('');
  console.log('Arguments:');
  console.log('  amount       - USDC amount to transfer');
  console.log('  source-chain - Source chain (default: base-sepolia)');
  console.log('');
  console.log('Commands:');
  console.log('  status  - Show current balances and status');
  console.log('');
  console.log(`Supported sources: ${Object.keys(GATEWAY_DOMAINS).filter(c => c !== DESTINATION_CHAIN).join(', ')}`);
  console.log('');
  console.log('Environment:');
  console.log('  OWNER_PRIVATE_KEY - EOA private key (depositor/signer)');
  console.log('');
  console.log('Notes:');
  console.log('  - EOA deposits to Gateway, AA receives on Arc');
  console.log('  - Base Sepolia needs ~15 min for finality');
  console.log('  - AA needs ARC tokens for gas on Arc');
  console.log('');
  console.log('Examples:');
  console.log('  npx ts-node scripts/gateway-to-arc.ts status');
  console.log('  npx ts-node scripts/gateway-to-arc.ts 1 base-sepolia');
  console.log('  npx ts-node scripts/gateway-to-arc.ts 0.5');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const ownerPrivateKey = getEnvOrThrow('OWNER_PRIVATE_KEY') as Hex;

  if (args[0] === 'status') {
    await showStatus(ownerPrivateKey);
    return;
  }

  // Parse amount and source chain
  const amountStr = args[0];
  const sourceChain = args[1] || DEFAULT_SOURCE_CHAIN;

  if (!GATEWAY_DOMAINS[sourceChain]) {
    console.error(`Unknown source chain: ${sourceChain}`);
    console.error(`Supported: ${Object.keys(GATEWAY_DOMAINS).join(', ')}`);
    process.exit(1);
  }

  if (sourceChain === DESTINATION_CHAIN) {
    console.error('Source and destination cannot be the same');
    process.exit(1);
  }

  const amount = parseUnits(amountStr, USDC_DECIMALS);

  await depositAndTransfer(amount, sourceChain, ownerPrivateKey);
}

main().catch((e) => {
  console.error('');
  console.error('❌ Error:', e.message || e);
  process.exit(1);
});
