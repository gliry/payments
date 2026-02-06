/**
 * Pay by ENS Name — Full Integration Demo
 *
 * The flagship demo: resolve ENS name → read DeFi preferences →
 * get LI.FI route → generate AA UserOp batch.
 *
 * Ties together: ENS + LI.FI + Circle AA
 *
 * Usage:
 *   # Show payment plan for paying user.eth 10 USDC
 *   npx ts-node scripts/ens/pay-by-name.ts user.eth 10
 *
 *   # Specify source chain
 *   npx ts-node scripts/ens/pay-by-name.ts user.eth 10 --from-chain 8453
 *
 *   # Execute the payment
 *   npx ts-node scripts/ens/pay-by-name.ts user.eth 10 --from-chain base-sepolia --execute
 *
 * Env: OWNER_PRIVATE_KEY, CIRCLE_CLIENT_KEY, LIFI_API_KEY (optional)
 */

import 'dotenv/config';
import { type Hex, formatUnits } from 'viem';
import { resolveAddress, getDefiPreferences } from '../../src/lib/ens';
import { getQuote, buildLifiSwapCalls, type LifiQuoteResponse } from '../../src/lib/lifi';
import {
  getSmartAccountAddress,
  createSmartAccountWithEOA,
  sendUserOperation,
  type UserOperationCall,
} from '../../src/lib/aa/circle-smart-account';
import { ALL_CHAINS } from '../../src/config/chains';

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
  console.log(`
Pay by ENS Name

Resolve ENS name, read DeFi preferences, get LI.FI route, generate AA calldata.

Usage:
  npx ts-node scripts/ens/pay-by-name.ts <name> <amount> [options]

Arguments:
  <name>      ENS name of recipient (e.g., merchant.eth)
  <amount>    Amount to pay in USDC (e.g., 10)

Options:
  --from-chain <id|key>  Source chain ID or key (default: 8453 / Base)
  --from-token <addr>    Source token (default: USDC)
  --execute              Actually send the UserOperation
  --testnet              Use Sepolia ENS for name resolution
  --help                 Show this help

Flow:
  1. Resolve ENS name to address
  2. Read recipient's DeFi payment preferences from ENS text records
  3. Configure LI.FI route based on preferences (chain, token, slippage)
  4. Generate UserOperationCall[] for AA batching
  5. (Optional) Execute via Circle AA bundler

Examples:
  npx ts-node scripts/ens/pay-by-name.ts vitalik.eth 10
  npx ts-node scripts/ens/pay-by-name.ts merchant.eth 50 --from-chain base-sepolia --execute

Env:
  OWNER_PRIVATE_KEY   AA owner key (required)
  CIRCLE_CLIENT_KEY   Circle SDK key (required)
  LIFI_API_KEY        (optional) LI.FI API key
`);
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function resolveChainId(input: string): string {
  if (ALL_CHAINS[input]) return String(ALL_CHAINS[input].chainId);
  return input;
}

function getEnvOrThrow(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is not set in environment`);
  return val;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const flags = ['--from-chain', '--from-token', '--execute', '--testnet', '--help', '-h'];

  if (args.includes('--help') || args.includes('-h') || args.length < 2) {
    printUsage();
    return;
  }

  const ensName = args[0];
  const amountStr = args[1];
  const testnet = args.includes('--testnet');
  const execute = args.includes('--execute');
  const fromChainRaw = getArg(args, '--from-chain') || '8453';
  const fromToken = getArg(args, '--from-token') || 'USDC';

  const ownerPrivateKey = getEnvOrThrow('OWNER_PRIVATE_KEY') as Hex;

  console.log('='.repeat(70));
  console.log(`PAY BY NAME: ${ensName}`);
  console.log('='.repeat(70));

  // Step 1: Resolve ENS name
  console.log('\n[1/4] Resolving ENS name...');
  const recipientAddress = await resolveAddress(ensName, testnet);
  if (!recipientAddress) {
    console.error(`\nError: could not resolve ${ensName} to an address`);
    process.exit(1);
  }
  console.log(`  ${ensName} -> ${recipientAddress}`);

  // Step 2: Read DeFi preferences
  console.log('\n[2/4] Reading DeFi payment preferences...');
  const prefs = await getDefiPreferences(ensName, testnet);
  const hasPrefs = Object.values(prefs).some((v) => v !== undefined);

  const destAddress = prefs.paymentAddress || recipientAddress;
  const destChain = prefs.preferredChain || fromChainRaw; // Same chain if no pref
  const destToken = prefs.preferredToken || 'USDC';
  const slippage = prefs.maxSlippage || 0.005;

  if (hasPrefs) {
    console.log('  Found on-chain preferences:');
    if (prefs.preferredChain) console.log(`    Chain:    ${prefs.preferredChain}`);
    if (prefs.preferredToken) console.log(`    Token:    ${prefs.preferredToken}`);
    if (prefs.maxSlippage) console.log(`    Slippage: ${prefs.maxSlippage * 100}%`);
    if (prefs.preferredRouter) console.log(`    Router:   ${prefs.preferredRouter}`);
    if (prefs.paymentAddress) console.log(`    Address:  ${prefs.paymentAddress}`);
  } else {
    console.log('  No preferences found, using defaults (USDC, same chain)');
  }

  // Step 3: Get LI.FI route
  console.log('\n[3/4] Getting LI.FI route...');

  const aaAddress = await getSmartAccountAddress(ownerPrivateKey);
  console.log(`  Payer AA: ${aaAddress}`);

  const fromChain = resolveChainId(fromChainRaw);
  const toChain = resolveChainId(destChain);

  // Parse amount (assume USDC = 6 decimals for source)
  const fromDecimals = 6;
  const [whole, frac = ''] = amountStr.split('.');
  const paddedFrac = frac.padEnd(fromDecimals, '0').slice(0, fromDecimals);
  const fromAmount = BigInt(whole + paddedFrac).toString();

  console.log(`  Route: ${fromToken} (chain ${fromChain}) -> ${destToken} (chain ${toChain})`);
  console.log(`  Amount: ${amountStr} USDC -> ${destToken}`);
  console.log(`  Recipient: ${destAddress}`);

  let quote: LifiQuoteResponse;
  try {
    quote = await getQuote({
      fromChain,
      toChain,
      fromToken,
      toToken: destToken,
      fromAmount,
      fromAddress: aaAddress,
      toAddress: destAddress,
      slippage,
    });
  } catch (e: any) {
    console.error(`\n  LI.FI route not available: ${e.message}`);
    console.log('\n  This may happen if:');
    console.log('  - The chain/token combination is not supported by LI.FI');
    console.log('  - You are using testnet chain IDs (LI.FI primarily supports mainnets)');
    console.log('  - The amount is too small');
    process.exit(1);
  }

  const { action, estimate } = quote;

  console.log(`\n  Route found: ${quote.tool}`);
  console.log(`  Output: ~${formatUnits(BigInt(estimate.toAmount), action.toToken.decimals)} ${action.toToken.symbol}`);
  console.log(`  Min:    ${formatUnits(BigInt(estimate.toAmountMin), action.toToken.decimals)} ${action.toToken.symbol}`);
  console.log(`  Time:   ~${estimate.executionDuration}s`);

  if (estimate.fromAmountUSD && estimate.toAmountUSD) {
    console.log(`  USD:    $${estimate.fromAmountUSD} -> $${estimate.toAmountUSD}`);
  }

  // Step 4: Build AA UserOperation
  console.log('\n[4/4] Building UserOperation calldata...');

  const fromTokenAddress = action.fromToken.address as Hex;
  const calls = buildLifiSwapCalls(quote, fromTokenAddress, BigInt(fromAmount));

  console.log(`\n  UserOperationCall[${calls.length}]:`);
  for (let i = 0; i < calls.length; i++) {
    const label = i === 0 && calls.length > 1 ? 'approve' : 'swap/bridge';
    console.log(`    [${i}] ${label}: to=${calls[i].to.slice(0, 10)}...`);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('PAYMENT PLAN');
  console.log('='.repeat(70));
  console.log(`  Payer:     ${aaAddress} (AA wallet)`);
  console.log(`  Recipient: ${ensName} (${destAddress})`);
  console.log(`  Send:      ${amountStr} ${fromToken} on chain ${fromChain}`);
  console.log(`  Receive:   ~${formatUnits(BigInt(estimate.toAmount), action.toToken.decimals)} ${action.toToken.symbol} on chain ${toChain}`);
  console.log(`  Via:       ${quote.tool} (LI.FI)`);
  console.log(`  Calls:     ${calls.length} in a single UserOp batch`);
  console.log('='.repeat(70));

  // Execute if requested
  if (execute) {
    console.log('\nExecuting UserOperation...');

    const chainEntry = Object.entries(ALL_CHAINS).find(
      ([, c]) => String(c.chainId) === fromChain,
    );

    if (!chainEntry) {
      console.error(`Error: chain ${fromChain} not in our config (AA not supported)`);
      process.exit(1);
    }

    const [chainKey] = chainEntry;
    const setup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
    const result = await sendUserOperation(setup, calls as UserOperationCall[]);

    console.log(`\nUserOp hash: ${result.userOpHash}`);
    console.log(`TX hash:     ${result.txHash}`);
    console.log(`\nPayment sent to ${ensName}!`);
  } else {
    console.log('\nAdd --execute to send the payment.');
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
