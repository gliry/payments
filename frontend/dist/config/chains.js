"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IRIS_API_SANDBOX = exports.ALL_CHAINS = exports.ARC_TESTNET = exports.CHAINS = void 0;
/**
 * Source chains for CCTP transfers (burn USDC here)
 */
exports.CHAINS = {
    'ethereum-sepolia': {
        chainId: 11155111,
        domain: 0,
        rpc: 'https://rpc.sepolia.org',
        usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
        messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
        explorer: 'https://sepolia.etherscan.io',
    },
    'base-sepolia': {
        chainId: 84532,
        domain: 6,
        rpc: 'https://sepolia.base.org',
        usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
        messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
        explorer: 'https://sepolia.basescan.org',
    },
    'sonic-testnet': {
        chainId: 64165,
        domain: 13,
        rpc: 'https://rpc.blaze.soniclabs.com',
        usdc: '0x1FB1545fB70CAC2e42D71d1F535a3Cb3b45E5e71', // Sonic testnet USDC
        tokenMessenger: '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
        messageTransmitter: '0x7865fAfC2db2093669d92c0F33AeEF291086BEFD',
        explorer: 'https://testnet.sonicscan.org',
    },
};
/**
 * Arc Testnet config (destination chain for CCTP)
 */
exports.ARC_TESTNET = {
    chainId: 5042002,
    domain: 26, // Arc testnet CCTP domain
    rpc: 'https://rpc.testnet.arc.network',
    usdc: '0x3600000000000000000000000000000000000000',
    tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    explorer: 'https://testnet.arcscan.app',
};
/**
 * All chains including Arc (for AA scripts)
 */
exports.ALL_CHAINS = {
    ...exports.CHAINS,
    'arc-testnet': exports.ARC_TESTNET,
};
exports.IRIS_API_SANDBOX = 'https://iris-api-sandbox.circle.com/v1/attestations';
