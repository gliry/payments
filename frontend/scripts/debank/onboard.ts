/**
 * DeBank Onboarding — Assets to USDC
 *
 * Shows user's existing assets across chains and generates LI.FI routes
 * to convert them all to USDC for unified balance onboarding.
 *
 * Usage:
 *   npx ts-node scripts/debank/onboard.ts 0x123...               # Show assets
 *   npx ts-node scripts/debank/onboard.ts 0x123... --routes       # Generate LI.FI routes
 *   npx ts-node scripts/debank/onboard.ts 0x123... --min-usd 10   # Filter by min USD
 *
 * Env: DEBANK_ACCESS_KEY, LIFI_API_KEY (optional)
 */

import 'dotenv/config';
import { type Hex } from 'viem';
import { getUserAllTokens, type DebankToken } from '../../src/lib/debank';
import { getQuote } from '../../src/lib/lifi';

// =============================================================================
// CONSTANTS
// =============================================================================

/** DeBank chain ID -> LI.FI chain ID mapping */
const DEBANK_TO_LIFI_CHAIN: Record<string, number> = {
  'eth': 1,
  'bsc': 56,
  'matic': 137,
  'op': 10,
  'arb': 42161,
  'avax': 43114,
  'base': 8453,
  'ftm': 250,
  'xdai': 100,
  'era': 324,
  'linea': 59144,
  'scr': 534352,
  'blast': 81457,
  'mnt': 5000,
};

/** USDC addresses by LI.FI chain ID */
const USDC_BY_CHAIN: Record<number, string> = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  250: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
  100: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
  324: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4',
  59144: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
};

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
  console.log(`
DeBank Onboarding — Assets to USDC

Shows assets and generates LI.FI routes to convert them to USDC.

Usage:
  npx ts-node scripts/debank/onboard.ts <address> [options]

Options:
  --routes       Generate LI.FI swap routes for each non-USDC asset
  --min-usd <n>  Minimum USD value to include (default: 5)
  --dest <chain> Destination chain ID for USDC consolidation (default: 8453 = Base)
  --help         Show this help

Examples:
  npx ts-node scripts/debank/onboard.ts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  npx ts-node scripts/debank/onboard.ts 0x123... --routes --min-usd 10
  npx ts-node scripts/debank/onboard.ts 0x123... --routes --dest 42161

Env:
  DEBANK_ACCESS_KEY   DeBank API key (required)
  LIFI_API_KEY        (optional) LI.FI API key
`);
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function isUsdc(token: DebankToken): boolean {
  return token.symbol === 'USDC' || token.display_symbol === 'USDC';
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

  const address = args.find((a) => a.startsWith('0x') && a.length === 42);
  if (!address) {
    console.error('Error: wallet address required');
    process.exit(1);
  }

  const showRoutes = args.includes('--routes');
  const minUsd = parseFloat(getArg(args, '--min-usd') || '5');
  const destChainId = parseInt(getArg(args, '--dest') || '8453', 10);

  console.log('='.repeat(70));
  console.log(`ONBOARDING: ${address}`);
  console.log('='.repeat(70));

  // Fetch tokens
  console.log('\nFetching portfolio from DeBank...');
  const tokens = await getUserAllTokens(address);

  // Filter significant non-stablecoin tokens
  const candidates = tokens
    .filter((t) => {
      const usdValue = t.amount * t.price;
      return usdValue >= minUsd && !isUsdc(t);
    })
    .sort((a, b) => b.amount * b.price - a.amount * a.price);

  // Also find existing USDC
  const usdcTokens = tokens.filter((t) => isUsdc(t) && t.amount * t.price >= 0.01);

  // Display
  const totalNonUsdc = candidates.reduce((sum, t) => sum + t.amount * t.price, 0);
  const totalUsdc = usdcTokens.reduce((sum, t) => sum + t.amount * t.price, 0);

  console.log(`\nExisting USDC: $${totalUsdc.toFixed(2)}`);
  if (usdcTokens.length > 0) {
    for (const t of usdcTokens) {
      console.log(`  ${t.chain.padEnd(8)} ${t.amount.toFixed(2)} USDC ($${(t.amount * t.price).toFixed(2)})`);
    }
  }

  console.log(`\nNon-USDC assets available for conversion: $${totalNonUsdc.toFixed(2)}`);
  console.log('-'.repeat(60));

  if (candidates.length === 0) {
    console.log('No non-USDC assets above minimum threshold.');
    return;
  }

  console.log(
    'Chain'.padEnd(10) +
    'Token'.padEnd(10) +
    'Balance'.padEnd(18) +
    'USD'.padEnd(12) +
    'Address',
  );

  for (const token of candidates) {
    const usdValue = token.amount * token.price;
    console.log(
      token.chain.padEnd(10) +
      (token.display_symbol || token.symbol).padEnd(10) +
      token.amount.toFixed(4).padEnd(18) +
      `$${usdValue.toFixed(2)}`.padEnd(12) +
      token.id,
    );
  }

  console.log(`\nTotal convertible: $${totalNonUsdc.toFixed(2)} across ${candidates.length} tokens`);

  // Generate LI.FI routes if requested
  if (showRoutes) {
    console.log('\n' + '='.repeat(70));
    console.log('LI.FI CONVERSION ROUTES');
    console.log('='.repeat(70));

    const destUsdc = USDC_BY_CHAIN[destChainId];
    if (!destUsdc) {
      console.error(`\nError: no USDC address known for chain ${destChainId}`);
      process.exit(1);
    }

    console.log(`Destination: USDC on chain ${destChainId}\n`);

    let totalEstimatedUsdc = 0;

    for (const token of candidates) {
      const lifiChainId = DEBANK_TO_LIFI_CHAIN[token.chain];
      if (!lifiChainId) {
        console.log(`[SKIP] ${token.symbol} on ${token.chain}: chain not supported by LI.FI`);
        continue;
      }

      const rawAmount = BigInt(Math.floor(token.raw_amount)).toString();
      const usdValue = token.amount * token.price;

      try {
        const quote = await getQuote({
          fromChain: lifiChainId,
          toChain: destChainId,
          fromToken: token.id,
          toToken: destUsdc,
          fromAmount: rawAmount,
          fromAddress: address,
        });

        const estUsdc = parseFloat(quote.estimate.toAmountUSD || '0');
        totalEstimatedUsdc += estUsdc;

        console.log(
          `[OK]   ${(token.display_symbol || token.symbol).padEnd(8)} ` +
          `$${usdValue.toFixed(2).padEnd(10)} -> ` +
          `~$${estUsdc.toFixed(2)} USDC ` +
          `via ${quote.tool} (~${quote.estimate.executionDuration}s)`,
        );
      } catch (e: any) {
        console.log(
          `[FAIL] ${(token.display_symbol || token.symbol).padEnd(8)} ` +
          `$${usdValue.toFixed(2).padEnd(10)} ` +
          `Error: ${e.message.slice(0, 60)}`,
        );
      }
    }

    console.log('\n' + '-'.repeat(60));
    console.log(`Estimated total after conversion: ~$${totalEstimatedUsdc.toFixed(2)} USDC`);
    console.log(`Plus existing USDC:               $${totalUsdc.toFixed(2)}`);
    console.log(`Grand total:                      ~$${(totalEstimatedUsdc + totalUsdc).toFixed(2)} USDC`);
  } else {
    console.log('\nAdd --routes to generate LI.FI conversion routes.');
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
