#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const wallets_1 = require("../lib/wallets");
async function main() {
    const name = process.argv[2] || 'arcflow-user';
    console.log('='.repeat(50));
    console.log('Circle AA Wallet Deployment');
    console.log('='.repeat(50));
    console.log(`Wallet name: ${name}`);
    console.log('');
    try {
        const wallet = await (0, wallets_1.deployArcWallet)(name);
        console.log('');
        console.log('='.repeat(50));
        console.log('Wallet Created Successfully!');
        console.log('='.repeat(50));
        console.log('');
        console.log('Wallet Info:');
        console.log(JSON.stringify(wallet, null, 2));
        console.log('');
        console.log(`Address: ${wallet.address}`);
        console.log(`View on Arc Explorer: https://testnet.arcscan.app/address/${wallet.address}`);
    }
    catch (error) {
        console.error('Failed to deploy wallet:', error);
        process.exit(1);
    }
}
main();
