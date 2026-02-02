"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollAttestation = pollAttestation;
exports.pollAttestations = pollAttestations;
const chains_1 = require("../../config/chains");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Poll Circle's Iris API for attestation of a single message
 */
async function pollAttestation(burn, maxAttempts = 180, intervalMs = 5000) {
    console.log(`[${burn.chain}] Polling for attestation...`);
    console.log(`[${burn.chain}] Message hash: ${burn.messageHash}`);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(`${chains_1.IRIS_API_SANDBOX}/${burn.messageHash}`);
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
            const data = (await response.json());
            if (data.status === 'complete' && data.attestation) {
                console.log(`[${burn.chain}] Attestation received!`);
                return {
                    ...burn,
                    attestation: data.attestation,
                };
            }
            // Pending status
            await sleep(intervalMs);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Iris API error')) {
                throw error;
            }
            // Network error, retry
            console.warn(`[${burn.chain}] Network error, retrying...`, error);
            await sleep(intervalMs);
        }
    }
    throw new Error(`[${burn.chain}] Attestation timeout after ${(maxAttempts * intervalMs) / 60000} minutes`);
}
/**
 * Poll for attestations for multiple burn events in parallel
 */
async function pollAttestations(burns, maxAttempts = 180, intervalMs = 5000) {
    console.log(`Polling for ${burns.length} attestations...`);
    const results = await Promise.all(burns.map((burn) => pollAttestation(burn, maxAttempts, intervalMs)));
    console.log(`All attestations received!`);
    return results;
}
