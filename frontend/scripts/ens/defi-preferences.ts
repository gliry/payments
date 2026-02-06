/**
 * ENS DeFi Payment Preferences
 *
 * Creative ENS use case: store and read DeFi payment preferences
 * in ENS text records under the `com.omniflow.*` namespace.
 *
 * When someone pays `merchant.eth`, the payer reads the merchant's
 * on-chain preferences and auto-configures the optimal route.
 * No off-chain coordination needed — ENS becomes a decentralized
 * payment preference registry.
 *
 * Usage:
 *   # Read preferences
 *   npx ts-node scripts/ens/defi-preferences.ts read vitalik.eth
 *
 *   # Set preferences (generates calldata)
 *   npx ts-node scripts/ens/defi-preferences.ts set user.eth --chain 8453 --token USDC --slippage 0.005
 *
 *   # Set and execute (sends TX from EOA)
 *   npx ts-node scripts/ens/defi-preferences.ts set user.eth --chain 8453 --token USDC --execute
 *
 *   # Lookup: show what a payer would see
 *   npx ts-node scripts/ens/defi-preferences.ts lookup merchant.eth
 *
 * Env: OWNER_PRIVATE_KEY (for set --execute)
 */

import 'dotenv/config';
import { type Hex } from 'viem';
import {
  resolveAddress,
  getDefiPreferences,
  encodeSetDefiPreferences,
  DEFI_PREF_KEYS,
  type DefiPreferences,
} from '../../src/lib/ens';

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
  console.log(`
ENS DeFi Payment Preferences

Store and read DeFi payment preferences in ENS text records.
ENS becomes a decentralized payment preference registry.

Commands:
  read <name>      Read DeFi preferences for a name
  set <name>       Set DeFi preferences (generates calldata or executes)
  lookup <name>    Show what a payer would see when paying this name

Set Options:
  --chain <id>      Preferred receiving chain ID (e.g., 8453 for Base)
  --token <addr>    Preferred token address or symbol (e.g., USDC)
  --slippage <num>  Max slippage as decimal (e.g., 0.005)
  --router <name>   Preferred router (e.g., lifi)
  --address <addr>  Override receiving address
  --execute         Actually send the transaction (requires OWNER_PRIVATE_KEY)
  --testnet         Use Sepolia ENS

ENS Text Record Keys:
  com.omniflow.chain     -> Preferred chain
  com.omniflow.token     -> Preferred token
  com.omniflow.slippage  -> Slippage tolerance
  com.omniflow.router    -> Swap/bridge router
  com.omniflow.address   -> Override address

Examples:
  npx ts-node scripts/ens/defi-preferences.ts read vitalik.eth
  npx ts-node scripts/ens/defi-preferences.ts set myname.eth --chain 8453 --token USDC --slippage 0.005
  npx ts-node scripts/ens/defi-preferences.ts lookup merchant.eth
`);
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

// =============================================================================
// COMMANDS
// =============================================================================

async function cmdRead(name: string, testnet: boolean) {
  console.log(`Reading DeFi preferences for: ${name}\n`);

  const address = await resolveAddress(name, testnet);
  if (address) {
    console.log(`Resolved: ${address}`);
  } else {
    console.log('Warning: name does not resolve to an address');
  }

  const prefs = await getDefiPreferences(name, testnet);
  const entries = Object.entries(prefs).filter(([, v]) => v !== undefined);

  console.log('\nDeFi Payment Preferences:');
  console.log('='.repeat(50));

  if (entries.length === 0) {
    console.log('  (no preferences set)');
    console.log('\n  This name has no DeFi preferences configured.');
    console.log('  Payments will use default settings (USDC, any chain).');
    return;
  }

  const labels: Record<string, string> = {
    preferredChain: 'Chain',
    preferredToken: 'Token',
    maxSlippage: 'Max Slippage',
    preferredRouter: 'Router',
    paymentAddress: 'Payment Address',
  };

  for (const [key, value] of entries) {
    const label = labels[key] || key;
    const display = key === 'maxSlippage' ? `${(value as number) * 100}%` : String(value);
    console.log(`  ${label.padEnd(18)} ${display}`);
  }
}

async function cmdSet(name: string, args: string[], testnet: boolean) {
  const execute = args.includes('--execute');

  // Parse preferences from flags
  const prefs: Partial<DefiPreferences> = {};

  const chain = getArg(args, '--chain');
  const token = getArg(args, '--token');
  const slippage = getArg(args, '--slippage');
  const router = getArg(args, '--router');
  const address = getArg(args, '--address');

  if (chain) prefs.preferredChain = chain;
  if (token) prefs.preferredToken = token;
  if (slippage) prefs.maxSlippage = parseFloat(slippage);
  if (router) prefs.preferredRouter = router;
  if (address) prefs.paymentAddress = address as Hex;

  if (Object.keys(prefs).length === 0) {
    console.error('Error: at least one preference must be specified');
    console.log('Use --chain, --token, --slippage, --router, or --address');
    process.exit(1);
  }

  console.log(`Setting DeFi preferences for: ${name}\n`);
  console.log('Preferences to set:');
  for (const [key, value] of Object.entries(prefs)) {
    console.log(`  ${key}: ${value}`);
  }

  // Generate calldata
  const calls = encodeSetDefiPreferences(name, prefs, testnet);

  console.log(`\nGenerated ${calls.length} setText call(s):\n`);
  for (let i = 0; i < calls.length; i++) {
    console.log(`[${i}] to: ${calls[i].to}`);
    console.log(`    data: ${calls[i].data.slice(0, 66)}...`);
  }

  if (execute) {
    console.log('\n' + '='.repeat(50));
    console.log('EXECUTING...');
    console.log('='.repeat(50));

    // For execution, we need a wallet client
    const { createWalletClient, http } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { mainnet, sepolia } = await import('viem/chains');

    const ownerKey = process.env.OWNER_PRIVATE_KEY;
    if (!ownerKey) {
      console.error('Error: OWNER_PRIVATE_KEY required for --execute');
      process.exit(1);
    }

    const account = privateKeyToAccount(ownerKey as Hex);
    const chain = testnet ? sepolia : mainnet;
    const rpc = testnet
      ? (process.env.SEPOLIA_RPC || 'https://rpc.sepolia.org')
      : (process.env.MAINNET_RPC || 'https://cloudflare-eth.com');

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpc),
    });

    console.log(`Sending from: ${account.address}`);
    console.log(`Network: ${testnet ? 'Sepolia' : 'Mainnet'}\n`);

    for (let i = 0; i < calls.length; i++) {
      console.log(`[${i + 1}/${calls.length}] Sending setText...`);
      const hash = await walletClient.sendTransaction({
        to: calls[i].to,
        data: calls[i].data,
      });
      console.log(`  TX: ${hash}`);
    }

    console.log('\nDone! Text records will be updated after TX confirmation.');
  } else {
    console.log('\nAdd --execute to send the transactions.');
    console.log('Or use these calls in an AA UserOp batch.');
  }
}

async function cmdLookup(name: string, testnet: boolean) {
  console.log(`Payment Lookup: ${name}\n`);
  console.log('='.repeat(60));

  // Step 1: Resolve
  const address = await resolveAddress(name, testnet);
  if (!address) {
    console.log(`\nCould not resolve ${name} to an address.`);
    process.exit(1);
  }

  console.log(`\nRecipient: ${name}`);
  console.log(`Address:   ${address}`);

  // Step 2: Read preferences
  const prefs = await getDefiPreferences(name, testnet);
  const hasPrefs = Object.values(prefs).some((v) => v !== undefined);

  console.log('\n--- Payment Configuration ---\n');

  if (hasPrefs) {
    const destAddress = prefs.paymentAddress || address;
    const destChain = prefs.preferredChain || 'any';
    const destToken = prefs.preferredToken || 'USDC';
    const slippage = prefs.maxSlippage !== undefined ? `${prefs.maxSlippage * 100}%` : '0.5% (default)';
    const router = prefs.preferredRouter || 'auto';

    console.log(`  Destination:  ${destAddress}`);
    console.log(`  Chain:        ${destChain}`);
    console.log(`  Token:        ${destToken}`);
    console.log(`  Max Slippage: ${slippage}`);
    console.log(`  Router:       ${router}`);
    console.log(`\n  Source: ENS text records (on-chain)`);

    console.log(`\nTo pay ${name}:`);
    console.log(`  1. Send ${destToken} to ${destAddress} on chain ${destChain}`);
    if (destChain !== 'any') {
      console.log(`  2. Or use LI.FI to route from any chain/token to ${destToken} on chain ${destChain}`);
      console.log(`     npx ts-node scripts/ens/pay-by-name.ts ${name} <amount>`);
    }
  } else {
    console.log(`  Destination:  ${address}`);
    console.log(`  Chain:        any (no preference)`);
    console.log(`  Token:        USDC (default)`);
    console.log(`  Max Slippage: 0.5% (default)`);
    console.log(`\n  No DeFi preferences set for this name.`);
    console.log(`  Using default payment configuration.`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const testnet = args.includes('--testnet');

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage();
    return;
  }

  const command = args[0];
  const name = args[1];

  if (!name || name.startsWith('--')) {
    console.error('Error: ENS name is required as second argument');
    printUsage();
    process.exit(1);
  }

  switch (command) {
    case 'read':
      await cmdRead(name, testnet);
      break;
    case 'set':
      await cmdSet(name, args.slice(2), testnet);
      break;
    case 'lookup':
      await cmdLookup(name, testnet);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
