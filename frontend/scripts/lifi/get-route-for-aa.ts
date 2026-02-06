/**
 * LI.FI Route for Account Abstraction
 *
 * Gets a LI.FI swap/bridge route and formats it as UserOperationCall[]
 * that can be batched into a single AA UserOperation.
 * Follows the same pattern as buildGatewayDepositCalls() — [approve, action].
 *
 * Usage:
 *   # Get route: swap USDC to WETH on Base (show calldata only)
 *   npx ts-node scripts/lifi/get-route-for-aa.ts --from-chain 8453 --from-token USDC --to-token ETH --amount 5
 *
 *   # Cross-chain: bridge USDC from Arbitrum to Base
 *   npx ts-node scripts/lifi/get-route-for-aa.ts --from-chain 42161 --to-chain 8453 --from-token USDC --to-token USDC --amount 10
 *
 *   # Execute the route via AA UserOp
 *   npx ts-node scripts/lifi/get-route-for-aa.ts --from-chain 8453 --from-token USDC --to-token ETH --amount 5 --execute
 *
 * Env: OWNER_PRIVATE_KEY, CIRCLE_CLIENT_KEY, LIFI_API_KEY (optional)
 */

import 'dotenv/config';
import { type Hex, formatUnits } from 'viem';
import { getQuote, buildLifiSwapCalls } from '../../src/lib/lifi';
import {
  createSmartAccountWithEOA,
  sendUserOperation,
  getSmartAccountAddress,
  type UserOperationCall,
} from '../../src/lib/aa/circle-smart-account';
import { ALL_CHAINS } from '../../src/config/chains';

// =============================================================================
// CLI HELPERS
// =============================================================================

function printUsage() {
  console.log(`
LI.FI Route for Account Abstraction

Gets a swap/bridge route and outputs UserOperationCall[] for AA batching.
The output can be combined with other calls (e.g., Gateway deposit) in a single UserOp.

Usage:
  npx ts-node scripts/lifi/get-route-for-aa.ts [options]

Options:
  --from-chain <id|key>  Source chain ID or key (required)
  --to-chain <id|key>    Destination chain (defaults to from-chain)
  --from-token <addr>    Source token address or symbol (required)
  --to-token <addr>      Destination token address or symbol (required)
  --amount <number>      Amount in human-readable units (required)
  --decimals <number>    Token decimals (default: 6 for USDC)
  --slippage <number>    Max slippage as decimal (default: 0.005)
  --execute              Actually send the UserOperation via AA
  --help                 Show this help

Examples:
  # Get calldata for USDC -> ETH swap on Base
  npx ts-node scripts/lifi/get-route-for-aa.ts --from-chain 8453 --from-token USDC --to-token ETH --amount 5

  # Execute: bridge USDC cross-chain
  npx ts-node scripts/lifi/get-route-for-aa.ts --from-chain 42161 --to-chain 8453 --from-token USDC --to-token USDC --amount 10 --execute

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

function parseAmount(amount: string, decimals: number): string {
  const [whole, frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFrac).toString();
}

function resolveChainId(input: string): string {
  // If it's a key in our config, return the chain ID
  if (ALL_CHAINS[input]) {
    return String(ALL_CHAINS[input].chainId);
  }
  // Otherwise assume it's already a chain ID
  return input;
}

function getEnvOrThrow(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`${key} is not set in environment`);
  }
  return val;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage();
    return;
  }

  const ownerPrivateKey = getEnvOrThrow('OWNER_PRIVATE_KEY') as Hex;
  const execute = args.includes('--execute');

  // Parse arguments
  const fromChainRaw = getArg(args, '--from-chain');
  const toChainRaw = getArg(args, '--to-chain') || fromChainRaw;
  const fromToken = getArg(args, '--from-token');
  const toToken = getArg(args, '--to-token');
  const amountStr = getArg(args, '--amount');
  const decimals = parseInt(getArg(args, '--decimals') || '6', 10);
  const slippage = parseFloat(getArg(args, '--slippage') || '0.005');

  if (!fromChainRaw || !fromToken || !toToken || !amountStr) {
    console.error('Error: --from-chain, --from-token, --to-token, and --amount are required');
    process.exit(1);
  }

  const fromChain = resolveChainId(fromChainRaw);
  const toChain = resolveChainId(toChainRaw!);
  const fromAmount = parseAmount(amountStr, decimals);

  // Get AA address
  console.log('Getting AA wallet address...');
  const aaAddress = await getSmartAccountAddress(ownerPrivateKey);
  console.log(`AA address: ${aaAddress}`);

  // Get LI.FI quote
  console.log(`\nRequesting LI.FI quote...`);
  console.log(`  ${fromToken} (chain ${fromChain}) -> ${toToken} (chain ${toChain})`);
  console.log(`  Amount: ${amountStr} (${fromAmount} base units)`);

  const quote = await getQuote({
    fromChain,
    toChain,
    fromToken,
    toToken,
    fromAmount,
    fromAddress: aaAddress,
    slippage,
  });

  const { action, estimate, transactionRequest } = quote;

  console.log(`\nRoute: ${quote.tool} (${quote.type})`);
  console.log(`Output: ~${formatUnits(BigInt(estimate.toAmount), action.toToken.decimals)} ${action.toToken.symbol}`);
  console.log(`Min:    ${formatUnits(BigInt(estimate.toAmountMin), action.toToken.decimals)} ${action.toToken.symbol}`);
  console.log(`Time:   ~${estimate.executionDuration}s`);

  // Build UserOperation calls
  const fromTokenAddress = action.fromToken.address as Hex;
  const calls = buildLifiSwapCalls(quote, fromTokenAddress, BigInt(fromAmount));

  console.log('\n' + '='.repeat(70));
  console.log('UserOperationCall[] (for AA batching)');
  console.log('='.repeat(70));

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    console.log(`\n[${i}] ${i === 0 && calls.length > 1 ? 'APPROVE' : 'SWAP/BRIDGE'}:`);
    console.log(`  to:    ${call.to}`);
    console.log(`  data:  ${call.data.slice(0, 66)}...`);
    if (call.value) {
      console.log(`  value: ${call.value}`);
    }
  }

  console.log(`\nTotal calls: ${calls.length}`);
  console.log('These calls can be combined with other operations (e.g., Gateway deposit) in a single UserOp batch.');

  // Execute if requested
  if (execute) {
    console.log('\n' + '='.repeat(70));
    console.log('EXECUTING UserOperation...');
    console.log('='.repeat(70));

    // Find our chain key from chain ID for AA setup
    const chainEntry = Object.entries(ALL_CHAINS).find(
      ([, c]) => String(c.chainId) === fromChain,
    );

    if (!chainEntry) {
      console.error(`\nError: chain ${fromChain} is not in our chain config (AA not supported)`);
      console.log('Available chains:', Object.keys(ALL_CHAINS).join(', '));
      process.exit(1);
    }

    const [chainKey] = chainEntry;
    console.log(`Setting up AA on ${chainKey}...`);

    const setup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
    const result = await sendUserOperation(setup, calls as UserOperationCall[]);

    console.log(`\nUserOp hash: ${result.userOpHash}`);
    console.log(`TX hash:     ${result.txHash}`);
    console.log('\nDone!');
  } else {
    console.log('\nAdd --execute to actually send the UserOperation.');
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
