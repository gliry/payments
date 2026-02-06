/**
 * DeBank Portfolio Viewer
 *
 * Shows user's token balances across all chains via DeBank API.
 *
 * Usage:
 *   npx ts-node scripts/debank/portfolio.ts                    # AA wallet balance
 *   npx ts-node scripts/debank/portfolio.ts 0x123...           # Specific address
 *   npx ts-node scripts/debank/portfolio.ts 0x123... --min 10  # Filter by min USD value
 *
 * Env: DEBANK_ACCESS_KEY (required), OWNER_PRIVATE_KEY (optional, for AA address)
 */

import 'dotenv/config';
import { type Hex } from 'viem';
import { getUserTotalBalance, getUserAllTokens, type DebankToken } from '../../src/lib/debank';

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
  console.log(`
DeBank Portfolio Viewer

Shows token balances across all chains.

Usage:
  npx ts-node scripts/debank/portfolio.ts [address] [options]

Arguments:
  [address]    Wallet address (default: AA wallet from OWNER_PRIVATE_KEY)

Options:
  --min <usd>  Minimum USD value to display (default: 0.01)
  --help       Show this help

Examples:
  npx ts-node scripts/debank/portfolio.ts
  npx ts-node scripts/debank/portfolio.ts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  npx ts-node scripts/debank/portfolio.ts 0x123... --min 100

Env:
  DEBANK_ACCESS_KEY   DeBank API key (required)
  OWNER_PRIVATE_KEY   (optional) For default AA address
  CIRCLE_CLIENT_KEY   (optional) For AA address derivation
`);
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const minUsd = parseFloat(getArg(args, '--min') || '0.01');
  let address = args.find((a) => a.startsWith('0x') && a.length === 42);

  // If no address, try to get AA address
  if (!address) {
    const ownerKey = process.env.OWNER_PRIVATE_KEY;
    if (ownerKey) {
      const { getSmartAccountAddress } = await import('../../src/lib/aa/circle-smart-account');
      console.log('Deriving AA address from OWNER_PRIVATE_KEY...');
      address = await getSmartAccountAddress(ownerKey as Hex);
    } else {
      console.error('Error: provide an address or set OWNER_PRIVATE_KEY');
      process.exit(1);
    }
  }

  console.log(`\nPortfolio for: ${address}`);
  console.log('='.repeat(70));

  // Fetch data
  console.log('\nFetching portfolio data...\n');

  const [totalBalance, tokens] = await Promise.all([
    getUserTotalBalance(address),
    getUserAllTokens(address),
  ]);

  // Filter and sort tokens
  const significantTokens = tokens
    .filter((t) => t.amount * t.price >= minUsd)
    .sort((a, b) => b.amount * b.price - a.amount * a.price);

  // Group by chain
  const byChain = new Map<string, DebankToken[]>();
  for (const token of significantTokens) {
    const chain = token.chain;
    if (!byChain.has(chain)) byChain.set(chain, []);
    byChain.get(chain)!.push(token);
  }

  // Display
  console.log(`Total USD Value: $${totalBalance.total_usd_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);

  if (totalBalance.chain_list?.length) {
    console.log('Chain Breakdown:');
    console.log('-'.repeat(50));
    for (const chain of totalBalance.chain_list.sort((a, b) => b.usd_value - a.usd_value)) {
      if (chain.usd_value >= minUsd) {
        console.log(`  ${chain.name.padEnd(20)} $${chain.usd_value.toFixed(2)}`);
      }
    }
    console.log('');
  }

  if (significantTokens.length > 0) {
    console.log(
      'Chain'.padEnd(12) +
      'Token'.padEnd(10) +
      'Balance'.padEnd(20) +
      'USD Value',
    );
    console.log('-'.repeat(60));

    for (const [chain, chainTokens] of byChain) {
      for (const token of chainTokens) {
        const usdValue = token.amount * token.price;
        const balanceStr = token.amount < 0.001
          ? token.amount.toExponential(2)
          : token.amount.toLocaleString('en-US', { maximumFractionDigits: 4 });

        console.log(
          chain.padEnd(12) +
          (token.display_symbol || token.symbol).padEnd(10) +
          balanceStr.padEnd(20) +
          `$${usdValue.toFixed(2)}`,
        );
      }
    }

    console.log(`\nTotal tokens shown: ${significantTokens.length} (min $${minUsd})`);
  } else {
    console.log('No tokens found above minimum threshold.');
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
