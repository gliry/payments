#!/usr/bin/env ts-node
/**
 * Gateway Status - Multi-chain balance checker
 *
 * Shows balances across all Gateway-supported chains for both EOA and AA.
 *
 * Usage:
 *   npx ts-node scripts/gateway-status.ts
 */

import 'dotenv/config';
import {
  createPublicClient,
  http,
  formatUnits,
  formatEther,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createSmartAccountWithEOA,
  CHAIN_DEFINITIONS,
} from '../src/lib/aa/circle-smart-account';
import { GATEWAY_CHAINS, type ChainConfig } from '../src/config/chains';
import { getGatewayBalance, GATEWAY_DOMAINS } from '../src/lib/gateway';

const USDC_DECIMALS = 6;

const ERC20_ABI = [{
  name: 'balanceOf',
  type: 'function',
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ type: 'uint256' }],
}] as const;

interface ChainBalances {
  chain: string;
  eoaUsdc: bigint;
  aaUsdc: bigint;
  eaoNative: bigint;
  aaNative: bigint;
  gatewayBalance: bigint;
  error?: string;
}

async function getChainBalances(
  chainKey: string,
  config: ChainConfig,
  eoaAddress: Hex,
  aaAddress: Hex
): Promise<ChainBalances> {
  const result: ChainBalances = {
    chain: chainKey,
    eoaUsdc: 0n,
    aaUsdc: 0n,
    eaoNative: 0n,
    aaNative: 0n,
    gatewayBalance: 0n,
  };

  try {
    const chainDef = CHAIN_DEFINITIONS[chainKey];
    if (!chainDef) {
      result.error = 'No chain definition';
      return result;
    }

    const client = createPublicClient({
      chain: chainDef,
      transport: http(config.rpc),
    });

    // Get balances in parallel
    const [eoaUsdc, aaUsdc, eoaNative, aaNative] = await Promise.all([
      client.readContract({
        address: config.usdc as Hex,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [eoaAddress],
      }).catch(() => 0n),
      client.readContract({
        address: config.usdc as Hex,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [aaAddress],
      }).catch(() => 0n),
      client.getBalance({ address: eoaAddress }).catch(() => 0n),
      client.getBalance({ address: aaAddress }).catch(() => 0n),
    ]);

    result.eoaUsdc = eoaUsdc as bigint;
    result.aaUsdc = aaUsdc as bigint;
    result.eaoNative = eoaNative;
    result.aaNative = aaNative;
  } catch (e: any) {
    result.error = e.message?.slice(0, 50) || 'Unknown error';
  }

  return result;
}

function formatUSDC(amount: bigint): string {
  const formatted = formatUnits(amount, USDC_DECIMALS);
  return amount > 0n ? formatted : '-';
}

function formatNative(amount: bigint): string {
  if (amount === 0n) return '-';
  const formatted = formatEther(amount);
  const num = parseFloat(formatted);
  return num < 0.001 ? '<0.001' : num.toFixed(3);
}

async function main() {
  const pk = process.env.OWNER_PRIVATE_KEY as Hex;
  if (!pk) throw new Error('OWNER_PRIVATE_KEY not set');

  const owner = privateKeyToAccount(pk);

  // Get AA address (same on all chains)
  const setup = await createSmartAccountWithEOA('arc-testnet', pk);
  const aaAddress = setup.accountAddress;

  console.log('');
  console.log('═'.repeat(80));
  console.log('  Gateway Multi-Chain Status');
  console.log('═'.repeat(80));
  console.log('');
  console.log(`  EOA: ${owner.address}`);
  console.log(`  AA:  ${aaAddress}`);
  console.log('');

  // Get Gateway unified balance
  console.log('─'.repeat(80));
  console.log('  Gateway Unified Balance (EOA deposits)');
  console.log('─'.repeat(80));

  const gatewayBalances = await getGatewayBalance(owner.address);
  const gatewayByChain: Record<string, bigint> = {};
  let totalGateway = 0n;

  for (const { chain, balance } of gatewayBalances) {
    gatewayByChain[chain] = balance;
    totalGateway += balance;
  }

  if (totalGateway > 0n) {
    for (const [chain, balance] of Object.entries(gatewayByChain)) {
      if (balance > 0n) {
        console.log(`  ${chain.padEnd(20)} ${formatUnits(balance, USDC_DECIMALS)} USDC`);
      }
    }
    console.log(`  ${'─'.repeat(30)}`);
    console.log(`  ${'Total'.padEnd(20)} ${formatUnits(totalGateway, USDC_DECIMALS)} USDC`);
  } else {
    console.log('  (no Gateway balance)');
  }

  // Get chain balances
  console.log('');
  console.log('─'.repeat(80));
  console.log('  On-Chain Balances');
  console.log('─'.repeat(80));
  console.log('');
  console.log('  Chain'.padEnd(22) + 'EOA USDC'.padStart(12) + 'AA USDC'.padStart(12) +
              'EOA Native'.padStart(12) + 'AA Native'.padStart(12));
  console.log('  ' + '─'.repeat(70));

  const chains = Object.entries(GATEWAY_CHAINS);
  const results: ChainBalances[] = [];

  // Fetch in parallel with concurrency limit
  const BATCH_SIZE = 4;
  for (let i = 0; i < chains.length; i += BATCH_SIZE) {
    const batch = chains.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(([key, config]) => getChainBalances(key, config, owner.address, aaAddress))
    );
    results.push(...batchResults);
  }

  // Display results
  let totalEoaUsdc = 0n;
  let totalAaUsdc = 0n;

  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.chain.padEnd(20)} (error: ${r.error})`);
    } else {
      const eoaUsdc = formatUSDC(r.eoaUsdc).padStart(12);
      const aaUsdc = formatUSDC(r.aaUsdc).padStart(12);
      const eoaNative = formatNative(r.eaoNative).padStart(12);
      const aaNative = formatNative(r.aaNative).padStart(12);
      console.log(`  ${r.chain.padEnd(20)}${eoaUsdc}${aaUsdc}${eoaNative}${aaNative}`);

      totalEoaUsdc += r.eoaUsdc;
      totalAaUsdc += r.aaUsdc;
    }
  }

  console.log('  ' + '─'.repeat(70));
  console.log(`  ${'Total'.padEnd(20)}${formatUSDC(totalEoaUsdc).padStart(12)}${formatUSDC(totalAaUsdc).padStart(12)}`);

  console.log('');
  console.log('═'.repeat(80));
  console.log('');
}

main().catch(console.error);
