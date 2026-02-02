#!/usr/bin/env ts-node
/**
 * Gateway Balance Checker - Poll until deposit is finalized
 *
 * Base Sepolia requires ~65 ETH blocks (~13-19 minutes) for finality.
 * This script polls the Gateway API until the balance appears.
 *
 * Usage:
 *   npx ts-node scripts/gateway-check-balance.ts [address] [--poll]
 *
 * Examples:
 *   npx ts-node scripts/gateway-check-balance.ts                    # Check EOA balance once
 *   npx ts-node scripts/gateway-check-balance.ts --poll             # Poll until balance > 0
 *   npx ts-node scripts/gateway-check-balance.ts 0x123... --poll    # Poll specific address
 */

import 'dotenv/config';
import { formatUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getGatewayBalance, GATEWAY_DOMAINS } from '../src/lib/gateway';

const USDC_DECIMALS = 6;
const POLL_INTERVAL_MS = 30_000; // 30 seconds
const MAX_POLL_TIME_MS = 25 * 60 * 1000; // 25 minutes max

async function checkBalance(address: Hex): Promise<bigint> {
  console.log(`\nChecking Gateway balance for: ${address}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('-'.repeat(50));

  try {
    const balances = await getGatewayBalance(address);
    let total = 0n;

    for (const { chain, balance } of balances) {
      if (balance > 0n) {
        console.log(`  ${chain}: ${formatUnits(balance, USDC_DECIMALS)} USDC`);
        total += balance;
      }
    }

    if (total === 0n) {
      console.log('  (no balance yet - waiting for finality)');
    } else {
      console.log(`  ---`);
      console.log(`  Total: ${formatUnits(total, USDC_DECIMALS)} USDC`);
    }

    return total;
  } catch (e: any) {
    console.error(`  Error: ${e.message}`);
    return 0n;
  }
}

async function pollBalance(address: Hex): Promise<void> {
  console.log('='.repeat(50));
  console.log('Gateway Balance Polling');
  console.log('='.repeat(50));
  console.log(`Address: ${address}`);
  console.log(`Polling interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`Max wait time: ${MAX_POLL_TIME_MS / 60000} minutes`);
  console.log('');
  console.log('Note: Base Sepolia requires ~13-19 minutes for finality');

  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const balance = await checkBalance(address);

    if (balance > 0n) {
      console.log('\n✅ Balance detected! Deposit is finalized.');
      console.log(`Total wait time: ${Math.round((Date.now() - startTime) / 1000)}s`);
      return;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\nWaiting ${POLL_INTERVAL_MS / 1000}s... (elapsed: ${elapsed}s)`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log('\n⏰ Max polling time reached. Balance still 0.');
  console.log('The deposit may need more time or there might be an issue.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldPoll = args.includes('--poll');
  const addressArg = args.find(arg => arg.startsWith('0x'));

  let address: Hex;

  if (addressArg) {
    address = addressArg as Hex;
  } else {
    // Default to EOA from env
    const pk = process.env.OWNER_PRIVATE_KEY as Hex;
    if (!pk) {
      console.error('Error: No address provided and OWNER_PRIVATE_KEY not set');
      console.log('\nUsage: npx ts-node scripts/gateway-check-balance.ts [address] [--poll]');
      process.exit(1);
    }
    address = privateKeyToAccount(pk).address;
  }

  if (shouldPoll) {
    await pollBalance(address);
  } else {
    await checkBalance(address);
  }
}

main().catch(console.error);
