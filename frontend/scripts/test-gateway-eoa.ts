#!/usr/bin/env ts-node
/**
 * Gateway transfer test using EOA as depositor
 *
 * Flow:
 * 1. EOA deposits USDC to Gateway on base-sepolia
 * 2. EOA signs burn intent (can sign because it's the depositor)
 * 3. Mint to AA on arc-testnet
 */

import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  createSmartAccountWithEOA,
  sendUserOperation,
} from '../src/lib/aa/circle-smart-account';
import { ALL_CHAINS } from '../src/config/chains';
import {
  buildGatewayMintCalls,
  initiateTransfer,
  GATEWAY_WALLET,
} from '../src/lib/gateway';

const USDC_DECIMALS = 6;

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const GATEWAY_WALLET_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

async function main() {
  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY as Hex;
  if (!ownerPrivateKey) throw new Error('OWNER_PRIVATE_KEY not set');

  const owner = privateKeyToAccount(ownerPrivateKey);
  console.log('EOA:', owner.address);

  // Get AA address on destination
  const destSetup = await createSmartAccountWithEOA('arc-testnet', ownerPrivateKey);
  const aaAddress = destSetup.accountAddress;
  console.log('AA (destination):', aaAddress);

  const sourceChain = 'base-sepolia';
  const destinationChain = 'arc-testnet';
  const amount = parseUnits('0.5', USDC_DECIMALS); // 0.5 USDC
  const usdcAddress = ALL_CHAINS[sourceChain].usdc as Hex;

  // Create clients
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(ALL_CHAINS[sourceChain].rpc),
  });

  const walletClient = createWalletClient({
    account: owner,
    chain: baseSepolia,
    transport: http(ALL_CHAINS[sourceChain].rpc),
  });

  // Check EOA USDC balance
  const eoaBalance = await publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [owner.address],
  });
  console.log('EOA USDC balance:', formatUnits(eoaBalance, USDC_DECIMALS), 'USDC');

  if (eoaBalance < amount) {
    console.error('Insufficient EOA USDC balance!');
    process.exit(1);
  }

  // Step 1: Deposit from EOA to Gateway
  console.log('\n=== Step 1: Deposit from EOA to Gateway ===');
  console.log('Amount:', formatUnits(amount, USDC_DECIMALS), 'USDC');

  // Approve
  console.log('Approving USDC...');
  const approveTx = await walletClient.writeContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [GATEWAY_WALLET, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log('Approved:', approveTx);

  // Deposit
  console.log('Depositing to Gateway...');
  const depositTx = await walletClient.writeContract({
    address: GATEWAY_WALLET,
    abi: GATEWAY_WALLET_ABI,
    functionName: 'deposit',
    args: [usdcAddress, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  console.log('Deposited:', depositTx);

  // Wait for finality (optional, Gateway might need this)
  console.log('Waiting for block confirmations...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Step 2: Create burn intent and get attestation
  console.log('\n=== Step 2: Request transfer via Gateway API ===');

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

    // Step 3: Mint on destination
    console.log('\n=== Step 3: Mint on Arc via AA ===');
    const mintCalls = buildGatewayMintCalls(
      transferResult.attestation,
      transferResult.signature
    );

    const mintResult = await sendUserOperation(destSetup, mintCalls);
    console.log('\n=== SUCCESS ===');
    console.log('Mint TX:', mintResult.txHash);
    console.log('Explorer:', ALL_CHAINS[destinationChain].explorer + '/tx/' + mintResult.txHash);
  } catch (e: any) {
    console.error('\n=== ERROR ===');
    console.error(e.message || e);
  }
}

main();
