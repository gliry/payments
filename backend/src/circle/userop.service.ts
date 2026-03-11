import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicClient, defineChain, toHex } from 'viem';
import {
  toWebAuthnAccount,
  createBundlerClient,
  getUserOperationHash,
} from 'viem/account-abstraction';
import {
  toCircleSmartAccount,
  toModularTransport,
} from '@circle-fin/modular-wallets-core';
import { ALL_CHAINS, type ChainConfig } from './config/chains';
import { CIRCLE_BUNDLER_RPCS } from './config/bundler';
import type { UserOperationCall } from './gateway/gateway.types';

/**
 * Per-chain max fee caps (in wei). Reject UserOps exceeding these limits
 * to prevent paymaster drain attacks.
 */
const MAX_FEE_CAPS: Record<number, bigint> = {
  137: 500_000_000_000n,    // Polygon: 500 gwei
  43114: 100_000_000_000n,  // Avalanche: 100 gwei
  8453: 10_000_000_000n,    // Base: 10 gwei
  10: 10_000_000_000n,      // Optimism: 10 gwei
  42161: 10_000_000_000n,   // Arbitrum: 10 gwei
};

/** Minimum maxFeePerGas per chain (some chains reject below a threshold) */
const MIN_FEE_PER_GAS: Record<number, bigint> = {
  43114: 30_000_000_000n, // Avalanche: 30 gwei
};

/** Fields in a UserOp that are bigints and need string serialization for JSON/DB */
const BIGINT_FIELDS = [
  'nonce',
  'callGasLimit',
  'verificationGasLimit',
  'preVerificationGas',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'paymasterVerificationGasLimit',
  'paymasterPostOpGasLimit',
];

export interface PreparedUserOpResult {
  /** Hash that the client must sign with Passkey */
  userOpHash: string;
  /** Serialized UserOp (bigints as strings) — stored in DB for submission */
  unsignedUserOp: Record<string, any>;
  /** EntryPoint address used */
  entryPointAddress: string;
  /** EntryPoint version */
  entryPointVersion: string;
  /** Chain ID */
  chainId: number;
}

@Injectable()
export class UserOpService {
  private readonly logger = new Logger(UserOpService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Build an unsigned UserOp server-side with gas estimation.
   *
   * Returns the userOpHash (for client-side Passkey signing) and the
   * serialized UserOp (for DB storage and later submission).
   *
   * The client CANNOT modify gas — the hash commits to all UserOp fields.
   * Signing a different UserOp would produce a mismatched signature.
   */
  async prepareUserOp(
    chainKey: string,
    credentialId: string,
    publicKey: string,
    calls: UserOperationCall[],
  ): Promise<PreparedUserOpResult> {
    const chainConfig = ALL_CHAINS[chainKey];
    if (!chainConfig) {
      throw new BadRequestException(`Unsupported chain: ${chainKey}`);
    }

    const bundlerRpc = CIRCLE_BUNDLER_RPCS[chainKey];
    if (!bundlerRpc) {
      throw new BadRequestException(`No bundler RPC for chain: ${chainKey}`);
    }

    const clientKey = this.configService.getOrThrow<string>('CLIENT_KEY');

    const chain = this.buildViemChain(chainKey, chainConfig);
    const transport = toModularTransport(bundlerRpc, clientKey as any);
    const client = createPublicClient({ chain, transport });

    const owner = toWebAuthnAccount({
      credential: {
        id: credentialId,
        publicKey: publicKey as `0x${string}`,
      },
    });

    const account = await toCircleSmartAccount({
      client: client as any,
      owner,
    });

    const bundlerClient = createBundlerClient({
      account,
      client: client as any,
      transport,
      paymaster: true,
      userOperation: {
        estimateFeesPerGas: this.feeEstimator(chain),
      },
    });

    // Build unsigned UserOp with gas estimation.
    // prepareUserOperation uses account.getStubSignature() — no real signing.
    const userOp = await bundlerClient.prepareUserOperation({
      calls: calls.map((c) => ({
        to: c.to as `0x${string}`,
        data: c.data as `0x${string}`,
        ...(c.value ? { value: c.value } : {}),
      })),
    });

    // Enforce gas caps — reject if fee is suspiciously high
    this.enforceGasCaps(chainConfig.chainId, userOp);

    // Get entryPoint info from the smart account
    const entryPointAddress = account.entryPoint.address;
    const entryPointVersion = account.entryPoint.version;

    // Compute the UserOp hash — this is what the client signs
    const userOpHash = getUserOperationHash({
      userOperation: userOp,
      entryPointAddress,
      entryPointVersion,
      chainId: chainConfig.chainId,
    });

    this.logger.log(
      `Prepared UserOp on ${chainKey}: hash=${userOpHash}, nonce=${userOp.nonce}`,
    );

    // Serialize for DB storage (bigints → strings)
    const unsignedUserOp = this.serializeUserOp(userOp);

    return {
      userOpHash,
      unsignedUserOp,
      entryPointAddress,
      entryPointVersion,
      chainId: chainConfig.chainId,
    };
  }

  /**
   * Inject the client-provided Passkey signature into a stored UserOp
   * and submit to the bundler.
   *
   * @param chainKey - chain identifier
   * @param storedData - the full stored object from DB (contains userOp + entryPoint info)
   * @param signature - hex signature from client's Passkey signing
   * @returns on-chain transaction hash
   */
  async submitUserOp(
    chainKey: string,
    storedData: {
      unsignedUserOp: Record<string, any>;
      entryPointAddress: string;
      entryPointVersion: string;
    },
    signature: string,
  ): Promise<string> {
    const chainConfig = ALL_CHAINS[chainKey];
    if (!chainConfig) {
      throw new BadRequestException(`Unsupported chain: ${chainKey}`);
    }

    const bundlerRpc = CIRCLE_BUNDLER_RPCS[chainKey];
    if (!bundlerRpc) {
      throw new BadRequestException(`No bundler RPC for chain: ${chainKey}`);
    }

    const clientKey = this.configService.getOrThrow<string>('CLIENT_KEY');
    const chain = this.buildViemChain(chainKey, chainConfig);
    const transport = toModularTransport(bundlerRpc, clientKey as any);
    const client = createPublicClient({ chain, transport });

    // Deserialize UserOp (strings → bigints)
    const userOp = this.deserializeUserOp(storedData.unsignedUserOp);

    // Inject real signature from client
    userOp.signature = signature as `0x${string}`;

    // Format for RPC (bigints → hex strings)
    const rpcUserOp = this.formatForRpc(userOp);
    const entryPoint = storedData.entryPointAddress;

    // Submit via eth_sendUserOperation
    const opHash = await (client as any).request({
      method: 'eth_sendUserOperation',
      params: [rpcUserOp, entryPoint],
    });

    this.logger.log(`Submitted UserOp on ${chainKey}: opHash=${opHash}`);

    // Wait for on-chain receipt
    const receipt = await this.waitForReceipt(client as any, opHash);
    const txHash = receipt.receipt.transactionHash;

    this.logger.log(`UserOp confirmed on ${chainKey}: txHash=${txHash}`);
    return txHash;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildViemChain(key: string, config: ChainConfig) {
    return defineChain({
      id: config.chainId,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      nativeCurrency: config.nativeCurrency,
      rpcUrls: {
        default: { http: [config.rpc] },
      },
    });
  }

  /**
   * Gas fee estimator — fetches eth_gasPrice from native RPC, applies 2x buffer.
   * Enforces per-chain minimums.
   */
  private feeEstimator(chain: any) {
    return async () => {
      const rpcUrl = chain.rpcUrls.default.http[0];
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_gasPrice',
          params: [],
        }),
      });
      const data = await res.json();
      const gasPrice = BigInt(data.result);
      const minFee = MIN_FEE_PER_GAS[chain.id] ?? 100000n;
      const estimated = gasPrice > 100000n ? gasPrice * 2n : 100000n;
      const maxFeePerGas = estimated > minFee ? estimated : minFee;
      const maxPriorityFeePerGas = maxFeePerGas;

      this.logger.debug(
        `Fee estimate chain ${chain.id}: gasPrice=${gasPrice}, maxFeePerGas=${maxFeePerGas}`,
      );

      return { maxFeePerGas, maxPriorityFeePerGas };
    };
  }

  /** Reject UserOps with gas fees exceeding sane per-chain limits */
  private enforceGasCaps(chainId: number, userOp: any) {
    const cap = MAX_FEE_CAPS[chainId];
    if (!cap) return;

    const maxFee = BigInt(userOp.maxFeePerGas || 0);
    if (maxFee > cap) {
      throw new BadRequestException(
        `Gas fee too high on chain ${chainId}: ${maxFee} exceeds cap ${cap}`,
      );
    }
  }

  /** Serialize UserOp for JSON/DB storage (bigints → strings, skip functions) */
  private serializeUserOp(userOp: any): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(userOp)) {
      if (typeof value === 'bigint') {
        result[key] = value.toString();
      } else if (typeof value === 'function') {
        // skip
      } else if (value !== undefined && value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  /** Deserialize UserOp from DB (known bigint fields: strings → bigints) */
  private deserializeUserOp(stored: Record<string, any>): any {
    const result: any = { ...stored };
    for (const field of BIGINT_FIELDS) {
      if (result[field] !== undefined && result[field] !== null) {
        result[field] = BigInt(result[field]);
      }
    }
    return result;
  }

  /** Format UserOp for eth_sendUserOperation RPC (bigints → hex strings) */
  private formatForRpc(userOp: any): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(userOp)) {
      if (typeof value === 'bigint') {
        result[key] = toHex(value);
      } else if (typeof value === 'function') {
        // skip
      } else if (value !== undefined && value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  /** Poll eth_getUserOperationReceipt until we get a result or timeout */
  private async waitForReceipt(
    client: any,
    opHash: string,
    timeout = 120_000,
    interval = 3_000,
  ): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const receipt = await client.request({
          method: 'eth_getUserOperationReceipt',
          params: [opHash],
        });
        if (receipt) return receipt;
      } catch {
        // Not found yet — keep polling
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new BadRequestException(
      `UserOp receipt timeout after ${timeout / 1000}s for hash ${opHash}`,
    );
  }
}
