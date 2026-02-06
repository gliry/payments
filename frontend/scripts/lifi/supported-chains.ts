/**
 * LI.FI Supported Chains
 *
 * Lists all chains supported by LI.FI and cross-references with our chain config.
 *
 * Usage:
 *   npx ts-node scripts/lifi/supported-chains.ts              # All LI.FI chains
 *   npx ts-node scripts/lifi/supported-chains.ts --match       # Only chains matching our config
 *   npx ts-node scripts/lifi/supported-chains.ts --tokens 8453 # Tokens on Base (chain ID 8453)
 *
 * Env: LIFI_API_KEY (optional)
 */

import 'dotenv/config';
import { getSupportedChains, getTokens } from '../../src/lib/lifi';
import { ALL_CHAINS } from '../../src/config/chains';

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
  console.log(`
LI.FI Supported Chains

Usage:
  npx ts-node scripts/lifi/supported-chains.ts              # All LI.FI chains
  npx ts-node scripts/lifi/supported-chains.ts --match       # Only chains matching our config
  npx ts-node scripts/lifi/supported-chains.ts --tokens 8453 # Tokens for chain ID
  npx ts-node scripts/lifi/supported-chains.ts --help        # This help

Env:
  LIFI_API_KEY    (optional) LI.FI API key
`);
}

async function showChains(matchOnly: boolean) {
  console.log('Fetching LI.FI supported chains...\n');
  const chains = await getSupportedChains();

  const ourChainIds = new Set(
    Object.values(ALL_CHAINS).map((c) => c.chainId),
  );

  const filtered = matchOnly
    ? chains.filter((c) => ourChainIds.has(c.id))
    : chains;

  // Sort: testnets first, then by id
  filtered.sort((a, b) => {
    if (a.mainnet !== b.mainnet) return a.mainnet ? 1 : -1;
    return a.id - b.id;
  });

  console.log(
    'ID'.padEnd(12) +
    'Key'.padEnd(25) +
    'Name'.padEnd(30) +
    'Type'.padEnd(10) +
    'Match',
  );
  console.log('='.repeat(85));

  for (const chain of filtered) {
    const isMatch = ourChainIds.has(chain.id) ? 'YES' : '';
    console.log(
      String(chain.id).padEnd(12) +
      (chain.key || '').padEnd(25) +
      chain.name.padEnd(30) +
      (chain.mainnet ? 'mainnet' : 'testnet').padEnd(10) +
      isMatch,
    );
  }

  console.log(`\nTotal: ${filtered.length} chains`);
  if (matchOnly) {
    console.log(`(Filtered to chains matching our config)`);
  }
}

async function showTokens(chainId: number) {
  console.log(`Fetching tokens for chain ${chainId}...\n`);
  const tokens = await getTokens([chainId]);
  const chainTokens = tokens[String(chainId)] || [];

  if (chainTokens.length === 0) {
    console.log(`No tokens found for chain ${chainId}`);
    return;
  }

  // Sort by symbol
  chainTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));

  console.log(
    'Symbol'.padEnd(12) +
    'Name'.padEnd(25) +
    'Decimals'.padEnd(10) +
    'Address',
  );
  console.log('='.repeat(80));

  for (const token of chainTokens.slice(0, 50)) {
    console.log(
      token.symbol.padEnd(12) +
      (token.name || '').slice(0, 22).padEnd(25) +
      String(token.decimals).padEnd(10) +
      token.address,
    );
  }

  if (chainTokens.length > 50) {
    console.log(`\n... and ${chainTokens.length - 50} more tokens`);
  }
  console.log(`\nTotal: ${chainTokens.length} tokens`);
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

  if (args.includes('--tokens')) {
    const idx = args.indexOf('--tokens');
    const chainId = parseInt(args[idx + 1], 10);
    if (isNaN(chainId)) {
      console.error('Error: --tokens requires a chain ID (number)');
      process.exit(1);
    }
    await showTokens(chainId);
    return;
  }

  const matchOnly = args.includes('--match');
  await showChains(matchOnly);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
