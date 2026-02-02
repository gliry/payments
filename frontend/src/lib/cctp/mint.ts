import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { ARC_TESTNET } from '../../config/chains';
import { AttestationResult } from './attestation';
import MESSAGE_TRANSMITTER_ABI from '../../abis/MessageTransmitterV2.json';

export interface MintResult {
  chain: string;
  sourceTxHash: string;
  arcTxHash: string;
}

/**
 * Call receiveMessage on Arc to mint USDC
 */
export async function mintOnArc(
  attestation: AttestationResult,
  arcPrivateKey: string
): Promise<MintResult> {
  const provider = new JsonRpcProvider(ARC_TESTNET.rpc);
  const signer = new Wallet(arcPrivateKey, provider);

  console.log(`[Arc] Minting USDC from ${attestation.chain}...`);
  console.log(`[Arc] Signer: ${signer.address}`);

  const messageTransmitter = new Contract(
    ARC_TESTNET.messageTransmitter,
    MESSAGE_TRANSMITTER_ABI,
    signer
  );

  try {
    const tx = await messageTransmitter.receiveMessage(
      attestation.messageBytes,
      attestation.attestation
    );

    console.log(`[Arc] Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Arc] Minted in block ${receipt?.blockNumber}`);

    return {
      chain: attestation.chain,
      sourceTxHash: attestation.txHash,
      arcTxHash: tx.hash,
    };
  } catch (error) {
    // Check if message was already received (nonce already used)
    if (error instanceof Error && error.message.includes('Nonce already used')) {
      console.log(`[Arc] Message from ${attestation.chain} already processed`);
      return {
        chain: attestation.chain,
        sourceTxHash: attestation.txHash,
        arcTxHash: 'already_processed',
      };
    }
    throw error;
  }
}

/**
 * Mint USDC on Arc for multiple attestations
 */
export async function mintAllOnArc(
  attestations: AttestationResult[],
  arcPrivateKey: string
): Promise<MintResult[]> {
  console.log(`[Arc] Processing ${attestations.length} mint transactions...`);

  // Process sequentially to avoid nonce issues
  const results: MintResult[] = [];
  for (const attestation of attestations) {
    const result = await mintOnArc(attestation, arcPrivateKey);
    results.push(result);
  }

  console.log(`[Arc] All mints complete!`);
  return results;
}
