import { encodeFunctionData } from 'viem';
import { GATEWAY_WALLET, GATEWAY_MINTER } from '../config/gateway';
import type { UserOperationCall } from './gateway.types';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
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

const GATEWAY_MINTER_ABI = [
  {
    type: 'function',
    name: 'gatewayMint',
    inputs: [
      { name: 'attestationPayload', type: 'bytes' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'error',
    name: 'TransferSpecHashUsed',
    inputs: [{ name: 'transferSpecHash', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'MustHaveAtLeastOneAttestation',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAttestationSigner',
    inputs: [{ name: 'signer', type: 'address' }],
  },
  {
    type: 'error',
    name: 'AttestationExpiredAtIndex',
    inputs: [
      { name: 'index', type: 'uint32' },
      { name: 'maxBlockHeight', type: 'uint256' },
      { name: 'currentBlock', type: 'uint256' },
    ],
  },
] as const;

const GATEWAY_WALLET_DELEGATE_ABI = [
  {
    type: 'function',
    name: 'addDelegate',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'delegate', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeDelegate',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'delegate', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isAuthorizedForBalance',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'depositor', type: 'address' },
      { name: 'addr', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

export function buildGatewayDepositCalls(
  usdcAddress: string,
  amount: bigint,
): UserOperationCall[] {
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [GATEWAY_WALLET as `0x${string}`, amount],
  });

  const depositData = encodeFunctionData({
    abi: GATEWAY_WALLET_ABI,
    functionName: 'deposit',
    args: [usdcAddress as `0x${string}`, amount],
  });

  return [
    { to: usdcAddress, data: approveData },
    { to: GATEWAY_WALLET, data: depositData },
  ];
}

export function buildGatewayMintCalls(
  attestation: string,
  operatorSignature: string,
): UserOperationCall[] {
  const mintData = encodeFunctionData({
    abi: GATEWAY_MINTER_ABI,
    functionName: 'gatewayMint',
    args: [
      attestation as `0x${string}`,
      operatorSignature as `0x${string}`,
    ],
  });

  return [{ to: GATEWAY_MINTER, data: mintData }];
}

export function buildAddDelegateCalls(
  usdcAddress: string,
  delegate: string,
): UserOperationCall[] {
  const addDelegateData = encodeFunctionData({
    abi: GATEWAY_WALLET_DELEGATE_ABI,
    functionName: 'addDelegate',
    args: [usdcAddress as `0x${string}`, delegate as `0x${string}`],
  });

  return [{ to: GATEWAY_WALLET, data: addDelegateData }];
}

export function buildRemoveDelegateCalls(
  usdcAddress: string,
  delegate: string,
): UserOperationCall[] {
  const removeDelegateData = encodeFunctionData({
    abi: GATEWAY_WALLET_DELEGATE_ABI,
    functionName: 'removeDelegate',
    args: [usdcAddress as `0x${string}`, delegate as `0x${string}`],
  });

  return [{ to: GATEWAY_WALLET, data: removeDelegateData }];
}

export function buildBalanceOfCallData(account: string): string {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account as `0x${string}`],
  });
}

export {
  ERC20_ABI,
  GATEWAY_WALLET_ABI,
  GATEWAY_MINTER_ABI,
  GATEWAY_WALLET_DELEGATE_ABI,
};
