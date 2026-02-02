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
export interface WalletInfo {
    address: string;
    username: string;
    network: string;
}
/**
 * SDK exports for browser usage
 * These are re-exported for convenience in browser environments
 */
export declare const CircleConfig: {
    readonly clientUrl: "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
    readonly clientKey: string;
    readonly arcTestnetRpc: "https://modular-sdk.circle.com/v1/rpc/w3s/buidl/arcTestnet";
};
/**
 * Check if running in browser environment with WebAuthn support
 */
export declare function isWebAuthnSupported(): boolean;
/**
 * Validate a wallet address format (basic check)
 */
export declare function isValidAddress(address: string): boolean;
/**
 * Get Arc Explorer URL for an address
 */
export declare function getExplorerUrl(address: string, testnet?: boolean): string;
/**
 * Store wallet info in local storage (browser only)
 */
export declare function storeWalletInfo(wallet: WalletInfo): void;
/**
 * Retrieve stored wallet info from local storage (browser only)
 */
export declare function getStoredWalletInfo(): WalletInfo | null;
/**
 * Clear stored wallet info (browser only)
 */
export declare function clearStoredWalletInfo(): void;
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
export declare const BROWSER_USAGE_INSTRUCTIONS = "\nTo create a wallet with passkey:\n1. Run: npx serve public\n2. Open: http://localhost:3000/wallet.html\n3. Enter username and click \"Create New Wallet\"\n4. Authenticate with Touch ID / Face ID\n5. Your wallet address will be displayed\n";
