"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectToArc = collectToArc;
exports.collectFromChain = collectFromChain;
const ethers_1 = require("ethers");
const burn_1 = require("./cctp/burn");
const attestation_1 = require("./cctp/attestation");
const mint_1 = require("./cctp/mint");
/**
 * Collect USDC from multiple source chains to Arc via Circle Gateway (CCTP V2)
 *
 * Flow:
 * 1. Burn USDC on all source chains (parallel)
 * 2. Poll Iris API for attestations (parallel)
 * 3. Mint USDC on Arc by calling receiveMessage (sequential)
 */
async function collectToArc(params) {
    console.log('='.repeat(60));
    console.log('Starting multi-chain USDC collection via Circle Gateway');
    console.log('='.repeat(60));
    console.log(`Destination: ${params.destinationAddress}`);
    console.log(`Source chains: ${params.sourceChains.map((s) => s.chain).join(', ')}`);
    const totalAmount = params.sourceChains.reduce((sum, s) => sum + s.amount, 0n);
    console.log(`Total amount: ${(0, ethers_1.formatUnits)(totalAmount, 6)} USDC`);
    console.log('');
    // Step 1: Burn on all source chains
    console.log('[Step 1/3] Burning USDC on source chains...');
    const burnParams = params.sourceChains.map((s) => ({
        chain: s.chain,
        amount: s.amount,
        privateKey: s.privateKey,
    }));
    const burns = await (0, burn_1.burnOnSourceChains)(burnParams, params.destinationAddress);
    console.log('');
    // Step 2: Get attestations from Iris API
    console.log('[Step 2/3] Waiting for attestations from Circle...');
    console.log('(This may take 5-15 minutes on testnet)');
    const attestations = await (0, attestation_1.pollAttestations)(burns);
    console.log('');
    // Step 3: Mint on Arc
    console.log('[Step 3/3] Minting USDC on Arc...');
    const mints = await (0, mint_1.mintAllOnArc)(attestations, params.arcPrivateKey);
    console.log('');
    // Summary
    console.log('='.repeat(60));
    console.log('Collection complete!');
    console.log('='.repeat(60));
    console.log(`Total collected: ${(0, ethers_1.formatUnits)(totalAmount, 6)} USDC`);
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
async function collectFromChain(chain, amount, sourcePrivateKey, destinationAddress, arcPrivateKey) {
    return collectToArc({
        sourceChains: [{ chain, amount, privateKey: sourcePrivateKey }],
        destinationAddress,
        arcPrivateKey,
    });
}
