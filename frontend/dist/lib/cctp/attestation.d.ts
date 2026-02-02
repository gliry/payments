import { BurnEvent } from './burn';
export interface AttestationResult extends BurnEvent {
    attestation: string;
}
/**
 * Poll Circle's Iris API for attestation of a single message
 */
export declare function pollAttestation(burn: BurnEvent, maxAttempts?: number, intervalMs?: number): Promise<AttestationResult>;
/**
 * Poll for attestations for multiple burn events in parallel
 */
export declare function pollAttestations(burns: BurnEvent[], maxAttempts?: number, intervalMs?: number): Promise<AttestationResult[]>;
