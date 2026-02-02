import { SupportedChain } from '../config/chains';
import { AttestationResult } from './cctp/attestation';
import { MintResult } from './cctp/mint';
export interface CollectParams {
    sourceChains: {
        chain: SupportedChain;
        amount: bigint;
        privateKey: string;
    }[];
    destinationAddress: string;
    arcPrivateKey: string;
}
export interface CollectResult {
    burns: AttestationResult[];
    mints: MintResult[];
    totalAmount: bigint;
}
/**
 * Collect USDC from multiple source chains to Arc via Circle Gateway (CCTP V2)
 *
 * Flow:
 * 1. Burn USDC on all source chains (parallel)
 * 2. Poll Iris API for attestations (parallel)
 * 3. Mint USDC on Arc by calling receiveMessage (sequential)
 */
export declare function collectToArc(params: CollectParams): Promise<CollectResult>;
/**
 * Collect from a single source chain (convenience function)
 */
export declare function collectFromChain(chain: SupportedChain, amount: bigint, sourcePrivateKey: string, destinationAddress: string, arcPrivateKey: string): Promise<CollectResult>;
