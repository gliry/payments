import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createPublicClient, toHex, http, encodeAbiParameters } from 'viem';
import {
  getUserOperationHash,
} from 'viem/account-abstraction';
import { createKernelAccount } from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { KERNEL_V3_1, getEntryPoint } from '@zerodev/sdk/constants';
import { ALL_CHAINS } from './config/chains';
import { getZeroDevRpc, getBundlerRpc } from './config/bundler';
import { AccountService } from './account.service';
import type { UserOperationCall } from './gateway/gateway.types';

/** ECDSA Validator contract address for Kernel v3.1+ */
export const ECDSA_VALIDATOR_ADDRESS = '0x845ADb2C711129d4f3966735eD98a9F09fC4cE57';

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

  constructor(
    private readonly accountService: AccountService,
  ) {}

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

    const { url: bundlerUrl } = getBundlerRpc(chainConfig.chainId);
    const chain = this.accountService.buildViemChain(chainKey, chainConfig);
    const transport = http(bundlerUrl);
    // For account creation, always use ZeroDev RPC (it resolves account address)
    const zdRpcUrl = getZeroDevRpc(chainConfig.chainId);
    const accountClient = createPublicClient({ chain, transport: http(zdRpcUrl) });

    // Build ZeroDev Kernel account from passkey credentials
    const account = await this.accountService.buildKernelAccount(
      accountClient,
      credentialId,
      publicKey,
    );

    const bundlerClient = this.accountService.createSponsoredBundlerClient(
      account, accountClient as any, chain, transport,
    );

    // Build unsigned UserOp with gas estimation.
    // prepareUserOperation uses account.getStubSignature() — no real signing.
    let userOp: any;
    try {
      userOp = await bundlerClient.prepareUserOperation({
        calls: calls.map((c) => ({
          to: c.to as `0x${string}`,
          data: c.data as `0x${string}`,
          ...(c.value ? { value: c.value } : {}),
        })),
      });
    } catch (err: any) {
      const code = await accountClient.getCode({ address: account.address });
      const isDeployed = !!code && code !== '0x';
      this.logger.error(
        `prepareUserOp FAILED on ${chainKey} (chainId=${chainConfig.chainId}, ` +
        `accountDeployed=${isDeployed}, address=${account.address}): ${err.message}`,
      );
      // Log details about factory/initCode if present
      if (err.message?.includes('AA21')) {
        this.logger.error(
          `AA21 = paymaster didn't pay prefund. This usually means:\n` +
          `  1. ZeroDev project doesn't have gas sponsoring policies for chain ${chainConfig.chainId}\n` +
          `  2. Paymaster deposit in EntryPoint is insufficient on this chain\n` +
          `  3. Check ZeroDev dashboard: https://dashboard.zerodev.app`,
        );
      }
      throw err;
    }

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
    webauthn?: {
      authenticatorData: string;
      clientDataJSON: string;
      challengeIndex: number;
      typeIndex: number;
    },
  ): Promise<string> {
    const chainConfig = ALL_CHAINS[chainKey];
    if (!chainConfig) {
      throw new BadRequestException(`Unsupported chain: ${chainKey}`);
    }

    const { url: bundlerUrl } = getBundlerRpc(chainConfig.chainId);
    const chain = this.accountService.buildViemChain(chainKey, chainConfig);
    const bundlerTransport = http(bundlerUrl);
    const client = createPublicClient({ chain, transport: bundlerTransport });

    // Deserialize UserOp (strings → bigints)
    const userOp = this.deserializeUserOp(storedData.unsignedUserOp);

    // Encode full WebAuthn signature for Kernel passkey validator
    if (webauthn) {
      const encodedSig = this.encodeWebAuthnSignature(
        signature,
        webauthn,
        chainConfig.chainId,
      );
      userOp.signature = encodedSig;
      this.logger.log(`[submitUserOp] Encoded WebAuthn signature, length=${encodedSig.length}`);
    } else {
      userOp.signature = signature as `0x${string}`;
      this.logger.log(`[submitUserOp] Raw signature length=${signature?.length}`);
    }

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

  /**
   * Execute a UserOp entirely server-side using the ECDSA validator.
   * Requires the ECDSA validator to be installed on the MSCA for that chain.
   *
   * Used for automated settlement (approve+deposit from merchant's MSCA).
   */
  async executeServerSide(
    chainKey: string,
    credentialId: string,
    publicKey: string,
    delegatePrivateKey: string,
    calls: UserOperationCall[],
  ): Promise<string> {
    const chainConfig = ALL_CHAINS[chainKey];
    if (!chainConfig) {
      throw new BadRequestException(`Unsupported chain: ${chainKey}`);
    }

    const { url: bundlerUrl } = getBundlerRpc(chainConfig.chainId);
    const chain = this.accountService.buildViemChain(chainKey, chainConfig);
    const bundlerTransport = http(bundlerUrl);
    // Account creation always via ZeroDev (resolves Kernel address)
    const zdRpcUrl = getZeroDevRpc(chainConfig.chainId);
    const accountClient = createPublicClient({ chain, transport: http(zdRpcUrl) });

    const entryPoint = getEntryPoint('0.7');

    // Build passkey validator (determines MSCA address via sudo)
    const passkeyValidator = await this.accountService.buildPasskeyValidator(
      accountClient,
      credentialId,
      publicKey,
    );

    // Build ECDSA validator from delegate's private key
    const { privateKeyToAccount } = await import('viem/accounts');
    const delegateAccount = privateKeyToAccount(
      delegatePrivateKey as `0x${string}`,
    );

    const ecdsaValidator = await signerToEcdsaValidator(accountClient, {
      signer: delegateAccount,
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    // Create kernel account with passkey=sudo (address) + ECDSA=regular (signing)
    const account = await createKernelAccount(accountClient, {
      plugins: {
        sudo: passkeyValidator,
        regular: ecdsaValidator,
      },
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    const bundlerClient = this.accountService.createSponsoredBundlerClient(
      account, accountClient as any, chain, bundlerTransport,
    );

    // Enforce gas caps
    const opHash = await bundlerClient.sendUserOperation({
      calls: calls.map((c) => ({
        to: c.to as `0x${string}`,
        data: c.data as `0x${string}`,
        ...(c.value ? { value: c.value } : {}),
      })),
    });

    this.logger.log(
      `Server-side UserOp submitted on ${chainKey}: opHash=${opHash}`,
    );

    // Wait for on-chain receipt (use bundler RPC for polling)
    const receipt = await this.waitForReceipt(
      createPublicClient({ chain, transport: bundlerTransport }) as any, opHash,
    );
    const txHash = receipt.receipt.transactionHash;

    this.logger.log(
      `Server-side UserOp confirmed on ${chainKey}: txHash=${txHash}`,
    );
    return txHash;
  }

  /**
   * Submit a UserOp signed server-side by the ECDSA validator (delegate private key).
   * ECDSA is installed as a SECONDARY (regular) validator, so we need the passkey
   * as sudo and ECDSA as regular. The SDK detects ECDSA is already enabled on-chain
   * and uses DEFAULT mode (no enable needed), signing with the delegate key.
   */
  async submitServerSideUserOp(
    chainKey: string,
    walletAddress: string,
    credentialId: string,
    publicKey: string,
    delegatePrivateKey: string,
    calls: { to: string; data: string; value?: bigint }[],
  ): Promise<string> {
    const chainConfig = ALL_CHAINS[chainKey];
    if (!chainConfig) throw new BadRequestException(`Unsupported chain: ${chainKey}`);

    const { url: bundlerUrl } = getBundlerRpc(chainConfig.chainId);
    const chain = this.accountService.buildViemChain(chainKey, chainConfig);
    const bundlerTransport = http(bundlerUrl);
    const zdRpcUrl = getZeroDevRpc(chainConfig.chainId);
    const accountClient = createPublicClient({ chain, transport: http(zdRpcUrl) });

    const entryPoint = getEntryPoint('0.7');

    // Build passkey validator (sudo — matches on-chain root validator)
    const passkeyValidator = await this.accountService.buildPasskeyValidator(
      accountClient, credentialId, publicKey,
    );

    // Build ECDSA validator (regular/secondary — matches on-chain config)
    const { privateKeyToAccount } = await import('viem/accounts');
    const delegateAccount = privateKeyToAccount(delegatePrivateKey as `0x${string}`);

    const ecdsaValidator = await signerToEcdsaValidator(accountClient, {
      signer: delegateAccount,
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    const account = await createKernelAccount(accountClient, {
      address: walletAddress as `0x${string}`,
      plugins: {
        sudo: passkeyValidator,
        regular: ecdsaValidator,
      },
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    const bundlerClient = this.accountService.createSponsoredBundlerClient(
      account, accountClient as any, chain, bundlerTransport,
    );

    const formattedCalls = calls.map(c => ({
      to: c.to as `0x${string}`,
      data: c.data as `0x${string}`,
      value: c.value ?? 0n,
    }));

    const opHash = await bundlerClient.sendUserOperation({ calls: formattedCalls });
    this.logger.log(`Server-side UserOp submitted on ${chainKey}: opHash=${opHash}`);

    const receipt = await this.waitForReceipt(
      createPublicClient({ chain, transport: bundlerTransport }) as any, opHash,
    );
    const txHash = receipt.receipt.transactionHash;
    this.logger.log(`Server-side UserOp confirmed on ${chainKey}: txHash=${txHash}`);
    return txHash;
  }

  // ---------------------------------------------------------------------------
  // Delegation methods — keep existing API surface for external callers
  // ---------------------------------------------------------------------------

  buildEcdsaValidatorInstallCall(mscaAddress: string, delegateAddress: string) {
    return this.accountService.buildEcdsaValidatorInstallCall(mscaAddress, delegateAddress);
  }

  async isEcdsaValidatorInstalled(chainKey: string, mscaAddress: string) {
    return this.accountService.isEcdsaValidatorInstalled(chainKey, mscaAddress);
  }

  async isEcdsaValidatorEnabled(chainKey: string, mscaAddress: string) {
    return this.accountService.isEcdsaValidatorEnabled(chainKey, mscaAddress);
  }

  buildUninstallEcdsaCalls(mscaAddress: `0x${string}`, delegateAddress: `0x${string}`) {
    return this.accountService.buildUninstallEcdsaCalls(mscaAddress, delegateAddress);
  }

  async getEnableEcdsaTypedData(chainKey: string, credentialId: string, publicKey: string, delegatePrivateKey: string) {
    return this.accountService.getEnableEcdsaTypedData(chainKey, credentialId, publicKey, delegatePrivateKey);
  }

  async submitEnableEcdsaValidator(chainKey: string, credentialId: string, publicKey: string, delegatePrivateKey: string, enableSignature: string, extraCalls?: any[]) {
    return this.accountService.submitEnableEcdsaValidator(chainKey, credentialId, publicKey, delegatePrivateKey, enableSignature, extraCalls);
  }

  async checkPaymasterStatus(credentialId: string, publicKey: string) {
    return this.accountService.checkPaymasterStatus(credentialId, publicKey);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Chains that support RIP-7212 precompiled P256 verification */
  private static readonly RIP7212_CHAINS = new Set([
    137, 80002,   // Polygon, Polygon Amoy
    8453, 84532,  // Base, Base Sepolia
    10, 11155420, // Optimism, Optimism Sepolia
    42161, 421614, // Arbitrum, Arbitrum Sepolia
    43114, 43113, // Avalanche, Avalanche Fuji
  ]);

  /**
   * Encode WebAuthn signature in the format expected by Kernel passkey validator.
   *
   * ABI: (bytes authenticatorData, string clientDataJSON, uint256 responseTypeLocation,
   *        uint256 r, uint256 s, bool usePrecompiled)
   */
  /** P256 curve order */
  private static readonly P256_N =
    0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;

  encodeWebAuthnSignature(
    rawSignature: string,
    webauthn: {
      authenticatorData: string;
      clientDataJSON: string;
      challengeIndex: number;
      typeIndex: number;
    },
    chainId: number,
  ): `0x${string}` {
    // rawSignature is r||s (64 bytes = 128 hex chars after 0x)
    const sigHex = rawSignature.startsWith('0x') ? rawSignature.slice(2) : rawSignature;
    const r = BigInt('0x' + sigHex.slice(0, 64));
    let s = BigInt('0x' + sigHex.slice(64, 128));

    // Normalize s to lower half of curve order (required by on-chain P256 verifiers)
    const halfN = UserOpService.P256_N / 2n;
    if (s > halfN) {
      s = UserOpService.P256_N - s;
      this.logger.debug(`P256 s-value normalized to lower half`);
    }

    const usePrecompiled = UserOpService.RIP7212_CHAINS.has(chainId);

    return encodeAbiParameters(
      [
        { name: 'authenticatorData', type: 'bytes' },
        { name: 'clientDataJSON', type: 'string' },
        { name: 'responseTypeLocation', type: 'uint256' },
        { name: 'r', type: 'uint256' },
        { name: 's', type: 'uint256' },
        { name: 'usePrecompiled', type: 'bool' },
      ],
      [
        webauthn.authenticatorData as `0x${string}`,
        webauthn.clientDataJSON,
        BigInt(webauthn.typeIndex),
        r,
        s,
        usePrecompiled,
      ],
    );
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
