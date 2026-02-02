import 'dotenv/config';

/**
 * Circle Modular Wallets Configuration
 *
 * This configuration is for the Circle Modular Wallets SDK which uses
 * WebAuthn/Passkey authentication in the browser.
 *
 * To get a Client Key:
 * 1. Go to https://console.circle.com
 * 2. Create a new project for Modular Wallets
 * 3. Generate a Client Key (not API Key)
 */

// Circle Modular SDK RPC endpoint (buidl = testnet environment)
export const CIRCLE_CLIENT_URL = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl';

// Client Key for frontend SDK (NOT the API Key used for backend)
export const CIRCLE_CLIENT_KEY = process.env.CIRCLE_CLIENT_KEY || '';

// Supported networks for Modular Wallets (with CCTP domain IDs)
export const SUPPORTED_NETWORKS = {
  testnet: [
    'arcTestnet',       // domain 26
    'baseSepolia',      // domain 6
    'ethereumSepolia',  // domain 0
    'sonicTestnet',     // domain 13
  ],
  mainnet: [
    'arc',
    'base',
    'ethereum',
    'sonic',
  ],
} as const;

// Arc Testnet specific endpoint
export const ARC_TESTNET_RPC = `${CIRCLE_CLIENT_URL}/arcTestnet`;

/**
 * Validate that required environment variables are set
 */
export function validateConfig(): void {
  if (!CIRCLE_CLIENT_KEY) {
    throw new Error(
      'Missing CIRCLE_CLIENT_KEY in environment variables. ' +
      'Get your Client Key from https://console.circle.com'
    );
  }
}
