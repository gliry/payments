import { Injectable, Logger } from '@nestjs/common';
import { createPublicClient, http, maxUint256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  GATEWAY_API,
  GATEWAY_WALLET,
  GATEWAY_MINTER,
  GATEWAY_DOMAINS,
  DOMAIN_TO_CHAIN,
  getDomain,
} from '../config/gateway';
import { ALL_CHAINS, GATEWAY_CHAINS } from '../config/chains';
import type {
  BurnIntent,
  BurnIntentSpec,
  BurnIntentRequest,
  TransferResponse,
  BalancesResponse,
  ParsedBalance,
} from './gateway.types';
import { USDC_DECIMALS } from './gateway.types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const BURN_INTENT_TYPES = {
  BurnIntent: [
    { name: 'maxBlockHeight', type: 'uint256' },
    { name: 'maxFee', type: 'uint256' },
    { name: 'spec', type: 'TransferSpec' },
  ],
  TransferSpec: [
    { name: 'version', type: 'uint32' },
    { name: 'sourceDomain', type: 'uint32' },
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'sourceContract', type: 'bytes32' },
    { name: 'destinationContract', type: 'bytes32' },
    { name: 'sourceToken', type: 'bytes32' },
    { name: 'destinationToken', type: 'bytes32' },
    { name: 'sourceDepositor', type: 'bytes32' },
    { name: 'destinationRecipient', type: 'bytes32' },
    { name: 'sourceSigner', type: 'bytes32' },
    { name: 'destinationCaller', type: 'bytes32' },
    { name: 'value', type: 'uint256' },
    { name: 'salt', type: 'bytes32' },
    { name: 'hookData', type: 'bytes' },
  ],
} as const;

function addressToBytes32(address: string): `0x${string}` {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
}

function generateSalt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function parseBalance(balance: string): bigint {
  if (balance.includes('.')) {
    const [whole, frac = ''] = balance.split('.');
    const paddedFrac = frac.padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);
    return BigInt(whole + paddedFrac);
  }
  return BigInt(balance);
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  async getBalance(depositorAddress: string): Promise<ParsedBalance[]> {
    const sources = Object.entries(GATEWAY_DOMAINS).map(([, domain]) => ({
      domain,
      depositor: depositorAddress,
    }));

    const response = await fetch(`${GATEWAY_API}/v1/balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'USDC', sources }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gateway API error: ${response.status} - ${text}`);
    }

    const data = (await response.json()) as BalancesResponse;

    return data.balances.map((entry) => ({
      chain: DOMAIN_TO_CHAIN[entry.domain] || `unknown-${entry.domain}`,
      domain: entry.domain,
      balance: parseBalance(entry.balance),
    }));
  }

  async getTotalBalance(depositorAddress: string): Promise<bigint> {
    const balances = await this.getBalance(depositorAddress);
    return balances.reduce((sum, b) => sum + b.balance, 0n);
  }

  createBurnIntent(
    sourceChain: string,
    destinationChain: string,
    amount: bigint,
    depositor: string,
    recipient: string,
    signer: string,
    maxFee: bigint = 2_010000n,
  ): BurnIntent {
    const sourceDomain = getDomain(sourceChain);
    const destinationDomain = getDomain(destinationChain);
    const sourceToken = this.getUsdcAddress(sourceChain);
    const destinationToken = this.getUsdcAddress(destinationChain);

    const spec: BurnIntentSpec = {
      version: 1,
      sourceDomain,
      destinationDomain,
      sourceContract: GATEWAY_WALLET,
      destinationContract: GATEWAY_MINTER,
      sourceToken,
      destinationToken,
      sourceDepositor: depositor,
      destinationRecipient: recipient,
      sourceSigner: signer,
      destinationCaller: ZERO_ADDRESS,
      value: amount,
      salt: generateSalt(),
      hookData: '0x',
    };

    return { maxBlockHeight: maxUint256, maxFee, spec };
  }

  async signAndSubmitBurnIntent(
    burnIntent: BurnIntent,
    delegatePrivateKey: string,
  ): Promise<TransferResponse> {
    const account = privateKeyToAccount(
      delegatePrivateKey as `0x${string}`,
    );

    const typedData = {
      domain: { name: 'GatewayWallet', version: '1' },
      types: BURN_INTENT_TYPES,
      primaryType: 'BurnIntent' as const,
      message: {
        maxBlockHeight: burnIntent.maxBlockHeight,
        maxFee: burnIntent.maxFee,
        spec: {
          version: burnIntent.spec.version,
          sourceDomain: burnIntent.spec.sourceDomain,
          destinationDomain: burnIntent.spec.destinationDomain,
          sourceContract: addressToBytes32(burnIntent.spec.sourceContract),
          destinationContract: addressToBytes32(
            burnIntent.spec.destinationContract,
          ),
          sourceToken: addressToBytes32(burnIntent.spec.sourceToken),
          destinationToken: addressToBytes32(
            burnIntent.spec.destinationToken,
          ),
          sourceDepositor: addressToBytes32(
            burnIntent.spec.sourceDepositor,
          ),
          destinationRecipient: addressToBytes32(
            burnIntent.spec.destinationRecipient,
          ),
          sourceSigner: addressToBytes32(burnIntent.spec.sourceSigner),
          destinationCaller: addressToBytes32(
            burnIntent.spec.destinationCaller,
          ),
          value: burnIntent.spec.value,
          salt: burnIntent.spec.salt,
          hookData: burnIntent.spec.hookData,
        },
      },
    };

    const signature = await account.signTypedData(typedData as any);

    const request: BurnIntentRequest = {
      burnIntent: {
        maxBlockHeight: burnIntent.maxBlockHeight.toString(),
        maxFee: burnIntent.maxFee.toString(),
        spec: {
          version: burnIntent.spec.version,
          sourceDomain: burnIntent.spec.sourceDomain,
          destinationDomain: burnIntent.spec.destinationDomain,
          sourceContract: addressToBytes32(burnIntent.spec.sourceContract),
          destinationContract: addressToBytes32(
            burnIntent.spec.destinationContract,
          ),
          sourceToken: addressToBytes32(burnIntent.spec.sourceToken),
          destinationToken: addressToBytes32(
            burnIntent.spec.destinationToken,
          ),
          sourceDepositor: addressToBytes32(
            burnIntent.spec.sourceDepositor,
          ),
          destinationRecipient: addressToBytes32(
            burnIntent.spec.destinationRecipient,
          ),
          sourceSigner: addressToBytes32(burnIntent.spec.sourceSigner),
          destinationCaller: addressToBytes32(
            burnIntent.spec.destinationCaller,
          ),
          value: burnIntent.spec.value.toString(),
          salt: burnIntent.spec.salt,
          hookData: burnIntent.spec.hookData,
        },
      },
      signature,
    };

    this.logger.log(
      `Submitting burn intent: ${burnIntent.spec.sourceDomain} → ${burnIntent.spec.destinationDomain}`,
    );

    const response = await fetch(`${GATEWAY_API}/v1/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([request]),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gateway transfer error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const result = Array.isArray(data) ? data[0] : data;

    if (!result.attestation) {
      throw new Error(
        `Gateway returned no attestation: ${JSON.stringify(result)}`,
      );
    }

    return {
      attestation: result.attestation,
      signature: result.signature,
      success: result.success,
    };
  }

  async getOnChainBalance(
    chainKey: string,
    walletAddress: string,
  ): Promise<bigint> {
    const chain = ALL_CHAINS[chainKey];
    if (!chain) throw new Error(`Unknown chain: ${chainKey}`);

    const client = createPublicClient({
      transport: http(chain.rpc),
    });

    try {
      const balance = await client.readContract({
        address: chain.usdc as `0x${string}`,
        abi: [
          {
            type: 'function',
            name: 'balanceOf',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view',
          },
        ] as const,
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`],
      });
      return balance;
    } catch (error) {
      this.logger.warn(
        `Failed to read balance on ${chainKey}: ${error.message}`,
      );
      return 0n;
    }
  }

  private getUsdcAddress(chainKey: string): string {
    const chain = ALL_CHAINS[chainKey];
    if (!chain) throw new Error(`Unknown chain: ${chainKey}`);
    return chain.usdc;
  }
}
