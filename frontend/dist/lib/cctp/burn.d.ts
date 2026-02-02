import { SupportedChain } from '../../config/chains';
export interface BurnParams {
    chain: SupportedChain;
    amount: bigint;
    privateKey: string;
}
export interface BurnEvent {
    chain: SupportedChain;
    txHash: string;
    messageHash: string;
    messageBytes: string;
    nonce: bigint;
}
/**
 * Burn USDC on a source chain via depositForBurn
 */
export declare function burnOnChain(params: BurnParams, destinationAddress: string): Promise<BurnEvent>;
/**
 * Burn USDC on multiple source chains in parallel
 */
export declare function burnOnSourceChains(sources: BurnParams[], destinationAddress: string): Promise<BurnEvent[]>;
