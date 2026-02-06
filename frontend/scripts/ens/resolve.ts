/**
 * ENS Name Resolution
 *
 * Forward resolution (name -> address) and reverse resolution (address -> name).
 *
 * Usage:
 *   npx ts-node scripts/ens/resolve.ts vitalik.eth
 *   npx ts-node scripts/ens/resolve.ts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
 *   npx ts-node scripts/ens/resolve.ts vitalik.eth nick.eth brantly.eth
 *   npx ts-node scripts/ens/resolve.ts --testnet myname.eth
 *
 * No env vars required (uses public Ethereum RPC).
 */

import 'dotenv/config';
import { resolveAddress, resolveName } from '../../src/lib/ens';

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
  console.log(`
ENS Name Resolution

Usage:
  npx ts-node scripts/ens/resolve.ts <name-or-address> [name-or-address...]
  npx ts-node scripts/ens/resolve.ts --testnet <name-or-address>

Examples:
  npx ts-node scripts/ens/resolve.ts vitalik.eth
  npx ts-node scripts/ens/resolve.ts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  npx ts-node scripts/ens/resolve.ts vitalik.eth nick.eth

Flags:
  --testnet    Use Sepolia ENS instead of mainnet
  --help       Show this help
`);
}

function isAddress(input: string): boolean {
  return input.startsWith('0x') && input.length === 42;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const testnet = args.includes('--testnet');
  const inputs = args.filter((a) => a !== '--testnet' && a !== '--help' && a !== '-h');

  if (args.includes('--help') || args.includes('-h') || inputs.length === 0) {
    printUsage();
    return;
  }

  console.log(`ENS Resolution (${testnet ? 'Sepolia testnet' : 'Ethereum mainnet'})\n`);
  console.log('Input'.padEnd(45) + 'Result');
  console.log('='.repeat(90));

  for (const input of inputs) {
    try {
      if (isAddress(input)) {
        // Reverse resolution: address -> name
        const name = await resolveName(input as `0x${string}`, testnet);
        console.log(input.padEnd(45) + (name || '(no ENS name)'));
      } else {
        // Forward resolution: name -> address
        const address = await resolveAddress(input, testnet);
        console.log(input.padEnd(45) + (address || '(not found)'));
      }
    } catch (e: any) {
      console.log(input.padEnd(45) + `Error: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
