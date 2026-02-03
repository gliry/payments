#!/usr/bin/env ts-node
/**
 * Gateway MSCA Flow - Full MSCA + Gateway cross-chain transfer
 *
 * This script demonstrates the complete flow for MSCA-based cross-chain transfers:
 *
 * 1. MSCA deposits USDC to Gateway (UserOp: approve + deposit)
 * 2. MSCA adds delegate EOA to Gateway (UserOp: addDelegate) - one time per chain
 * 3. Delegate EOA signs burn intent (offchain EIP-712 signature)
 * 4. Mint on destination chain (UserOp on destination)
 *
 * Why delegate mechanism?
 * - Gateway burn intent requires EIP-712 signature
 * - EIP-1271 (smart contract signatures) is NOT supported
 * - Solution: MSCA adds a delegate EOA that can sign on its behalf
 *
 * In demo mode, the same private key is used as:
 * - MSCA owner (signs UserOps)
 * - Gateway delegate (signs burn intents)
 *
 * Usage:
 *   npx ts-node scripts/gateway-msca-flow.ts <amount> <source-chain> <dest-chain>
 *   npx ts-node scripts/gateway-msca-flow.ts deposit <chain> <amount>
 *   npx ts-node scripts/gateway-msca-flow.ts delegate <chain>
 *   npx ts-node scripts/gateway-msca-flow.ts transfer <source> <dest> <amount>
 *   npx ts-node scripts/gateway-msca-flow.ts status
 *
 * Examples:
 *   npx ts-node scripts/gateway-msca-flow.ts 1 base-sepolia arc-testnet
 *   npx ts-node scripts/gateway-msca-flow.ts deposit base-sepolia 1
 *   npx ts-node scripts/gateway-msca-flow.ts status
 */

import 'dotenv/config';
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  formatEther,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createSmartAccountWithEOA,
  sendUserOperation,
  CHAIN_DEFINITIONS,
} from '../src/lib/aa/circle-smart-account';
import { ALL_CHAINS, AA_GATEWAY_CHAINS } from '../src/config/chains';
import {
  buildMscaDepositCalls,
  buildAddDelegateCalls,
  buildGatewayMintCalls,
  getGatewayBalance,
  initiateMscaTransfer,
  GATEWAY_DOMAINS,
} from '../src/lib/gateway';

// =============================================================================
// CONFIGURATION
// =============================================================================

const USDC_DECIMALS = 6;

// Chains that support both AA and Gateway (full flow)
const FULL_FLOW_CHAINS = Object.keys(AA_GATEWAY_CHAINS);

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

async function getNativeBalance(chainKey: string, address: Hex): Promise<bigint> {
  const chainConfig = ALL_CHAINS[chainKey];
  const chainDef = CHAIN_DEFINITIONS[chainKey];

  if (!chainConfig || !chainDef) {
    throw new Error(`Unknown chain: ${chainKey}`);
  }

  const publicClient = createPublicClient({
    chain: chainDef,
    transport: http(chainConfig.rpc),
  });

  return publicClient.getBalance({ address });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// STATUS COMMAND
// =============================================================================

async function showStatus(ownerPrivateKey: Hex): Promise<void> {
  const owner = privateKeyToAccount(ownerPrivateKey);

  // Get MSCA address
  const setup = await createSmartAccountWithEOA('arc-testnet', ownerPrivateKey);
  const mscaAddress = setup.accountAddress;

  console.log('');
  console.log('='.repeat(70));
  console.log('  MSCA Gateway Status');
  console.log('='.repeat(70));
  console.log('');
  console.log(`  EOA Owner/Delegate: ${owner.address}`);
  console.log(`  MSCA Address:       ${mscaAddress}`);
  console.log('');

  // Show Gateway balance for MSCA
  console.log('-'.repeat(70));
  console.log('  Gateway Unified Balance (MSCA deposits)');
  console.log('-'.repeat(70));

  try {
    const balances = await getGatewayBalance(mscaAddress);
    let totalGateway = 0n;

    for (const { chain, balance } of balances) {
      if (balance > 0n) {
        console.log(`  ${chain.padEnd(20)} ${formatUnits(balance, USDC_DECIMALS)} USDC`);
        totalGateway += balance;
      }
    }

    if (totalGateway === 0n) {
      console.log('  (no Gateway balance)');
    } else {
      console.log(`  ${'─'.repeat(30)}`);
      console.log(`  ${'Total'.padEnd(20)} ${formatUnits(totalGateway, USDC_DECIMALS)} USDC`);
    }
  } catch (e) {
    console.log(`  (error: ${e})`);
  }

  // Show on-chain balances for supported chains
  console.log('');
  console.log('-'.repeat(70));
  console.log('  On-Chain MSCA Balances (AA + Gateway chains)');
  console.log('-'.repeat(70));
  console.log('');
  console.log('  Chain'.padEnd(22) + 'USDC'.padStart(12) + 'Native'.padStart(12));
  console.log('  ' + '─'.repeat(44));

  for (const chainKey of FULL_FLOW_CHAINS) {
    try {
      const usdcBalance = await getUsdcBalance(chainKey, mscaAddress);
      const nativeBalance = await getNativeBalance(chainKey, mscaAddress);

      const usdcStr = usdcBalance > 0n
        ? formatUnits(usdcBalance, USDC_DECIMALS)
        : '-';
      const nativeStr = nativeBalance > 0n
        ? (parseFloat(formatEther(nativeBalance)) < 0.001 ? '<0.001' : parseFloat(formatEther(nativeBalance)).toFixed(3))
        : '-';

      console.log(`  ${chainKey.padEnd(20)}${usdcStr.padStart(12)}${nativeStr.padStart(12)}`);
    } catch (e) {
      console.log(`  ${chainKey.padEnd(20)}(error)`);
    }
  }

  console.log('');
  console.log('='.repeat(70));
}

// =============================================================================
// DEPOSIT COMMAND
// =============================================================================

interface DepositResult {
  chain: string;
  txHash: Hex;
  success: boolean;
  error?: string;
}

async function depositOnChain(
  chainKey: string,
  amount: bigint,
  ownerPrivateKey: Hex
): Promise<DepositResult> {
  try {
    const setup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
    const mscaAddress = setup.accountAddress;

    // Check MSCA USDC balance
    const usdcBalance = await getUsdcBalance(chainKey, mscaAddress);
    console.log(`[${chainKey}] MSCA USDC: ${formatUnits(usdcBalance, USDC_DECIMALS)}`);

    if (usdcBalance < amount) {
      return {
        chain: chainKey,
        txHash: '0x0' as Hex,
        success: false,
        error: `Insufficient balance: ${formatUnits(usdcBalance, USDC_DECIMALS)} < ${formatUnits(amount, USDC_DECIMALS)}`,
      };
    }

    // Build deposit calls
    const chainConfig = ALL_CHAINS[chainKey];
    const calls = buildMscaDepositCalls(chainConfig.usdc as Hex, amount);

    console.log(`[${chainKey}] Sending deposit UserOp...`);
    const result = await sendUserOperation(setup, calls);

    console.log(`[${chainKey}] Deposit TX: ${result.txHash}`);
    return {
      chain: chainKey,
      txHash: result.txHash,
      success: true,
    };
  } catch (e: any) {
    return {
      chain: chainKey,
      txHash: '0x0' as Hex,
      success: false,
      error: e.message?.slice(0, 100),
    };
  }
}

async function deposit(
  chainKey: string,
  amount: bigint,
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('  MSCA Gateway Deposit');
  console.log('='.repeat(70));

  // Create MSCA on the chain
  const setup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
  const mscaAddress = setup.accountAddress;

  console.log(`  Chain:  ${chainKey}`);
  console.log(`  MSCA:   ${mscaAddress}`);
  console.log(`  Amount: ${formatUnits(amount, USDC_DECIMALS)} USDC`);
  console.log('');

  // Check MSCA USDC balance
  const usdcBalance = await getUsdcBalance(chainKey, mscaAddress);
  console.log(`[${chainKey}] MSCA USDC balance: ${formatUnits(usdcBalance, USDC_DECIMALS)} USDC`);

  if (usdcBalance < amount) {
    console.error(`[${chainKey}] Insufficient balance!`);
    console.error(`  Have: ${formatUnits(usdcBalance, USDC_DECIMALS)} USDC`);
    console.error(`  Need: ${formatUnits(amount, USDC_DECIMALS)} USDC`);
    process.exit(1);
  }

  // Build deposit calls
  const chainConfig = ALL_CHAINS[chainKey];
  const calls = buildMscaDepositCalls(chainConfig.usdc as Hex, amount);

  console.log(`[${chainKey}] Sending deposit UserOp (approve + deposit)...`);

  const result = await sendUserOperation(setup, calls);

  console.log('');
  console.log('Deposit successful!');
  console.log(`  TX: ${result.txHash}`);
  console.log(`  Explorer: ${chainConfig.explorer}/tx/${result.txHash}`);
}

/**
 * Parallel deposit on multiple chains
 */
async function depositParallel(
  chains: string[],
  amount: bigint,
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('  MSCA Gateway Parallel Deposit');
  console.log('='.repeat(70));

  const setup = await createSmartAccountWithEOA('arc-testnet', ownerPrivateKey);
  const mscaAddress = setup.accountAddress;

  console.log(`  MSCA:   ${mscaAddress}`);
  console.log(`  Amount: ${formatUnits(amount, USDC_DECIMALS)} USDC per chain`);
  console.log(`  Chains: ${chains.join(', ')}`);
  console.log('');

  // Run deposits in parallel
  console.log('Starting parallel deposits...');
  console.log('');

  const results = await Promise.all(
    chains.map((chain) => depositOnChain(chain, amount, ownerPrivateKey))
  );

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('  Deposit Results');
  console.log('='.repeat(70));

  for (const r of results) {
    if (r.success) {
      const explorer = ALL_CHAINS[r.chain]?.explorer || '';
      console.log(`  ${r.chain.padEnd(18)} OK    ${explorer}/tx/${r.txHash}`);
    } else {
      console.log(`  ${r.chain.padEnd(18)} FAIL  ${r.error}`);
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log('');
  console.log(`  ${successCount}/${results.length} deposits successful`);
}

// =============================================================================
// ADD DELEGATE COMMAND
// =============================================================================

async function addDelegate(
  chainKey: string,
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('  MSCA Add Delegate');
  console.log('='.repeat(70));

  const owner = privateKeyToAccount(ownerPrivateKey);

  // Create MSCA on the chain
  const setup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
  const mscaAddress = setup.accountAddress;

  console.log(`  Chain:    ${chainKey}`);
  console.log(`  MSCA:     ${mscaAddress}`);
  console.log(`  Delegate: ${owner.address}`);
  console.log('');

  // Build add delegate calls
  const chainConfig = ALL_CHAINS[chainKey];
  const calls = buildAddDelegateCalls(chainConfig.usdc as Hex, owner.address);

  console.log(`[${chainKey}] Sending addDelegate UserOp...`);

  const result = await sendUserOperation(setup, calls);

  console.log('');
  console.log('Delegate added successfully!');
  console.log(`  TX: ${result.txHash}`);
  console.log(`  Explorer: ${chainConfig.explorer}/tx/${result.txHash}`);
  console.log('');
  console.log('Note: This only needs to be done once per chain.');
}

/**
 * Parallel add delegate on multiple chains
 */
async function addDelegateParallel(
  chains: string[],
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('  MSCA Add Delegate (Parallel)');
  console.log('='.repeat(70));

  const owner = privateKeyToAccount(ownerPrivateKey);
  const setup = await createSmartAccountWithEOA('arc-testnet', ownerPrivateKey);

  console.log(`  MSCA:     ${setup.accountAddress}`);
  console.log(`  Delegate: ${owner.address}`);
  console.log(`  Chains:   ${chains.join(', ')}`);
  console.log('');

  const results = await Promise.all(
    chains.map(async (chainKey) => {
      try {
        const chainSetup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
        const chainConfig = ALL_CHAINS[chainKey];
        const calls = buildAddDelegateCalls(chainConfig.usdc as Hex, owner.address);

        console.log(`[${chainKey}] Sending addDelegate UserOp...`);
        const result = await sendUserOperation(chainSetup, calls);
        console.log(`[${chainKey}] Delegate TX: ${result.txHash}`);

        return { chain: chainKey, txHash: result.txHash, success: true };
      } catch (e: any) {
        console.log(`[${chainKey}] Error: ${e.message?.slice(0, 50)}`);
        return { chain: chainKey, txHash: '0x0' as Hex, success: false, error: e.message };
      }
    })
  );

  console.log('');
  console.log('='.repeat(70));
  console.log('  Delegate Results');
  console.log('='.repeat(70));

  for (const r of results) {
    if (r.success) {
      const explorer = ALL_CHAINS[r.chain]?.explorer || '';
      console.log(`  ${r.chain.padEnd(18)} OK    ${explorer}/tx/${r.txHash}`);
    } else {
      console.log(`  ${r.chain.padEnd(18)} FAIL  ${r.error?.slice(0, 50)}`);
    }
  }
}

// =============================================================================
// TRANSFER COMMAND
// =============================================================================

async function transfer(
  sourceChain: string,
  destChain: string,
  amount: bigint,
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('  MSCA Gateway Transfer');
  console.log('='.repeat(70));

  const owner = privateKeyToAccount(ownerPrivateKey);

  // Get MSCA address
  const sourceSetup = await createSmartAccountWithEOA(sourceChain, ownerPrivateKey);
  const mscaAddress = sourceSetup.accountAddress;

  console.log(`  Source:      ${sourceChain}`);
  console.log(`  Destination: ${destChain}`);
  console.log(`  Amount:      ${formatUnits(amount, USDC_DECIMALS)} USDC`);
  console.log(`  MSCA:        ${mscaAddress}`);
  console.log(`  Delegate:    ${owner.address}`);
  console.log('');

  // Check Gateway balance
  const balances = await getGatewayBalance(mscaAddress);
  const sourceBalance = balances.find((b) => b.chain === sourceChain);

  if (!sourceBalance || sourceBalance.balance < amount) {
    console.error(`Insufficient Gateway balance on ${sourceChain}!`);
    console.error(`  Have: ${formatUnits(sourceBalance?.balance || 0n, USDC_DECIMALS)} USDC`);
    console.error(`  Need: ${formatUnits(amount, USDC_DECIMALS)} USDC`);
    console.error('');
    console.error('First deposit using: npx ts-node scripts/gateway-msca-flow.ts deposit <chain> <amount>');
    process.exit(1);
  }

  console.log(`[gateway] Source Gateway balance: ${formatUnits(sourceBalance.balance, USDC_DECIMALS)} USDC`);

  // Step 1: Sign burn intent with delegate and get attestation
  console.log('');
  console.log('Step 1: Creating burn intent and getting attestation...');

  const { transfer: transferResult } = await initiateMscaTransfer(
    sourceChain,
    destChain,
    amount,
    mscaAddress,      // depositor = MSCA
    mscaAddress,      // recipient = same MSCA on dest chain
    owner             // delegate signs the intent
  );

  console.log('Attestation received!');

  // Step 2: Mint on destination chain
  console.log('');
  console.log(`Step 2: Minting on ${destChain}...`);

  const destSetup = await createSmartAccountWithEOA(destChain, ownerPrivateKey);

  // Check destination has gas
  const destNative = await getNativeBalance(destChain, mscaAddress);
  if (destNative === 0n) {
    console.warn(`Warning: MSCA has no native gas on ${destChain}!`);
    console.warn('The mint transaction may fail.');
  }

  const mintCalls = buildGatewayMintCalls(
    transferResult.attestation,
    transferResult.signature
  );

  const mintResult = await sendUserOperation(destSetup, mintCalls);

  console.log('');
  console.log('='.repeat(70));
  console.log('  Transfer Complete!');
  console.log('='.repeat(70));
  console.log(`  Amount: ${formatUnits(amount, USDC_DECIMALS)} USDC`);
  console.log(`  From:   ${sourceChain} (Gateway)`);
  console.log(`  To:     ${destChain} (MSCA wallet)`);
  console.log(`  TX:     ${mintResult.txHash}`);
  console.log(`  Explorer: ${ALL_CHAINS[destChain]?.explorer}/tx/${mintResult.txHash}`);
}

// =============================================================================
// COLLECT COMMAND - Transfer from multiple sources to one destination
// =============================================================================

async function collect(
  sourceChains: string[],
  destChain: string,
  amountPerChain: bigint,
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('  MSCA Gateway Collect (Multi-Source → Single Dest)');
  console.log('='.repeat(70));

  const owner = privateKeyToAccount(ownerPrivateKey);
  const setup = await createSmartAccountWithEOA(destChain, ownerPrivateKey);
  const mscaAddress = setup.accountAddress;

  console.log(`  Sources:     ${sourceChains.join(', ')}`);
  console.log(`  Destination: ${destChain}`);
  console.log(`  Amount:      ${formatUnits(amountPerChain, USDC_DECIMALS)} USDC per source`);
  console.log(`  Total:       ${formatUnits(amountPerChain * BigInt(sourceChains.length), USDC_DECIMALS)} USDC`);
  console.log(`  MSCA:        ${mscaAddress}`);
  console.log(`  Delegate:    ${owner.address}`);
  console.log('');

  // Check Gateway balances
  const balances = await getGatewayBalance(mscaAddress);
  console.log('Gateway balances:');
  for (const chain of sourceChains) {
    const bal = balances.find((b) => b.chain === chain);
    console.log(`  ${chain}: ${formatUnits(bal?.balance || 0n, USDC_DECIMALS)} USDC`);
    if (!bal || bal.balance < amountPerChain) {
      console.error(`  ⚠ Insufficient balance on ${chain}!`);
    }
  }
  console.log('');

  // Get attestations for all sources in parallel
  console.log('Step 1: Getting attestations from all sources...');

  const attestations = await Promise.all(
    sourceChains.map(async (sourceChain) => {
      try {
        console.log(`[${sourceChain}] Creating burn intent...`);
        const { transfer: transferResult } = await initiateMscaTransfer(
          sourceChain,
          destChain,
          amountPerChain,
          mscaAddress,
          mscaAddress,
          owner
        );
        console.log(`[${sourceChain}] Attestation received!`);
        return {
          chain: sourceChain,
          attestation: transferResult.attestation,
          signature: transferResult.signature,
          success: true,
        };
      } catch (e: any) {
        console.error(`[${sourceChain}] Error: ${e.message?.slice(0, 80)}`);
        return {
          chain: sourceChain,
          attestation: '0x' as Hex,
          signature: '0x' as Hex,
          success: false,
          error: e.message,
        };
      }
    })
  );

  const successfulAttestations = attestations.filter((a) => a.success);
  console.log('');
  console.log(`Got ${successfulAttestations.length}/${sourceChains.length} attestations`);

  if (successfulAttestations.length === 0) {
    console.error('No attestations received, aborting');
    process.exit(1);
  }

  // Mint all on destination
  console.log('');
  console.log(`Step 2: Minting ${successfulAttestations.length} transfers on ${destChain}...`);

  const destSetup = await createSmartAccountWithEOA(destChain, ownerPrivateKey);

  for (const att of successfulAttestations) {
    try {
      console.log(`[${destChain}] Minting from ${att.chain}...`);
      const mintCalls = buildGatewayMintCalls(att.attestation, att.signature);
      const mintResult = await sendUserOperation(destSetup, mintCalls);
      console.log(`[${destChain}] Mint TX: ${mintResult.txHash}`);
    } catch (e: any) {
      console.error(`[${destChain}] Mint from ${att.chain} failed: ${e.message?.slice(0, 80)}`);
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('  Collect Complete!');
  console.log('='.repeat(70));
  console.log(`  Collected: ${formatUnits(amountPerChain * BigInt(successfulAttestations.length), USDC_DECIMALS)} USDC`);
  console.log(`  From:      ${successfulAttestations.map((a) => a.chain).join(', ')}`);
  console.log(`  To:        ${destChain}`);
}

// =============================================================================
// FULL FLOW COMMAND
// =============================================================================

async function fullFlow(
  amount: bigint,
  sourceChain: string,
  destChain: string,
  ownerPrivateKey: Hex
): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('  MSCA Gateway Full Flow');
  console.log('='.repeat(70));

  const owner = privateKeyToAccount(ownerPrivateKey);

  // Get MSCA address
  const sourceSetup = await createSmartAccountWithEOA(sourceChain, ownerPrivateKey);
  const mscaAddress = sourceSetup.accountAddress;

  console.log(`  Source:      ${sourceChain}`);
  console.log(`  Destination: ${destChain}`);
  console.log(`  Amount:      ${formatUnits(amount, USDC_DECIMALS)} USDC`);
  console.log(`  MSCA:        ${mscaAddress}`);
  console.log(`  Delegate:    ${owner.address}`);
  console.log('');

  // Step 1: Check MSCA has USDC
  const usdcBalance = await getUsdcBalance(sourceChain, mscaAddress);
  console.log(`[${sourceChain}] MSCA USDC balance: ${formatUnits(usdcBalance, USDC_DECIMALS)} USDC`);

  if (usdcBalance < amount) {
    console.error('');
    console.error(`Insufficient USDC balance on MSCA!`);
    console.error(`Transfer USDC to MSCA: ${mscaAddress}`);
    process.exit(1);
  }

  // Step 2: Deposit to Gateway
  console.log('');
  console.log('Step 1: Depositing USDC to Gateway...');

  const chainConfig = ALL_CHAINS[sourceChain];
  const depositCalls = buildMscaDepositCalls(chainConfig.usdc as Hex, amount);
  const depositResult = await sendUserOperation(sourceSetup, depositCalls);
  console.log(`Deposit TX: ${depositResult.txHash}`);

  // Step 3: Add delegate (might already exist, but safe to call again)
  console.log('');
  console.log('Step 2: Adding delegate to Gateway...');

  const delegateCalls = buildAddDelegateCalls(chainConfig.usdc as Hex, owner.address);
  try {
    const delegateResult = await sendUserOperation(sourceSetup, delegateCalls);
    console.log(`Delegate TX: ${delegateResult.txHash}`);
  } catch (e: any) {
    // Delegate might already exist
    console.log(`Delegate may already exist: ${e.message?.slice(0, 100)}`);
  }

  // Step 4: Wait for finality
  const finalityTimes: Record<string, number> = {
    'base-sepolia': 60, // ~1 min for demo (actual is 13-19 min)
    'avalanche-fuji': 10,
    'arc-testnet': 2,
  };

  const waitTime = finalityTimes[sourceChain] || 30;
  console.log('');
  console.log(`Step 3: Waiting for finality (${waitTime}s)...`);

  for (let i = waitTime; i > 0; i -= 5) {
    process.stdout.write(`\r  ${i}s remaining...  `);
    await sleep(5000);
  }
  console.log('\r  Done!                 ');

  // Step 5: Sign burn intent with delegate
  console.log('');
  console.log('Step 4: Creating burn intent and getting attestation...');

  const { transfer: transferResult } = await initiateMscaTransfer(
    sourceChain,
    destChain,
    amount,
    mscaAddress,
    mscaAddress,
    owner
  );

  console.log('Attestation received!');

  // Step 6: Mint on destination
  console.log('');
  console.log(`Step 5: Minting on ${destChain}...`);

  const destSetup = await createSmartAccountWithEOA(destChain, ownerPrivateKey);

  const mintCalls = buildGatewayMintCalls(
    transferResult.attestation,
    transferResult.signature
  );

  const mintResult = await sendUserOperation(destSetup, mintCalls);

  console.log('');
  console.log('='.repeat(70));
  console.log('  Full Flow Complete!');
  console.log('='.repeat(70));
  console.log(`  Amount:     ${formatUnits(amount, USDC_DECIMALS)} USDC`);
  console.log(`  From:       ${sourceChain}`);
  console.log(`  To:         ${destChain}`);
  console.log(`  Deposit TX: ${depositResult.txHash}`);
  console.log(`  Mint TX:    ${mintResult.txHash}`);
  console.log(`  Explorer:   ${ALL_CHAINS[destChain]?.explorer}/tx/${mintResult.txHash}`);
}

// =============================================================================
// CLI
// =============================================================================

function printUsage(): void {
  console.log('');
  console.log('Gateway MSCA Flow - Full MSCA + Gateway cross-chain transfer');
  console.log('');
  console.log('Usage:');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts status                    - Show balances');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts deposit <chain> <amount>  - Deposit on one chain');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts deposit-multi <amt> <c1,c2,...> - Parallel deposit');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts delegate <chain>          - Add delegate');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts delegate-multi <c1,c2,...>- Add delegate on chains');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts transfer <src> <dst> <amt>- Transfer one source');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts collect <amt> <s1,s2> <dst>- Collect from multi-source');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts <amount> <source> <dest>  - Full flow (single)');
  console.log('');
  console.log(`Supported chains (AA + Gateway): ${FULL_FLOW_CHAINS.join(', ')}`);
  console.log('');
  console.log('Environment variables:');
  console.log('  CIRCLE_CLIENT_KEY  - Circle Modular Wallets client key');
  console.log('  OWNER_PRIVATE_KEY  - Private key for MSCA owner & delegate');
  console.log('');
  console.log('Demo workflow:');
  console.log('  # 1. Check status');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts status');
  console.log('');
  console.log('  # 2. Deposit 1 USDC on both Base Sepolia and Avalanche Fuji');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts deposit-multi 1 base-sepolia,avalanche-fuji');
  console.log('');
  console.log('  # 3. Add delegate on both chains (one-time)');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts delegate-multi base-sepolia,avalanche-fuji');
  console.log('');
  console.log('  # 4. Collect 1 USDC from each chain to Arc (total 2 USDC)');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts collect 1 base-sepolia,avalanche-fuji arc-testnet');
  console.log('');
  console.log('  # 5. Verify');
  console.log('  npx ts-node scripts/gateway-msca-flow.ts status');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const ownerPrivateKey = getEnvOrThrow('OWNER_PRIVATE_KEY') as Hex;

  const command = args[0];

  // Status command
  if (command === 'status') {
    await showStatus(ownerPrivateKey);
    return;
  }

  // Deposit command
  if (command === 'deposit') {
    if (args.length < 3) {
      console.error('Error: deposit requires <chain> <amount>');
      printUsage();
      process.exit(1);
    }
    const chain = args[1];
    const amount = parseUnits(args[2], USDC_DECIMALS);

    if (!FULL_FLOW_CHAINS.includes(chain)) {
      console.error(`Error: Unsupported chain "${chain}"`);
      console.error(`Supported: ${FULL_FLOW_CHAINS.join(', ')}`);
      process.exit(1);
    }

    await deposit(chain, amount, ownerPrivateKey);
    return;
  }

  // Parallel deposit command
  if (command === 'deposit-multi') {
    if (args.length < 3) {
      console.error('Error: deposit-multi requires <amount> <chain1,chain2,...>');
      printUsage();
      process.exit(1);
    }
    const amount = parseUnits(args[1], USDC_DECIMALS);
    const chains = args[2].split(',').map((c) => c.trim());

    for (const chain of chains) {
      if (!FULL_FLOW_CHAINS.includes(chain)) {
        console.error(`Error: Unsupported chain "${chain}"`);
        console.error(`Supported: ${FULL_FLOW_CHAINS.join(', ')}`);
        process.exit(1);
      }
    }

    await depositParallel(chains, amount, ownerPrivateKey);
    return;
  }

  // Delegate command
  if (command === 'delegate') {
    if (args.length < 2) {
      console.error('Error: delegate requires <chain>');
      printUsage();
      process.exit(1);
    }
    const chain = args[1];

    if (!FULL_FLOW_CHAINS.includes(chain)) {
      console.error(`Error: Unsupported chain "${chain}"`);
      console.error(`Supported: ${FULL_FLOW_CHAINS.join(', ')}`);
      process.exit(1);
    }

    await addDelegate(chain, ownerPrivateKey);
    return;
  }

  // Parallel delegate command
  if (command === 'delegate-multi') {
    if (args.length < 2) {
      console.error('Error: delegate-multi requires <chain1,chain2,...>');
      printUsage();
      process.exit(1);
    }
    const chains = args[1].split(',').map((c) => c.trim());

    for (const chain of chains) {
      if (!FULL_FLOW_CHAINS.includes(chain)) {
        console.error(`Error: Unsupported chain "${chain}"`);
        console.error(`Supported: ${FULL_FLOW_CHAINS.join(', ')}`);
        process.exit(1);
      }
    }

    await addDelegateParallel(chains, ownerPrivateKey);
    return;
  }

  // Transfer command
  if (command === 'transfer') {
    if (args.length < 4) {
      console.error('Error: transfer requires <source> <dest> <amount>');
      printUsage();
      process.exit(1);
    }
    const source = args[1];
    const dest = args[2];
    const amount = parseUnits(args[3], USDC_DECIMALS);

    if (!FULL_FLOW_CHAINS.includes(source)) {
      console.error(`Error: Unsupported source chain "${source}"`);
      process.exit(1);
    }
    if (!FULL_FLOW_CHAINS.includes(dest)) {
      console.error(`Error: Unsupported dest chain "${dest}"`);
      process.exit(1);
    }

    await transfer(source, dest, amount, ownerPrivateKey);
    return;
  }

  // Collect command - multi-source to single destination
  if (command === 'collect') {
    if (args.length < 4) {
      console.error('Error: collect requires <amount> <source1,source2,...> <dest>');
      printUsage();
      process.exit(1);
    }
    const amount = parseUnits(args[1], USDC_DECIMALS);
    const sources = args[2].split(',').map((c) => c.trim());
    const dest = args[3];

    for (const chain of sources) {
      if (!FULL_FLOW_CHAINS.includes(chain)) {
        console.error(`Error: Unsupported source chain "${chain}"`);
        console.error(`Supported: ${FULL_FLOW_CHAINS.join(', ')}`);
        process.exit(1);
      }
    }
    if (!FULL_FLOW_CHAINS.includes(dest)) {
      console.error(`Error: Unsupported dest chain "${dest}"`);
      console.error(`Supported: ${FULL_FLOW_CHAINS.join(', ')}`);
      process.exit(1);
    }

    await collect(sources, dest, amount, ownerPrivateKey);
    return;
  }

  // Full flow: <amount> <source> <dest>
  if (args.length >= 3) {
    const amount = parseUnits(args[0], USDC_DECIMALS);
    const source = args[1];
    const dest = args[2];

    if (!FULL_FLOW_CHAINS.includes(source)) {
      console.error(`Error: Unsupported source chain "${source}"`);
      console.error(`Supported: ${FULL_FLOW_CHAINS.join(', ')}`);
      process.exit(1);
    }
    if (!FULL_FLOW_CHAINS.includes(dest)) {
      console.error(`Error: Unsupported dest chain "${dest}"`);
      console.error(`Supported: ${FULL_FLOW_CHAINS.join(', ')}`);
      process.exit(1);
    }

    await fullFlow(amount, source, dest, ownerPrivateKey);
    return;
  }

  console.error('Error: Invalid command or arguments');
  printUsage();
  process.exit(1);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
