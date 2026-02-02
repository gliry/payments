#!/usr/bin/env ts-node
/**
 * Gateway transfer - just the transfer part (deposit already done)
 */

import 'dotenv/config';
import { parseUnits, formatUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createSmartAccountWithEOA,
  sendUserOperation,
} from '../src/lib/aa/circle-smart-account';
import { ALL_CHAINS } from '../src/config/chains';
import {
  buildGatewayMintCalls,
  initiateTransfer,
  getGatewayBalance,
} from '../src/lib/gateway';

const USDC_DECIMALS = 6;

async function main() {
  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY as Hex;
  if (!ownerPrivateKey) throw new Error('OWNER_PRIVATE_KEY not set');

  const owner = privateKeyToAccount(ownerPrivateKey);
  console.log('EOA:', owner.address);

  // Get AA address on destination
  const destSetup = await createSmartAccountWithEOA('arc-testnet', ownerPrivateKey);
  const aaAddress = destSetup.accountAddress;
  console.log('AA (destination):', aaAddress);

  // Check current Gateway balance
  console.log('\n=== Gateway Balance ===');
  const balances = await getGatewayBalance(owner.address);
  let availableBalance = 0n;
  for (const { chain, balance } of balances) {
    if (balance > 0n) {
      console.log(`  ${chain}: ${formatUnits(balance, USDC_DECIMALS)} USDC`);
      availableBalance += balance;
    }
  }

  if (availableBalance === 0n) {
    console.error('No Gateway balance available!');
    process.exit(1);
  }

  const sourceChain = 'base-sepolia';
  const destinationChain = 'arc-testnet';
  // Transfer all available (minus some for fee buffer)
  const amount = availableBalance > 100000n ? availableBalance - 100000n : availableBalance;

  console.log('\n=== Transfer via Gateway API ===');
  console.log('Amount:', formatUnits(amount, USDC_DECIMALS), 'USDC');
  console.log('From:', sourceChain);
  console.log('To:', destinationChain);

  try {
    const { transfer: transferResult } = await initiateTransfer(
      sourceChain,
      destinationChain,
      amount,
      owner.address,  // depositor is EOA
      aaAddress,      // recipient is AA on destination
      owner           // EOA signs
    );

    console.log('\n=== Got attestation! ===');
    console.log('Attestation:', transferResult.attestation.slice(0, 66) + '...');
    console.log('Signature:', transferResult.signature.slice(0, 66) + '...');

    // Mint on destination
    console.log('\n=== Mint on Arc via AA ===');
    const mintCalls = buildGatewayMintCalls(
      transferResult.attestation,
      transferResult.signature
    );

    const mintResult = await sendUserOperation(destSetup, mintCalls);
    console.log('\n✅ SUCCESS!');
    console.log('Mint TX:', mintResult.txHash);
    console.log('Explorer:', ALL_CHAINS[destinationChain].explorer + '/tx/' + mintResult.txHash);
  } catch (e: any) {
    console.error('\n❌ ERROR:', e.message || e);
  }
}

main();
