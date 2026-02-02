"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintOnArc = mintOnArc;
exports.mintAllOnArc = mintAllOnArc;
const ethers_1 = require("ethers");
const chains_1 = require("../../config/chains");
const MessageTransmitterV2_json_1 = __importDefault(require("../../abis/MessageTransmitterV2.json"));
/**
 * Call receiveMessage on Arc to mint USDC
 */
async function mintOnArc(attestation, arcPrivateKey) {
    const provider = new ethers_1.JsonRpcProvider(chains_1.ARC_TESTNET.rpc);
    const signer = new ethers_1.Wallet(arcPrivateKey, provider);
    console.log(`[Arc] Minting USDC from ${attestation.chain}...`);
    console.log(`[Arc] Signer: ${signer.address}`);
    const messageTransmitter = new ethers_1.Contract(chains_1.ARC_TESTNET.messageTransmitter, MessageTransmitterV2_json_1.default, signer);
    try {
        const tx = await messageTransmitter.receiveMessage(attestation.messageBytes, attestation.attestation);
        console.log(`[Arc] Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`[Arc] Minted in block ${receipt?.blockNumber}`);
        return {
            chain: attestation.chain,
            sourceTxHash: attestation.txHash,
            arcTxHash: tx.hash,
        };
    }
    catch (error) {
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
async function mintAllOnArc(attestations, arcPrivateKey) {
    console.log(`[Arc] Processing ${attestations.length} mint transactions...`);
    // Process sequentially to avoid nonce issues
    const results = [];
    for (const attestation of attestations) {
        const result = await mintOnArc(attestation, arcPrivateKey);
        results.push(result);
    }
    console.log(`[Arc] All mints complete!`);
    return results;
}
