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
