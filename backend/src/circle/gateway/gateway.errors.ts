/**
 * GatewayMinter error selectors and helpers.
 * Implementation contract: 0xc2ff68068362aea1ca22a3896d05b2b812ce51b1 (same on all mainnet chains)
 * Source: https://github.com/circlefin/evm-gateway-contracts
 */

export const GATEWAY_MINT_ERRORS = {
  /** TransferSpecHashUsed(bytes32) — attestation already consumed (duplicate mint) */
  TRANSFER_SPEC_HASH_USED: '0x160ca292',
  /** AttestationExpiredAtIndex(uint32,uint256,uint256) — attestation maxBlockHeight exceeded */
  ATTESTATION_EXPIRED: '0xa31dc54b',
  /** MustHaveAtLeastOneAttestation() */
  MUST_HAVE_ATTESTATION: '0x0b085863',
  /** InvalidAttestationSigner(address) */
  INVALID_ATTESTATION_SIGNER: '0x4e0e468c',
} as const;

/** Check if error indicates the attestation was already consumed on-chain (mint succeeded previously) */
export function isAttestationConsumed(errorMessage: string): boolean {
  return (
    errorMessage.includes(GATEWAY_MINT_ERRORS.TRANSFER_SPEC_HASH_USED) ||
    errorMessage.includes('TransferSpecHashUsed')
  );
}

/** Check if error indicates the attestation has expired (non-retryable) */
export function isAttestationExpired(errorMessage: string): boolean {
  return (
    errorMessage.includes(GATEWAY_MINT_ERRORS.ATTESTATION_EXPIRED) ||
    errorMessage.includes('AttestationExpiredAtIndex')
  );
}
