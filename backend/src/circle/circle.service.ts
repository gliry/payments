import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicClient, defineChain, formatUnits, keccak256, toBytes, http } from 'viem';
import { p256 } from '@noble/curves/nist.js';
import { createKernelAccount } from '@zerodev/sdk';
import { toPasskeyValidator, PasskeyValidatorContractVersion } from '@zerodev/passkey-validator';
import { KERNEL_V3_1, getEntryPoint } from '@zerodev/sdk/constants';
import { GatewayService } from './gateway/gateway.service';
import {
  AA_GATEWAY_CHAINS,
  getUsdcAddress,
  TOKEN_REGISTRY,
} from './config/chains';
import { getZeroDevRpc } from './config/bundler';
import {
  buildGatewayDepositCalls,
  buildGatewayMintCalls,
  buildAddDelegateCalls,
} from './gateway/gateway.operations';
import type { UserOperationCall } from './gateway/gateway.types';
import { USDC_DECIMALS } from './gateway/gateway.types';

// Use Polygon as the reference chain for address computation
const REFERENCE_CHAIN_KEY = 'polygon';

export interface TokenBalance {
  symbol: string;
  balance: string;
  decimals: number;
}

export interface AggregatedBalances {
  total: string;
  gatewayBalances: Record<string, string>;
  onChainBalances: Record<string, Record<string, TokenBalance>>;
}

@Injectable()
export class CircleService {
  private readonly logger = new Logger(CircleService.name);

  constructor(
    private readonly gatewayService: GatewayService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Compute Kernel wallet address from Passkey credential.
   * Uses ZeroDev SDK to derive the deterministic CREATE2 address.
   * The address is the same on all chains for the same owner.
   */
  async computeWalletAddress(
    credentialId: string,
    publicKey: string,
  ): Promise<string> {
    const refChain = AA_GATEWAY_CHAINS[REFERENCE_CHAIN_KEY];
    const chain = defineChain({
      id: refChain.chainId,
      name: 'Polygon',
      nativeCurrency: refChain.nativeCurrency,
      rpcUrls: {
        default: { http: [getZeroDevRpc(refChain.chainId)] },
      },
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(getZeroDevRpc(refChain.chainId)),
    });

    // Decompress stored P256 public key (33 bytes compressed) → get x, y
    const cleanKey = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;
    const point = p256.Point.fromHex(cleanKey);
    const authenticatorIdHash = keccak256(toBytes(credentialId));

    const entryPoint = getEntryPoint('0.7');

    const passkeyValidator = await toPasskeyValidator(publicClient as any, {
      webAuthnKey: {
        pubX: point.x,
        pubY: point.y,
        authenticatorId: credentialId,
        authenticatorIdHash,
        rpID: this.configService.getOrThrow<string>('RP_ID'),
      },
      entryPoint,
      kernelVersion: KERNEL_V3_1,
      validatorContractVersion: PasskeyValidatorContractVersion.V0_0_3_PATCHED,
    });

    const account = await createKernelAccount(publicClient as any, {
      plugins: { sudo: passkeyValidator },
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    const address = account.address;
    this.logger.log(`Computed Kernel address: ${address} for credential: ${credentialId}`);

    return address;
  }

  async getAggregatedBalances(
    walletAddress: string,
  ): Promise<AggregatedBalances> {
    const [gatewayBalances, onChainBalances] = await Promise.all([
      this.gatewayService.getBalance(walletAddress),
      this.getMultiChainBalances(walletAddress),
    ]);

    // Gateway balances are always USDC
    let totalUsdcRaw = 0n;
    const gatewayMap: Record<string, string> = {};
    for (const gb of gatewayBalances) {
      gatewayMap[gb.chain] = formatUnits(gb.balance, USDC_DECIMALS);
      totalUsdcRaw += gb.balance;
    }

    // On-chain: sum all stablecoin balances (normalized to 6 decimals for total)
    for (const [, tokens] of Object.entries(onChainBalances)) {
      for (const [, tb] of Object.entries(tokens)) {
        // Normalize to 6 decimals for USD total
        const raw = BigInt(
          Math.floor(parseFloat(tb.balance) * 1e6),
        );
        totalUsdcRaw += raw;
      }
    }

    return {
      total: formatUnits(totalUsdcRaw, USDC_DECIMALS),
      gatewayBalances: gatewayMap,
      onChainBalances,
    };
  }

  async getMultiChainBalances(
    walletAddress: string,
  ): Promise<Record<string, Record<string, TokenBalance>>> {
    const chains = Object.keys(AA_GATEWAY_CHAINS);
    const STABLECOINS = ['USDC', 'USDT', 'DAI'];

    // Build flat list of all (chain, token) pairs to query
    const queries: { chain: string; symbol: string; address: string; decimals: number }[] = [];
    for (const chain of chains) {
      for (const symbol of STABLECOINS) {
        const token = TOKEN_REGISTRY[symbol];
        const addr = token?.addresses[chain];
        if (addr) {
          queries.push({ chain, symbol, address: addr, decimals: token.decimals });
        }
      }
    }

    const balances = await Promise.allSettled(
      queries.map((q) =>
        this.gatewayService.getTokenBalance(q.chain, q.address, walletAddress),
      ),
    );

    const results: Record<string, Record<string, TokenBalance>> = {};
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      const result = balances[i];
      const raw = result.status === 'fulfilled' ? result.value : 0n;
      if (raw === 0n) continue; // skip zero balances

      if (!results[q.chain]) results[q.chain] = {};
      results[q.chain][q.symbol] = {
        symbol: q.symbol,
        balance: formatUnits(raw, q.decimals),
        decimals: q.decimals,
      };
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
