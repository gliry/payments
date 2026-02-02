export interface ChainConfig {
    chainId: number;
    domain: number;
    rpc: string;
    usdc: string;
    tokenMessenger: string;
    messageTransmitter: string;
    explorer: string;
}
/**
 * Source chains for CCTP transfers (burn USDC here)
 */
export declare const CHAINS: Record<string, ChainConfig>;
/**
 * Arc Testnet config (destination chain for CCTP)
 */
export declare const ARC_TESTNET: ChainConfig;
/**
 * All chains including Arc (for AA scripts)
 */
export declare const ALL_CHAINS: Record<string, ChainConfig>;
export declare const IRIS_API_SANDBOX = "https://iris-api-sandbox.circle.com/v1/attestations";
export type SupportedChain = keyof typeof CHAINS;
