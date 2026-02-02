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
export declare const CIRCLE_CLIENT_URL = "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
export declare const CIRCLE_CLIENT_KEY: string;
export declare const SUPPORTED_NETWORKS: {
    readonly testnet: readonly ["arcTestnet", "baseSepolia", "ethereumSepolia", "sonicTestnet"];
    readonly mainnet: readonly ["arc", "base", "ethereum", "sonic"];
};
export declare const ARC_TESTNET_RPC = "https://modular-sdk.circle.com/v1/rpc/w3s/buidl/arcTestnet";
/**
 * Validate that required environment variables are set
 */
export declare function validateConfig(): void;
