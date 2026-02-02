import { formatUnits } from 'ethers';
import { SupportedChain } from '../config/chains';
import { BurnParams, burnOnSourceChains, BurnEvent } from './cctp/burn';
import { pollAttestations, AttestationResult } from './cctp/attestation';
import { mintAllOnArc, MintResult } from './cctp/mint';

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
export async function collectToArc(params: CollectParams): Promise<CollectResult> {
  console.log('='.repeat(60));
  console.log('Starting multi-chain USDC collection via Circle Gateway');
  console.log('='.repeat(60));
  console.log(`Destination: ${params.destinationAddress}`);
  console.log(`Source chains: ${params.sourceChains.map((s) => s.chain).join(', ')}`);

  const totalAmount = params.sourceChains.reduce((sum, s) => sum + s.amount, 0n);
  console.log(`Total amount: ${formatUnits(totalAmount, 6)} USDC`);
  console.log('');

  // Step 1: Burn on all source chains
  console.log('[Step 1/3] Burning USDC on source chains...');
  const burnParams: BurnParams[] = params.sourceChains.map((s) => ({
    chain: s.chain,
    amount: s.amount,
    privateKey: s.privateKey,
  }));

  const burns = await burnOnSourceChains(burnParams, params.destinationAddress);
  console.log('');

  // Step 2: Get attestations from Iris API
  console.log('[Step 2/3] Waiting for attestations from Circle...');
  console.log('(This may take 5-15 minutes on testnet)');
  const attestations = await pollAttestations(burns);
  console.log('');

  // Step 3: Mint on Arc
  console.log('[Step 3/3] Minting USDC on Arc...');
  const mints = await mintAllOnArc(attestations, params.arcPrivateKey);
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('Collection complete!');
  console.log('='.repeat(60));
  console.log(`Total collected: ${formatUnits(totalAmount, 6)} USDC`);
  console.log('');
  console.log('Transactions:');
  for (const mint of mints) {
    console.log(`  ${mint.chain}: ${mint.arcTxHash}`);
  }

  return {
    burns: attestations,
    mints,
    totalAmount,
  };
}

/**
 * Collect from a single source chain (convenience function)
 */
export async function collectFromChain(
  chain: SupportedChain,
  amount: bigint,
  sourcePrivateKey: string,
  destinationAddress: string,
  arcPrivateKey: string
): Promise<CollectResult> {
  return collectToArc({
    sourceChains: [{ chain, amount, privateKey: sourcePrivateKey }],
    destinationAddress,
    arcPrivateKey,
  });
}
