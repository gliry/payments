import { AttestationResult } from './attestation';
export interface MintResult {
    chain: string;
    sourceTxHash: string;
    arcTxHash: string;
}
/**
 * Call receiveMessage on Arc to mint USDC
 */
export declare function mintOnArc(attestation: AttestationResult, arcPrivateKey: string): Promise<MintResult>;
/**
 * Mint USDC on Arc for multiple attestations
 */
export declare function mintAllOnArc(attestations: AttestationResult[], arcPrivateKey: string): Promise<MintResult[]>;
