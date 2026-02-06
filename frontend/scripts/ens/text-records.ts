/**
 * ENS Text Records
 *
 * Read standard and custom text records for an ENS name.
 *
 * Usage:
 *   npx ts-node scripts/ens/text-records.ts vitalik.eth                # All standard records
 *   npx ts-node scripts/ens/text-records.ts vitalik.eth com.twitter    # Specific record
 *   npx ts-node scripts/ens/text-records.ts user.eth --defi            # OmniFlow DeFi prefs
 *   npx ts-node scripts/ens/text-records.ts user.eth --all             # Standard + DeFi
 *
 * No env vars required (uses public Ethereum RPC).
 */

import 'dotenv/config';
import {
  resolveAddress,
  getTextRecord,
  getStandardRecords,
  getDefiPreferences,
  STANDARD_KEYS,
  DEFI_PREF_KEYS,
} from '../../src/lib/ens';

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
  console.log(`
ENS Text Records

Usage:
  npx ts-node scripts/ens/text-records.ts <name> [key]         # Read specific or all standard records
  npx ts-node scripts/ens/text-records.ts <name> --defi        # Read OmniFlow DeFi preferences
  npx ts-node scripts/ens/text-records.ts <name> --all         # Read everything

Flags:
  --defi       Show DeFi payment preferences (com.omniflow.* keys)
  --all        Show both standard and DeFi records
  --testnet    Use Sepolia ENS
  --help       Show this help

DeFi Preference Keys:
  com.omniflow.chain     Preferred receiving chain
  com.omniflow.token     Preferred receiving token
  com.omniflow.slippage  Maximum slippage tolerance
  com.omniflow.router    Preferred swap/bridge router
  com.omniflow.address   Override receiving address
`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const testnet = args.includes('--testnet');
  const showDefi = args.includes('--defi');
  const showAll = args.includes('--all');
  const flags = ['--testnet', '--defi', '--all', '--help', '-h'];
  const positional = args.filter((a) => !flags.includes(a));

  if (args.includes('--help') || args.includes('-h') || positional.length === 0) {
    printUsage();
    return;
  }

  const name = positional[0];
  const specificKey = positional[1]; // Optional specific key

  console.log(`ENS Text Records for: ${name}`);
  console.log(`Network: ${testnet ? 'Sepolia' : 'Mainnet'}\n`);

  // Resolve address first
  const address = await resolveAddress(name, testnet);
  if (address) {
    console.log(`Resolved address: ${address}\n`);
  } else {
    console.log(`Warning: name does not resolve to an address\n`);
  }

  // If a specific key is requested
  if (specificKey) {
    const value = await getTextRecord(name, specificKey, testnet);
    console.log(`${specificKey}: ${value || '(not set)'}`);
    return;
  }

  // Show standard records
  if (!showDefi || showAll) {
    console.log('Standard Records');
    console.log('-'.repeat(60));

    const records = await getStandardRecords(name, testnet);
    let hasAny = false;
    for (const [key, value] of Object.entries(records)) {
      if (value) {
        console.log(`  ${key.padEnd(20)} ${value}`);
        hasAny = true;
      }
    }
    if (!hasAny) {
      console.log('  (no standard records set)');
    }
    console.log('');
  }

  // Show DeFi preferences
  if (showDefi || showAll) {
    console.log('DeFi Payment Preferences (com.omniflow.*)');
    console.log('-'.repeat(60));

    const prefs = await getDefiPreferences(name, testnet);
    const prefEntries = Object.entries(prefs).filter(([, v]) => v !== undefined);

    if (prefEntries.length > 0) {
      const labels: Record<string, string> = {
        preferredChain: 'Preferred Chain',
        preferredToken: 'Preferred Token',
        maxSlippage: 'Max Slippage',
        preferredRouter: 'Preferred Router',
        paymentAddress: 'Payment Address',
      };

      for (const [key, value] of prefEntries) {
        const label = labels[key] || key;
        const display = key === 'maxSlippage' ? `${(value as number) * 100}%` : String(value);
        console.log(`  ${label.padEnd(20)} ${display}`);
      }
    } else {
      console.log('  (no DeFi preferences set)');
      console.log('  Set them with: npx ts-node scripts/ens/defi-preferences.ts set <name> --chain base --token USDC');
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
