import { IRIS_API_SANDBOX } from '../../config/chains';
import { BurnEvent } from './burn';

export interface AttestationResult extends BurnEvent {
  attestation: string;
}

interface IrisResponse {
  status: string;
  attestation?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll Circle's Iris API for attestation of a single message
 */
export async function pollAttestation(
  burn: BurnEvent,
  maxAttempts = 180,
  intervalMs = 5000
): Promise<AttestationResult> {
  console.log(`[${burn.chain}] Polling for attestation...`);
  console.log(`[${burn.chain}] Message hash: ${burn.messageHash}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${IRIS_API_SANDBOX}/${burn.messageHash}`);

      if (!response.ok) {
        if (response.status === 404) {
          // Attestation not ready yet
          if (attempt % 12 === 0) { // Log every minute
            console.log(`[${burn.chain}] Still waiting for attestation... (${Math.floor(attempt * intervalMs / 60000)} min)`);
          }
          await sleep(intervalMs);
          continue;
        }
        throw new Error(`Iris API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as IrisResponse;

      if (data.status === 'complete' && data.attestation) {
        console.log(`[${burn.chain}] Attestation received!`);
        return {
          ...burn,
          attestation: data.attestation,
        };
      }

      // Pending status
      await sleep(intervalMs);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Iris API error')) {
        throw error;
      }
      // Network error, retry
      console.warn(`[${burn.chain}] Network error, retrying...`, error);
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `[${burn.chain}] Attestation timeout after ${(maxAttempts * intervalMs) / 60000} minutes`
  );
}

/**
 * Poll for attestations for multiple burn events in parallel
 */
export async function pollAttestations(
  burns: BurnEvent[],
  maxAttempts = 180,
  intervalMs = 5000
): Promise<AttestationResult[]> {
  console.log(`Polling for ${burns.length} attestations...`);

  const results = await Promise.all(
    burns.map((burn) => pollAttestation(burn, maxAttempts, intervalMs))
  );

  console.log(`All attestations received!`);
  return results;
}
