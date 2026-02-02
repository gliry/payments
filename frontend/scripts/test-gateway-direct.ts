#!/usr/bin/env ts-node
/**
 * Direct Gateway transfer test - bypasses balance check
 */

import 'dotenv/config';
import { parseUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createSmartAccountWithEOA,
  sendUserOperation,
} from '../src/lib/aa/circle-smart-account';
import {
  buildGatewayMintCalls,
  initiateTransfer,
} from '../src/lib/gateway';

const USDC_DECIMALS = 6;

async function main() {
  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY as Hex;
  if (!ownerPrivateKey) throw new Error('OWNER_PRIVATE_KEY not set');

  const owner = privateKeyToAccount(ownerPrivateKey);
  console.log('EOA:', owner.address);

  // Get AA address
  const destSetup = await createSmartAccountWithEOA('arc-testnet', ownerPrivateKey);
  const aaAddress = destSetup.accountAddress;
  console.log('AA:', aaAddress);

  const sourceChain = 'base-sepolia';
  const destinationChain = 'arc-testnet';
  const amount = parseUnits('1', USDC_DECIMALS);

  console.log('\n=== Creating burn intent ===');
  console.log('Source:', sourceChain, '(domain 6)');
  console.log('Destination:', destinationChain, '(domain 26)');
  console.log('Amount:', amount.toString());

  try {
    const { transfer: transferResult } = await initiateTransfer(
      sourceChain,
      destinationChain,
      amount,
      aaAddress,  // depositor (AA)
      aaAddress,  // recipient (same AA on destination)
      owner       // EOA signer
    );

    console.log('\n=== Got attestation! ===');
    console.log('Attestation:', transferResult.attestation.slice(0, 66) + '...');
    console.log('Signature:', transferResult.signature.slice(0, 66) + '...');

    console.log('\n=== Minting on Arc ===');
    const mintCalls = buildGatewayMintCalls(
      transferResult.attestation,
      transferResult.signature
    );

    const mintResult = await sendUserOperation(destSetup, mintCalls);
    console.log('\n=== SUCCESS ===');
    console.log('Mint TX:', mintResult.txHash);
  } catch (e: any) {
    console.error('\n=== ERROR ===');
    console.error(e.message || e);
  }
}

main();
