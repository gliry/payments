/**
 * Circle Modular Wallet - Passkey-based Smart Accounts
 *
 * This module provides utilities for working with Circle Modular Wallets
 * that use WebAuthn/Passkey for authentication.
 *
 * IMPORTANT: The wallet creation functions (registerPasskeyWallet, loginPasskeyWallet)
 * require a browser environment with WebAuthn support. They will NOT work in Node.js.
 * Use the standalone wallet.html page for wallet registration.
 *
 * For backend operations (like receiving wallet addresses from frontend),
 * use the utility functions provided here.
 */

import {
  CIRCLE_CLIENT_URL,
  CIRCLE_CLIENT_KEY,
  ARC_TESTNET_RPC,
} from '../config/circle';

export interface WalletInfo {
  address: string;
  username: string;
  network: string;
}

/**
 * SDK exports for browser usage
 * These are re-exported for convenience in browser environments
 */
export const CircleConfig = {
  clientUrl: CIRCLE_CLIENT_URL,
  clientKey: CIRCLE_CLIENT_KEY,
  arcTestnetRpc: ARC_TESTNET_RPC,
} as const;

/**
 * Check if running in browser environment with WebAuthn support
 */
export function isWebAuthnSupported(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential !== 'undefined'
  );
}

/**
 * Validate a wallet address format (basic check)
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Get Arc Explorer URL for an address
 */
export function getExplorerUrl(address: string, testnet = true): string {
  const baseUrl = testnet
    ? 'https://testnet.arcscan.app'
    : 'https://arcscan.app';
  return `${baseUrl}/address/${address}`;
}

/**
 * Store wallet info in local storage (browser only)
 */
export function storeWalletInfo(wallet: WalletInfo): void {
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage not available - must run in browser');
  }
  localStorage.setItem('arcWallet', JSON.stringify(wallet));
}

/**
 * Retrieve stored wallet info from local storage (browser only)
 */
export function getStoredWalletInfo(): WalletInfo | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  const stored = localStorage.getItem('arcWallet');
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as WalletInfo;
  } catch {
    return null;
  }
}

/**
 * Clear stored wallet info (browser only)
 */
export function clearStoredWalletInfo(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('arcWallet');
  }
}

// ============================================================================
// Browser-Only Functions (WebAuthn/Passkey)
// ============================================================================

/**
 * Type definitions for Circle Modular SDK
 * These match the SDK exports from @circle-fin/modular-wallets-core
 */
export interface WebAuthnCredential {
  id: string;
  publicKey: string;
}

export interface CircleSmartAccount {
  address: string;
  signMessage: (message: string) => Promise<string>;
  signTypedData: (typedData: unknown) => Promise<string>;
}

/**
 * Browser SDK module interface
 * This represents what's available when the SDK is loaded in browser
 */
export interface CircleModularSDK {
  toPasskeyTransport: (url: string, clientKey: string) => unknown;
  toModularTransport: (url: string, clientKey: string) => unknown;
  toWebAuthnCredential: (options: {
    transport: unknown;
    mode: 'register' | 'login';
    username: string;
  }) => Promise<WebAuthnCredential>;
  toCircleSmartAccount: (options: {
    client: unknown;
    owner: WebAuthnCredential;
  }) => Promise<CircleSmartAccount>;
  WebAuthnMode: {
    Register: 'register';
    Login: 'login';
  };
}

/**
 * Instructions for using the SDK in browser
 *
 * The Circle Modular SDK must be loaded in a browser environment.
 * Use the following imports in your frontend code:
 *
 * ```typescript
 * import {
 *   toPasskeyTransport,
 *   toModularTransport,
 *   toWebAuthnCredential,
 *   toCircleSmartAccount,
 *   WebAuthnMode
 * } from '@circle-fin/modular-wallets-core';
 * import { createPublicClient } from 'viem';
 *
 * // Register new wallet
 * const passkeyTransport = toPasskeyTransport(CIRCLE_CLIENT_URL, CIRCLE_CLIENT_KEY);
 * const credential = await toWebAuthnCredential({
 *   transport: passkeyTransport,
 *   mode: WebAuthnMode.Register,
 *   username: 'user@example.com'
 * });
 *
 * const modularTransport = toModularTransport(ARC_TESTNET_RPC, CIRCLE_CLIENT_KEY);
 * const smartAccount = await toCircleSmartAccount({
 *   client: createPublicClient({ transport: modularTransport }),
 *   owner: credential
 * });
 *
 * console.log('Wallet address:', smartAccount.address);
 * ```
 *
 * Or use the standalone wallet.html page: `npx serve public`
 */
export const BROWSER_USAGE_INSTRUCTIONS = `
To create a wallet with passkey:
1. Run: npx serve public
2. Open: http://localhost:3000/wallet.html
3. Enter username and click "Create New Wallet"
4. Authenticate with Touch ID / Face ID
5. Your wallet address will be displayed
`;
