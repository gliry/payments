"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.burnOnChain = burnOnChain;
exports.burnOnSourceChains = burnOnSourceChains;
const ethers_1 = require("ethers");
const chains_1 = require("../../config/chains");
const ERC20_json_1 = __importDefault(require("../../abis/ERC20.json"));
const TokenMessengerV2_json_1 = __importDefault(require("../../abis/TokenMessengerV2.json"));
/**
 * Extract the message bytes from MessageSent event logs
 */
function extractMessageFromLogs(logs, messageTransmitterAddress) {
    const messageSentTopic = (0, ethers_1.keccak256)(Buffer.from('MessageSent(bytes)'));
    for (const log of logs) {
        if (log.topics[0] === messageSentTopic) {
            // The message is ABI-encoded as bytes in the data field
            // Format: offset (32 bytes) + length (32 bytes) + message
            const data = log.data;
            // Skip 0x prefix, then read offset (first 32 bytes = 64 hex chars)
            const offset = parseInt(data.slice(2, 66), 16) * 2; // offset in hex chars
            const lengthStart = 2 + offset;
            const length = parseInt(data.slice(lengthStart, lengthStart + 64), 16) * 2; // length in hex chars
            const messageStart = lengthStart + 64;
            const messageBytes = '0x' + data.slice(messageStart, messageStart + length);
            return messageBytes;
        }
    }
    throw new Error('MessageSent event not found in transaction logs');
}
/**
 * Burn USDC on a source chain via depositForBurn
 */
async function burnOnChain(params, destinationAddress) {
    const chainConfig = chains_1.CHAINS[params.chain];
    if (!chainConfig) {
        throw new Error(`Unknown chain: ${params.chain}`);
    }
    const provider = new ethers_1.JsonRpcProvider(chainConfig.rpc);
    const signer = new ethers_1.Wallet(params.privateKey, provider);
    console.log(`[${params.chain}] Starting burn of ${params.amount} USDC...`);
    console.log(`[${params.chain}] Signer address: ${signer.address}`);
    // 1. Approve TokenMessenger to spend USDC
    const usdc = new ethers_1.Contract(chainConfig.usdc, ERC20_json_1.default, signer);
    const currentAllowance = await usdc.allowance(signer.address, chainConfig.tokenMessenger);
    if (currentAllowance < params.amount) {
        console.log(`[${params.chain}] Approving TokenMessenger to spend USDC...`);
        const approveTx = await usdc.approve(chainConfig.tokenMessenger, params.amount);
        await approveTx.wait();
        console.log(`[${params.chain}] Approval confirmed: ${approveTx.hash}`);
    }
    // 2. Call depositForBurn
    const messenger = new ethers_1.Contract(chainConfig.tokenMessenger, TokenMessengerV2_json_1.default, signer);
    const recipientBytes32 = (0, ethers_1.zeroPadValue)(destinationAddress, 32);
    console.log(`[${params.chain}] Calling depositForBurn...`);
    console.log(`[${params.chain}] Destination domain: ${chains_1.ARC_TESTNET.domain}`);
    console.log(`[${params.chain}] Recipient (bytes32): ${recipientBytes32}`);
    const tx = await messenger.depositForBurn(params.amount, chains_1.ARC_TESTNET.domain, recipientBytes32, chainConfig.usdc);
    console.log(`[${params.chain}] Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[${params.chain}] Transaction confirmed in block ${receipt?.blockNumber}`);
    // 3. Extract messageHash from MessageSent event
    if (!receipt || !receipt.logs) {
        throw new Error(`[${params.chain}] No logs in transaction receipt`);
    }
    const messageBytes = extractMessageFromLogs(receipt.logs, chainConfig.messageTransmitter);
    const messageHash = (0, ethers_1.keccak256)(messageBytes);
    // 4. Extract nonce from DepositForBurn event
    const depositForBurnTopic = (0, ethers_1.keccak256)(Buffer.from('DepositForBurn(uint64,address,uint256,address,bytes32,uint32,bytes32,bytes32)'));
    let nonce = 0n;
    for (const log of receipt.logs) {
        if (log.topics[0] === depositForBurnTopic) {
            nonce = BigInt(log.topics[1]); // nonce is first indexed param
            break;
        }
    }
    console.log(`[${params.chain}] Burn complete!`);
    console.log(`[${params.chain}] Message hash: ${messageHash}`);
    console.log(`[${params.chain}] Nonce: ${nonce}`);
    return {
        chain: params.chain,
        txHash: tx.hash,
        messageHash,
        messageBytes,
        nonce,
    };
}
/**
 * Burn USDC on multiple source chains in parallel
 */
async function burnOnSourceChains(sources, destinationAddress) {
    console.log(`Starting parallel burns on ${sources.length} chains...`);
    const results = await Promise.all(sources.map((source) => burnOnChain(source, destinationAddress)));
    console.log(`All burns complete. ${results.length} messages pending attestation.`);
    return results;
}
