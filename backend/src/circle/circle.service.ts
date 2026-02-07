// Polyfill: Circle SDK's fetchFromApi references window.location.hostname
// which doesn't exist in Node.js. Provide a minimal shim.
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    location: { hostname: 'localhost', protocol: 'http:' },
  };
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicClient, defineChain, formatUnits } from 'viem';
import { toWebAuthnAccount } from 'viem/account-abstraction';
import {
  toCircleSmartAccount,
  toModularTransport,
} from '@circle-fin/modular-wallets-core';
import { GatewayService } from './gateway/gateway.service';
import {
  AA_GATEWAY_CHAINS,
  ALL_CHAINS,
  getUsdcAddress,
} from './config/chains';
import { CIRCLE_BUNDLER_RPCS } from './config/bundler';
import {
  buildGatewayDepositCalls,
  buildGatewayMintCalls,
  buildAddDelegateCalls,
} from './gateway/gateway.operations';
import type { UserOperationCall } from './gateway/gateway.types';
import { USDC_DECIMALS } from './gateway/gateway.types';

// Polygon mainnet chain definition for viem (hub chain)
const polygonMainnet = defineChain({
  id: 137,
  name: 'Polygon',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://polygon-rpc.com'] },
  },
});

export interface AggregatedBalances {
  total: string;
  gatewayBalances: Record<string, string>;
  onChainBalances: Record<string, string>;
}

@Injectable()
export class CircleService {
  private readonly logger = new Logger(CircleService.name);

  constructor(
    private readonly gatewayService: GatewayService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Compute MSCA wallet address from Passkey credential.
   * Uses Circle's bundler RPC to resolve the deterministic CREATE2 address.
   * The address is the same on all chains for the same owner.
   */
  async computeWalletAddress(
    credentialId: string,
    publicKey: string,
  ): Promise<string> {
    const clientKey = this.configService.getOrThrow<string>('CLIENT_KEY');
    const bundlerRpc = CIRCLE_BUNDLER_RPCS['polygon'];

    const transport = toModularTransport(
      `${bundlerRpc}`,
      clientKey as any,
    );

    const client = createPublicClient({
      chain: polygonMainnet,
      transport,
    });

    const owner = toWebAuthnAccount({
      credential: { id: credentialId, publicKey: publicKey as `0x${string}` },
    });

    const account = await toCircleSmartAccount({
      client: client as any,
      owner,
    });

    const address = account.address;
    this.logger.log(`Computed MSCA address: ${address} for credential: ${credentialId}`);

    return address;
  }

  async getAggregatedBalances(
    walletAddress: string,
  ): Promise<AggregatedBalances> {
    const [gatewayBalances, onChainBalances] = await Promise.all([
      this.gatewayService.getBalance(walletAddress),
      this.getMultiChainBalances(walletAddress),
    ]);

    let totalRaw = 0n;

    const gatewayMap: Record<string, string> = {};
    for (const gb of gatewayBalances) {
      gatewayMap[gb.chain] = formatUnits(gb.balance, USDC_DECIMALS);
      totalRaw += gb.balance;
    }

    const onChainMap: Record<string, string> = {};
    for (const [chain, balance] of Object.entries(onChainBalances)) {
      onChainMap[chain] = formatUnits(balance, USDC_DECIMALS);
      totalRaw += balance;
    }

    return {
      total: formatUnits(totalRaw, USDC_DECIMALS),
      gatewayBalances: gatewayMap,
      onChainBalances: onChainMap,
    };
  }

  async getMultiChainBalances(
    walletAddress: string,
  ): Promise<Record<string, bigint>> {
    const chains = Object.keys(AA_GATEWAY_CHAINS);
    const results: Record<string, bigint> = {};

    const balances = await Promise.allSettled(
      chains.map((chain) =>
        this.gatewayService.getOnChainBalance(chain, walletAddress),
      ),
    );

    for (let i = 0; i < chains.length; i++) {
      const result = balances[i];
      results[chains[i]] =
        result.status === 'fulfilled' ? result.value : 0n;
    }

    return results;
  }

  buildDepositCallData(
    chain: string,
    amount: bigint,
  ): UserOperationCall[] {
    const usdcAddress = getUsdcAddress(chain);
    return buildGatewayDepositCalls(usdcAddress, amount);
  }

  buildDelegateCallData(
    chain: string,
    delegateAddress: string,
  ): UserOperationCall[] {
    const usdcAddress = getUsdcAddress(chain);
    return buildAddDelegateCalls(usdcAddress, delegateAddress);
  }

  buildMintCallData(
    attestation: string,
    operatorSignature: string,
  ): UserOperationCall[] {
    return buildGatewayMintCalls(attestation, operatorSignature);
  }

  async submitBurnIntent(
    sourceChain: string,
    destinationChain: string,
    amount: bigint,
    mscaAddress: string,
    recipient: string,
    delegatePrivateKey: string,
  ) {
    const delegateAccount = (await import('viem/accounts')).privateKeyToAccount(
      delegatePrivateKey as `0x${string}`,
    );

    const burnIntent = this.gatewayService.createBurnIntent(
      sourceChain,
      destinationChain,
      amount,
      mscaAddress,
      recipient,
      delegateAccount.address,
    );

    const transfer = await this.gatewayService.signAndSubmitBurnIntent(
      burnIntent,
      delegatePrivateKey,
    );

    return { burnIntent, transfer };
  }
}
