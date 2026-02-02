"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BROWSER_USAGE_INSTRUCTIONS = exports.CircleConfig = void 0;
exports.isWebAuthnSupported = isWebAuthnSupported;
exports.isValidAddress = isValidAddress;
exports.getExplorerUrl = getExplorerUrl;
exports.storeWalletInfo = storeWalletInfo;
exports.getStoredWalletInfo = getStoredWalletInfo;
exports.clearStoredWalletInfo = clearStoredWalletInfo;
const circle_1 = require("../config/circle");
/**
 * SDK exports for browser usage
 * These are re-exported for convenience in browser environments
 */
exports.CircleConfig = {
    clientUrl: circle_1.CIRCLE_CLIENT_URL,
    clientKey: circle_1.CIRCLE_CLIENT_KEY,
    arcTestnetRpc: circle_1.ARC_TESTNET_RPC,
};
/**
 * Check if running in browser environment with WebAuthn support
 */
function isWebAuthnSupported() {
    return (typeof globalThis !== 'undefined' &&
        typeof globalThis.PublicKeyCredential !== 'undefined');
}
/**
 * Validate a wallet address format (basic check)
 */
function isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
/**
 * Get Arc Explorer URL for an address
 */
function getExplorerUrl(address, testnet = true) {
    const baseUrl = testnet
        ? 'https://testnet.arcscan.app'
        : 'https://arcscan.app';
    return `${baseUrl}/address/${address}`;
}
/**
 * Store wallet info in local storage (browser only)
 */
function storeWalletInfo(wallet) {
    if (typeof localStorage === 'undefined') {
        throw new Error('localStorage not available - must run in browser');
    }
    localStorage.setItem('arcWallet', JSON.stringify(wallet));
}
/**
 * Retrieve stored wallet info from local storage (browser only)
 */
function getStoredWalletInfo() {
    if (typeof localStorage === 'undefined') {
        return null;
    }
    const stored = localStorage.getItem('arcWallet');
    if (!stored) {
        return null;
    }
    try {
        return JSON.parse(stored);
    }
    catch {
        return null;
    }
}
/**
 * Clear stored wallet info (browser only)
 */
function clearStoredWalletInfo() {
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('arcWallet');
    }
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
exports.BROWSER_USAGE_INSTRUCTIONS = `
To create a wallet with passkey:
1. Run: npx serve public
2. Open: http://localhost:3000/wallet.html
3. Enter username and click "Create New Wallet"
4. Authenticate with Touch ID / Face ID
5. Your wallet address will be displayed
`;
