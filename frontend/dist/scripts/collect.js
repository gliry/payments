#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const ethers_1 = require("ethers");
const collectToArc_1 = require("../lib/collectToArc");
const chains_1 = require("../config/chains");
function getEnvOrThrow(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
}
function printUsage() {
    console.log('Usage:');
    console.log('  npx ts-node src/scripts/collect.ts <chain> <amount> <destination>');
    console.log('');
    console.log('Arguments:');
    console.log('  chain       - Source chain: ethereum-sepolia, base-sepolia, sonic-testnet');
    console.log('  amount      - USDC amount (e.g., 10.5)');
    console.log('  destination - Arc destination address');
    console.log('');
    console.log('Environment variables:');
    console.log('  ETHEREUM_PRIVATE_KEY  - Private key for Ethereum Sepolia');
    console.log('  BASE_PRIVATE_KEY      - Private key for Base Sepolia');
    console.log('  SONIC_PRIVATE_KEY     - Private key for Sonic Testnet');
    console.log('  ARC_PRIVATE_KEY       - Private key for Arc (to call receiveMessage)');
    console.log('');
    console.log('Example:');
    console.log('  npx ts-node src/scripts/collect.ts ethereum-sepolia 10 0x1234...');
    console.log('');
    console.log('Multi-chain example (programmatic):');
    console.log('  See collectToArc() function for multi-chain collection');
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(0);
    }
    if (args.length < 3) {
        console.error('Error: Missing required arguments');
        printUsage();
        process.exit(1);
    }
    const [chainName, amountStr, destination] = args;
    // Validate chain
    if (!chains_1.CHAINS[chainName]) {
        console.error(`Error: Unknown chain "${chainName}"`);
        console.error(`Supported chains: ${Object.keys(chains_1.CHAINS).join(', ')}`);
        process.exit(1);
    }
    const chain = chainName;
    // Parse amount (USDC has 6 decimals)
    const amount = (0, ethers_1.parseUnits)(amountStr, 6);
    // Get private keys
    const privateKeyEnvMap = {
        'ethereum-sepolia': 'ETHEREUM_PRIVATE_KEY',
        'base-sepolia': 'BASE_PRIVATE_KEY',
        'sonic-testnet': 'SONIC_PRIVATE_KEY',
    };
    const sourcePrivateKey = getEnvOrThrow(privateKeyEnvMap[chain]);
    const arcPrivateKey = getEnvOrThrow('ARC_PRIVATE_KEY');
    console.log('');
    console.log('Collection Parameters:');
    console.log(`  Source chain: ${chain}`);
    console.log(`  Amount: ${amountStr} USDC`);
    console.log(`  Destination: ${destination}`);
    console.log('');
    try {
        const result = await (0, collectToArc_1.collectFromChain)(chain, amount, sourcePrivateKey, destination, arcPrivateKey);
        console.log('');
        console.log('Result:');
        console.log(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    }
    catch (error) {
        console.error('Collection failed:', error);
        process.exit(1);
    }
}
main();
