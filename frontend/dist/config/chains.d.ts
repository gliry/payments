export interface ChainConfig {
    chainId: number;
    domain: number;
    rpc: string;
    usdc: string;
    tokenMessenger: string;
    messageTransmitter: string;
    explorer: string;
}
export declare const CHAINS: Record<string, ChainConfig>;
export declare const ARC_TESTNET: ChainConfig;
export declare const IRIS_API_SANDBOX = "https://iris-api-sandbox.circle.com/v1/attestations";
export type SupportedChain = keyof typeof CHAINS;
