/**
 * LI.FI Get Quote
 *
 * Gets a swap/bridge quote from LI.FI where one side is USDC.
 * Uses the AA wallet address as default sender.
 *
 * Usage:
 *   # Same-chain swap: USDC -> ETH on Base
 *   npx ts-node scripts/lifi/get-quote.ts --from-chain 8453 --from-token USDC --to-token ETH --amount 10
 *
 *   # Cross-chain bridge: USDC Arbitrum -> USDC Base
 *   npx ts-node scripts/lifi/get-quote.ts --from-chain 42161 --to-chain 8453 --from-token USDC --to-token USDC --amount 50
 *
 *   # With explicit sender address
 *   npx ts-node scripts/lifi/get-quote.ts --from-chain 8453 --from-token USDC --to-token ETH --amount 10 --address 0x123...
 *
 * Env: OWNER_PRIVATE_KEY, CIRCLE_CLIENT_KEY (for AA address), LIFI_API_KEY (optional)
 */

import 'dotenv/config';
import { type Hex, formatUnits } from 'viem';
import { getQuote, type LifiQuoteResponse } from '../../src/lib/lifi';
import { getSmartAccountAddress } from '../../src/lib/aa/circle-smart-account';

// =============================================================================
// CLI HELPERS
// =============================================================================

function printUsage() {
  console.log(`
LI.FI Get Quote

Usage:
  npx ts-node scripts/lifi/get-quote.ts [options]

Options:
  --from-chain <id>    Source chain ID (required)
  --to-chain <id>      Destination chain ID (defaults to from-chain)
  --from-token <addr>  Source token address or symbol (required)
  --to-token <addr>    Destination token address or symbol (required)
  --amount <number>    Amount in human-readable units, e.g. 10 for 10 USDC (required)
  --decimals <number>  Token decimals for amount parsing (default: 6 for USDC)
  --address <addr>     Sender address (default: AA wallet from OWNER_PRIVATE_KEY)
  --slippage <number>  Max slippage as decimal, e.g. 0.005 (default: 0.005)
  --order <type>       FASTEST or CHEAPEST (default: FASTEST)
  --help               Show this help

Examples:
  npx ts-node scripts/lifi/get-quote.ts --from-chain 8453 --from-token USDC --to-token ETH --amount 10
  npx ts-node scripts/lifi/get-quote.ts --from-chain 42161 --to-chain 8453 --from-token USDC --to-token USDC --amount 50

Env:
  OWNER_PRIVATE_KEY   AA owner key (for default sender address)
  CIRCLE_CLIENT_KEY   Circle SDK key (for AA address derivation)
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

// =============================================================================
// DISPLAY
// =============================================================================

function displayQuote(quote: LifiQuoteResponse) {
  const { action, estimate, transactionRequest } = quote;

  console.log('\n' + '='.repeat(70));
  console.log('QUOTE RESULT');
  console.log('='.repeat(70));

  console.log(`\nRoute: ${quote.tool} (${quote.type})`);
  if (quote.toolDetails) {
    console.log(`Tool:  ${quote.toolDetails.name}`);
  }

  console.log(`\nFrom:  ${action.fromToken.symbol} on chain ${action.fromChainId}`);
  console.log(`To:    ${action.toToken.symbol} on chain ${action.toChainId}`);
  console.log(`Amount: ${formatUnits(BigInt(action.fromAmount), action.fromToken.decimals)} ${action.fromToken.symbol}`);

  console.log(`\nEstimated output: ${formatUnits(BigInt(estimate.toAmount), action.toToken.decimals)} ${action.toToken.symbol}`);
  console.log(`Minimum output:   ${formatUnits(BigInt(estimate.toAmountMin), action.toToken.decimals)} ${action.toToken.symbol}`);
  console.log(`Slippage:         ${action.slippage * 100}%`);

  if (estimate.fromAmountUSD) {
    console.log(`\nUSD value: $${estimate.fromAmountUSD} -> $${estimate.toAmountUSD}`);
  }

  console.log(`Execution time:   ~${estimate.executionDuration}s`);

  if (estimate.feeCosts?.length) {
    console.log('\nFees:');
    for (const fee of estimate.feeCosts) {
      const amt = formatUnits(BigInt(fee.amount), fee.token.decimals);
      console.log(`  ${fee.name}: ${amt} ${fee.token.symbol}${fee.amountUSD ? ` ($${fee.amountUSD})` : ''}`);
    }
  }

  if (estimate.gasCosts?.length) {
    console.log('\nGas:');
    for (const gas of estimate.gasCosts) {
      const amt = formatUnits(BigInt(gas.amount), gas.token.decimals);
      console.log(`  ${gas.type}: ${amt} ${gas.token.symbol}${gas.amountUSD ? ` ($${gas.amountUSD})` : ''}`);
    }
  }

  console.log('\n' + '-'.repeat(70));
  console.log('TRANSACTION REQUEST (for AA batching)');
  console.log('-'.repeat(70));
  console.log(`  to:       ${transactionRequest.to}`);
  console.log(`  value:    ${transactionRequest.value}`);
  console.log(`  gasLimit: ${transactionRequest.gasLimit}`);
  console.log(`  chainId:  ${transactionRequest.chainId}`);
  console.log(`  data:     ${transactionRequest.data.slice(0, 66)}...`);

  if (estimate.approvalAddress) {
    console.log(`\nApproval needed: approve ${estimate.approvalAddress} for ${action.fromAmount} of ${action.fromToken.address}`);
  }
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

  // Parse arguments
  const fromChain = getArg(args, '--from-chain');
  const toChain = getArg(args, '--to-chain') || fromChain;
  const fromToken = getArg(args, '--from-token');
  const toToken = getArg(args, '--to-token');
  const amountStr = getArg(args, '--amount');
  const decimals = parseInt(getArg(args, '--decimals') || '6', 10);
  const slippage = parseFloat(getArg(args, '--slippage') || '0.005');
  const order = (getArg(args, '--order') || 'FASTEST') as 'FASTEST' | 'CHEAPEST';
  let address = getArg(args, '--address');

  // Validate
  if (!fromChain || !fromToken || !toToken || !amountStr) {
    console.error('Error: --from-chain, --from-token, --to-token, and --amount are required');
    printUsage();
    process.exit(1);
  }

  // Get AA address if not provided
  if (!address) {
    const ownerKey = process.env.OWNER_PRIVATE_KEY;
    if (ownerKey) {
      console.log('Deriving AA address from OWNER_PRIVATE_KEY...');
      address = await getSmartAccountAddress(ownerKey as Hex);
      console.log(`AA address: ${address}`);
    } else {
      console.error('Error: provide --address or set OWNER_PRIVATE_KEY for AA address');
      process.exit(1);
    }
  }

  const fromAmount = parseAmount(amountStr, decimals);

  console.log(`\nRequesting LI.FI quote...`);
  console.log(`  ${fromToken} (chain ${fromChain}) -> ${toToken} (chain ${toChain})`);
  console.log(`  Amount: ${amountStr} (${fromAmount} base units)`);
  console.log(`  Sender: ${address}`);

  const quote = await getQuote({
    fromChain: fromChain!,
    toChain: toChain!,
    fromToken,
    toToken,
    fromAmount,
    fromAddress: address!,
    slippage,
    order,
  });

  displayQuote(quote);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
