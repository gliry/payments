import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicClient, defineChain, toHex, keccak256, toBytes, http, encodeAbiParameters, encodeFunctionData, concatHex, parseAbiParameters, hashTypedData, pad, concat, zeroAddress } from 'viem';
import {
  createBundlerClient,
  getUserOperationHash,
} from 'viem/account-abstraction';
import { p256 } from '@noble/curves/nist.js';
import { createKernelAccount, KernelV3_1AccountAbi, createZeroDevPaymasterClient } from '@zerodev/sdk';
import { toPasskeyValidator, PasskeyValidatorContractVersion } from '@zerodev/passkey-validator';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { KERNEL_V3_1, getEntryPoint, VALIDATOR_TYPE, CALL_TYPE } from '@zerodev/sdk/constants';
import { ALL_CHAINS, type ChainConfig } from './config/chains';
import { getZeroDevRpc, getBundlerRpc, PIMLICO_FALLBACK_CHAINS } from './config/bundler';
import type { UserOperationCall } from './gateway/gateway.types';

/** ECDSA Validator contract address for Kernel v3.1+ */
export const ECDSA_VALIDATOR_ADDRESS = '0x845ADb2C711129d4f3966735eD98a9F09fC4cE57';

/** ERC-7579 module type for validators */
const MODULE_TYPE_VALIDATOR = 1n;

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

    const { url: bundlerUrl } = getBundlerRpc(chainConfig.chainId);
    const chain = this.buildViemChain(chainKey, chainConfig);
    const transport = http(bundlerUrl);
    // For account creation, always use ZeroDev RPC (it resolves account address)
    const zdRpcUrl = getZeroDevRpc(chainConfig.chainId);
    const accountClient = createPublicClient({ chain, transport: http(zdRpcUrl) });

    // Build ZeroDev Kernel account from passkey credentials
    const account = await this.buildKernelAccount(
      accountClient,
      credentialId,
      publicKey,
    );

    const bundlerClient = this.createSponsoredBundlerClient(
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
    const chain = this.buildViemChain(chainKey, chainConfig);
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
    const chain = this.buildViemChain(chainKey, chainConfig);
    const bundlerTransport = http(bundlerUrl);
    // Account creation always via ZeroDev (resolves Kernel address)
    const zdRpcUrl = getZeroDevRpc(chainConfig.chainId);
    const accountClient = createPublicClient({ chain, transport: http(zdRpcUrl) });

    const entryPoint = getEntryPoint('0.7');

    // Build passkey validator (determines MSCA address via sudo)
    const passkeyValidator = await this.buildPasskeyValidator(
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

    const bundlerClient = this.createSponsoredBundlerClient(
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
   * Build a call to install the ECDSA validator on the MSCA.
   * This is a self-call (to = MSCA address) that installs the validator module.
   *
   * Kernel v3.1 installModule initData format for VALIDATOR type:
   *   bytes[0:20]  = hook address (zero = no hook)
   *   bytes[20:]   = abi.encode(bytes validatorData, bytes hookData)
   *
   * The ECDSA validator's onInstall expects the signer address as first 20 bytes
   * of validatorData.
   */
  buildEcdsaValidatorInstallCall(
    mscaAddress: string,
    delegateAddress: string,
  ): UserOperationCall {
    // Kernel v3.1 initData: hookAddress (20 bytes) + abi.encode(validatorData, hookData)
    const hookAddress = '0x0000000000000000000000000000000000000000' as `0x${string}`;

    const validatorAndHookData = encodeAbiParameters(
      parseAbiParameters('bytes validatorData, bytes hookData'),
      [delegateAddress as `0x${string}`, '0x'],
    );

    const initData = concatHex([hookAddress, validatorAndHookData]);

    const callData = encodeFunctionData({
      abi: KernelV3_1AccountAbi,
      functionName: 'installModule',
      args: [MODULE_TYPE_VALIDATOR, ECDSA_VALIDATOR_ADDRESS as `0x${string}`, initData],
    });

    return { to: mscaAddress, data: callData };
  }

  /**
   * Check if the ECDSA validator module is installed on a deployed MSCA.
   */
  async isEcdsaValidatorInstalled(
    chainKey: string,
    mscaAddress: string,
  ): Promise<boolean> {
    const chainConfig = ALL_CHAINS[chainKey];
    if (!chainConfig) return false;

    try {
      const client = createPublicClient({ transport: http(chainConfig.rpc) });

      // Check if MSCA has code (is deployed)
      const code = await client.getCode({
        address: mscaAddress as `0x${string}`,
      });
      if (!code || code === '0x') return false;

      return (await client.readContract({
        address: mscaAddress as `0x${string}`,
        abi: KernelV3_1AccountAbi,
        functionName: 'isModuleInstalled',
        args: [MODULE_TYPE_VALIDATOR, ECDSA_VALIDATOR_ADDRESS as `0x${string}`, '0x'],
      })) as boolean;
    } catch {
      return false;
    }
  }

  /**
   * Check if the ECDSA validator is fully enabled for UserOp execution
   * (not just installed as module, but authorized for the execute selector).
   */
  async isEcdsaValidatorEnabled(
    chainKey: string,
    mscaAddress: string,
  ): Promise<boolean> {
    const chainConfig = ALL_CHAINS[chainKey];
    if (!chainConfig) return false;

    try {
      const client = createPublicClient({ transport: http(chainConfig.rpc) });
      const code = await client.getCode({ address: mscaAddress as `0x${string}` });
      if (!code || code === '0x') return false;

      // ValidationId = bytes21(0x01 || ecdsaValidatorAddress)
      const validationId = concat([
        VALIDATOR_TYPE.SECONDARY as `0x${string}`,
        pad(ECDSA_VALIDATOR_ADDRESS as `0x${string}`, { size: 20, dir: 'right' }),
      ]);

      // Check if validator is authorized for the execute(bytes32,bytes) selector
      const EXECUTE_SELECTOR = '0xe9ae5c53' as `0x${string}`;
      return (await client.readContract({
        address: mscaAddress as `0x${string}`,
        abi: KernelV3_1AccountAbi,
        functionName: 'isAllowedSelector',
        args: [validationId, EXECUTE_SELECTOR],
      })) as boolean;
    } catch {
      return false;
    }
  }

  /**
   * Build uninstallModule calls for the ECDSA validator.
   * Used when module is installed (isInitialized=true) but not enabled (isAllowedSelector=false).
   * Must be sent as a UserOp signed by sudo (passkey) before the enable UserOp.
   */
  buildUninstallEcdsaCalls(
    mscaAddress: `0x${string}`,
    delegateAddress: `0x${string}`,
  ): { to: `0x${string}`; data: `0x${string}` }[] {
    return [{
      to: mscaAddress,
      data: encodeFunctionData({
        abi: KernelV3_1AccountAbi,
        functionName: 'uninstallModule',
        args: [MODULE_TYPE_VALIDATOR, ECDSA_VALIDATOR_ADDRESS as `0x${string}`, delegateAddress],
      }),
    }];
  }

  /**
   * Build the EIP-712 typed data for enabling the ECDSA validator on a Kernel v3.1 account.
   * The hash of this typed data must be signed by the sudo (passkey) validator.
   */
  async getEnableEcdsaTypedData(
    chainKey: string,
    credentialId: string,
    publicKey: string,
    delegatePrivateKey: string,
  ) {
    const chainConfig = ALL_CHAINS[chainKey];
    if (!chainConfig) throw new BadRequestException(`Unsupported chain: ${chainKey}`);

    const zdRpcUrl = getZeroDevRpc(chainConfig.chainId);
    const chain = this.buildViemChain(chainKey, chainConfig);
    const client = createPublicClient({ chain, transport: http(zdRpcUrl) });

    const entryPoint = getEntryPoint('0.7');

    // Build passkey validator (sudo) and ECDSA validator (regular)
    const passkeyValidator = await this.buildPasskeyValidator(
      client, credentialId, publicKey,
    );

    const { privateKeyToAccount } = await import('viem/accounts');
    const delegateAccount = privateKeyToAccount(delegatePrivateKey as `0x${string}`);

    const ecdsaValidator = await signerToEcdsaValidator(client, {
      signer: delegateAccount,
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    // Intercept sudo's signTypedData to capture the enable typed data
    // that the SDK computes internally — guarantees hash matches the UserOp
    let capturedTypedData: any = null;
    const originalSign = passkeyValidator.signTypedData;
    passkeyValidator.signTypedData = async (td: any) => {
      capturedTypedData = td;
      // Return dummy signature — we only need the typed data
      return ('0x' + 'ff'.repeat(65)) as `0x${string}`;
    };

    const account = await createKernelAccount(client, {
      plugins: {
        sudo: passkeyValidator,
        regular: ecdsaValidator,
      },
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    // Trigger signUserOperation to invoke the enable flow (calls signTypedData)
    if (!capturedTypedData) {
      try {
        await account.signUserOperation({
          callData: '0x' as `0x${string}`,
          callGasLimit: 0n,
          maxFeePerGas: 1n,
          maxPriorityFeePerGas: 1n,
          nonce: 0n,
          preVerificationGas: 0n,
          sender: account.address,
          signature: '0x' as `0x${string}`,
          verificationGasLimit: 0n,
        });
      } catch {
        // Expected — we just need the typed data capture
      }
    }

    // Restore original
    passkeyValidator.signTypedData = originalSign;

    if (!capturedTypedData) {
      throw new BadRequestException('Failed to compute enable typed data from SDK');
    }

    const enableHash = hashTypedData(capturedTypedData);

    return {
      typedData: capturedTypedData,
      enableHash,
      mscaAddress: account.address,
      chainId: chainConfig.chainId,
    };
  }

  /**
   * Submit the ECDSA validator enable UserOp.
   * Uses the SDK's `pluginEnableSignature` option to pass the pre-signed
   * passkey enable signature, bypassing the need for sudo.signTypedData().
   *
   * Flow: passkey signs EIP-712 enable hash → ECDSA signs UserOp hash → combined
   */
  async submitEnableEcdsaValidator(
    chainKey: string,
    credentialId: string,
    publicKey: string,
    delegatePrivateKey: string,
    enableSignature: string,
    extraCalls?: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[],
  ): Promise<string> {
    const chainConfig = ALL_CHAINS[chainKey];
    if (!chainConfig) throw new BadRequestException(`Unsupported chain: ${chainKey}`);

    const { url: bundlerUrl } = getBundlerRpc(chainConfig.chainId);
    const chain = this.buildViemChain(chainKey, chainConfig);
    const bundlerTransport = http(bundlerUrl);
    const zdRpcUrl = getZeroDevRpc(chainConfig.chainId);
    const accountClient = createPublicClient({ chain, transport: http(zdRpcUrl) });

    const entryPoint = getEntryPoint('0.7');

    // Build passkey validator (determines MSCA address)
    const passkeyValidator = await this.buildPasskeyValidator(
      accountClient, credentialId, publicKey,
    );

    // Build ECDSA validator from delegate's private key
    const { privateKeyToAccount } = await import('viem/accounts');
    const delegateAccount = privateKeyToAccount(delegatePrivateKey as `0x${string}`);

    const ecdsaValidator = await signerToEcdsaValidator(accountClient, {
      signer: delegateAccount,
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    // NOTE: If the ECDSA module was previously installed (isInitialized=true),
    // the caller must have already submitted an uninstall UserOp before calling this.
    // Otherwise the SDK detects isPluginInitialized=true → DEFAULT mode → AA23.

    // Create kernel account with regular=ECDSA and the pre-signed enable signature.
    // Since isPluginInitialized should be false, SDK will use ENABLE mode.
    const account = await createKernelAccount(accountClient, {
      plugins: {
        sudo: passkeyValidator,
        regular: ecdsaValidator,
        pluginEnableSignature: enableSignature as `0x${string}`,
      },
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    const bundlerClient = this.createSponsoredBundlerClient(
      account, accountClient as any, chain, bundlerTransport,
    );

    // If extra calls provided (e.g. addDelegate), include them; otherwise dummy call
    const calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] =
      extraCalls && extraCalls.length > 0
        ? extraCalls
        : [{ to: zeroAddress, data: '0x' as `0x${string}`, value: 0n }];

    const opHash = await bundlerClient.sendUserOperation({ calls });

    this.logger.log(`Enable ECDSA validator UserOp submitted on ${chainKey}: opHash=${opHash}`);

    const receipt = await this.waitForReceipt(
      createPublicClient({ chain, transport: bundlerTransport }) as any, opHash,
    );
    const txHash = receipt.receipt.transactionHash;

    this.logger.log(`Enable ECDSA validator confirmed on ${chainKey}: txHash=${txHash}`);
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
    const chain = this.buildViemChain(chainKey, chainConfig);
    const bundlerTransport = http(bundlerUrl);
    const zdRpcUrl = getZeroDevRpc(chainConfig.chainId);
    const accountClient = createPublicClient({ chain, transport: http(zdRpcUrl) });

    const entryPoint = getEntryPoint('0.7');

    // Build passkey validator (sudo — matches on-chain root validator)
    const passkeyValidator = await this.buildPasskeyValidator(
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

    const bundlerClient = this.createSponsoredBundlerClient(
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

  /**
   * Build a passkey validator from credentials.
   */
  private async buildPasskeyValidator(
    client: any,
    credentialId: string,
    publicKey: string,
  ) {
    const cleanKey = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;
    const point = p256.Point.fromHex(cleanKey);
    const authenticatorIdHash = keccak256(toBytes(credentialId));

    const entryPoint = getEntryPoint('0.7');

    return toPasskeyValidator(client, {
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
  }

  /**
   * Build a ZeroDev Kernel account from passkey credentials.
   */
  private async buildKernelAccount(
    client: any,
    credentialId: string,
    publicKey: string,
  ) {
    const passkeyValidator = await this.buildPasskeyValidator(
      client,
      credentialId,
      publicKey,
    );

    const entryPoint = getEntryPoint('0.7');

    return createKernelAccount(client, {
      plugins: { sudo: passkeyValidator },
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });
  }

  /**
   * Create a bundler client with gas sponsoring.
   *
   * For ZeroDev chains: uses `zd_sponsorUserOperation` which handles
   * gas estimation + sponsoring atomically.
   *
   * For Pimlico fallback chains (Base, Optimism, Arbitrum): uses ERC-7677
   * standard `pm_getPaymasterStubData` / `pm_getPaymasterData` via
   * Pimlico's RPC which bundles both bundler and paymaster.
   */
  private createSponsoredBundlerClient(
    account: any,
    client: any,
    chain: any,
    transport: any,
  ) {
    const { url: bundlerUrl, provider } = getBundlerRpc(chain.id);

    if (provider === 'pimlico') {
      // Pimlico: standard ERC-7677 paymaster via their unified RPC
      const pimlicoTransport = http(bundlerUrl);
      return createBundlerClient({
        account,
        client,
        transport: pimlicoTransport,
        paymaster: true, // ERC-7677: bundler RPC handles pm_getPaymasterStubData
        userOperation: {
          estimateFeesPerGas: this.feeEstimator(chain),
        },
      }) as any;
    }

    // ZeroDev: custom zd_sponsorUserOperation
    const rpcUrl = getZeroDevRpc(chain.id);
    const paymasterClient = createZeroDevPaymasterClient({
      chain,
      transport: http(rpcUrl),
    });

    return createBundlerClient({
      account,
      client,
      transport,
      paymaster: {
        async getPaymasterData(userOperation: any) {
          return paymasterClient.sponsorUserOperation({
            userOperation,
          });
        },
      },
      userOperation: {
        estimateFeesPerGas: this.feeEstimator(chain),
      },
    }) as any;
  }

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
   * Gas fee estimator — queries the chain's NATIVE RPC for real EIP-1559 fee
   * data, then queries the bundler (Pimlico) for its minimum gas price.
   * Uses the maximum of both to ensure the UserOp is accepted.
   */
  private feeEstimator(chain: any) {
    return async () => {
      const chainConfig = Object.values(ALL_CHAINS).find(
        (c) => c.chainId === chain.id,
      ) as ChainConfig | undefined;
      const nativeRpc = chainConfig?.rpc ?? chain.rpcUrls.default.http[0];

      // 1. Query bundler gas price (Pimlico-specific)
      let bundlerMaxFee = 0n;
      let bundlerPriority = 0n;
      try {
        const { url: bundlerUrl, provider } = getBundlerRpc(chain.id);
        if (provider === 'pimlico') {
          const bRes = await fetch(bundlerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'pimlico_getUserOperationGasPrice',
              params: [],
            }),
          });
          const bData = await bRes.json();
          if (bData.result?.fast) {
            bundlerMaxFee = BigInt(bData.result.fast.maxFeePerGas);
            bundlerPriority = BigInt(bData.result.fast.maxPriorityFeePerGas);
            this.logger.debug(
              `Bundler gas price chain ${chain.id}: maxFee=${bundlerMaxFee}, priority=${bundlerPriority}`,
            );
          }
        }
      } catch (err) {
        this.logger.warn(`Bundler gas price query failed for chain ${chain.id}: ${err}`);
      }

      // 2. Query native chain RPC for EIP-1559 fee data
      let chainMaxFee = 0n;
      let chainPriority = 0n;
      try {
        const feeRes = await fetch(nativeRpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_feeHistory',
            params: ['0x4', 'latest', [50, 75]],
          }),
        });
        const feeData = await feeRes.json();

        if (feeData.result?.baseFeePerGas?.length) {
          const baseFees = feeData.result.baseFeePerGas.map((f: string) => BigInt(f));
          const peakBaseFee = baseFees.reduce((a: bigint, b: bigint) => a > b ? a : b);

          const rewards = feeData.result.reward ?? [];
          let maxPriorityFee = 1_500_000_000n;
          if (rewards.length > 0) {
            const allTips = rewards.flatMap((r: string[]) => r.map((v: string) => BigInt(v)));
            maxPriorityFee = allTips.reduce((a: bigint, b: bigint) => a > b ? a : b);
          }

          // Buffer: 2x base fee + 1.5x priority
          chainPriority = maxPriorityFee * 3n / 2n;
          chainMaxFee = peakBaseFee * 2n + chainPriority;
        }
      } catch (err) {
        this.logger.warn(`EIP-1559 fee estimation failed for chain ${chain.id}: ${err}`);
      }

      // Fallback: legacy eth_gasPrice
      if (chainMaxFee === 0n) {
        try {
          const fallbackRes = await fetch(nativeRpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_gasPrice',
              params: [],
            }),
          });
          const fallbackData = await fallbackRes.json();
          const gasPrice = BigInt(fallbackData.result);
          chainMaxFee = gasPrice > 100_000n ? gasPrice * 2n : 100_000n;
          chainPriority = chainMaxFee;
        } catch (err) {
          this.logger.warn(`Legacy gas price failed for chain ${chain.id}: ${err}`);
        }
      }

      // 3. Use the maximum of chain estimate and bundler minimum
      let maxFeePerGas = chainMaxFee > bundlerMaxFee ? chainMaxFee : bundlerMaxFee;
      let maxPriorityFeePerGas = chainPriority > bundlerPriority ? chainPriority : bundlerPriority;

      // Enforce per-chain minimum
      const minFee = MIN_FEE_PER_GAS[chain.id] ?? 100_000n;
      if (maxFeePerGas < minFee) maxFeePerGas = minFee;
      if (maxPriorityFeePerGas > maxFeePerGas) maxPriorityFeePerGas = maxFeePerGas;

      this.logger.debug(
        `Fee estimate chain ${chain.id}: chainFee=${chainMaxFee}, bundlerFee=${bundlerMaxFee}, ` +
        `final maxFee=${maxFeePerGas}, priority=${maxPriorityFeePerGas}`,
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

  /**
   * Diagnostic: check if the ZeroDev paymaster is responsive and willing to
   * sponsor operations on each supported chain. Returns per-chain status.
   */
  /**
   * Diagnostic: try to build a kernel account + prepare a dummy UserOp
   * on each chain. Reports MSCA deployment state, factory info, and
   * whether gas estimation + paymaster sponsoring works.
   */
  async checkPaymasterStatus(
    credentialId: string,
    publicKey: string,
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    await Promise.all(
      Object.entries(ALL_CHAINS).map(async ([chainKey, chainConfig]) => {
        const entry: any = { chainId: chainConfig.chainId };
        try {
          const rpcUrl = getZeroDevRpc(chainConfig.chainId);
          const chain = this.buildViemChain(chainKey, chainConfig);
          const transport = http(rpcUrl);
          const client = createPublicClient({ chain, transport });

          // 1. Build kernel account (determines address + factory)
          const account = await this.buildKernelAccount(
            client,
            credentialId,
            publicKey,
          );
          entry.mscaAddress = account.address;

          // 2. Check if MSCA is deployed on-chain
          const code = await client.getCode({ address: account.address });
          entry.mscaDeployed = !!code && code !== '0x' && code.length > 2;

          // 3. Check factory info from the account
          try {
            const acct = account as any;
            const factoryAddr = typeof acct.getFactory === 'function'
              ? await acct.getFactory() : acct.factory;
            const factoryCalldata = typeof acct.getFactoryArgs === 'function'
              ? await acct.getFactoryArgs() : acct.factoryData;
            entry.factory = factoryAddr ?? null;
            entry.hasFactoryData = !!factoryCalldata;
          } catch { /* skip */ }

          // 4. Check Kernel v3.1 infrastructure contracts
          // SDK mapping (from @zerodev/sdk constants):
          //   accountImplementationAddress: 0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D (actual Kernel logic)
          //   factoryAddress:               0xaac5D4240AF87249B3f71bC8E4A2cAe074A3E419 (factory)
          //   metaFactoryAddress:           0xd703aaE79538628d27099B8c4f621bE4CCd142d5 (meta factory)
          const KERNEL_ACCOUNT_IMPL = '0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D' as `0x${string}`;
          const KERNEL_IMPL = '0xaac5D4240AF87249B3f71bC8E4A2cAe074A3E419' as `0x${string}`;
          const PASSKEY_VALIDATOR = '0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69' as `0x${string}`;
          const KERNEL_FACTORY = '0xd703aaE79538628d27099B8c4f621bE4CCd142d5' as `0x${string}`;
          try {
            const nativeCheck = createPublicClient({ transport: http(chainConfig.rpc) });
            const [accountImplCode, implCode, validatorCode, factoryCode] = await Promise.all([
              nativeCheck.getCode({ address: KERNEL_ACCOUNT_IMPL }),
              nativeCheck.getCode({ address: KERNEL_IMPL }),
              nativeCheck.getCode({ address: PASSKEY_VALIDATOR }),
              nativeCheck.getCode({ address: KERNEL_FACTORY }),
            ]);
            entry.contracts = {
              accountImplementation: {
                address: KERNEL_ACCOUNT_IMPL,
                deployed: !!accountImplCode && accountImplCode !== '0x' && accountImplCode.length > 2,
                size: accountImplCode ? accountImplCode.length / 2 - 1 : 0,
              },
              kernelFactory_aac5: {
                address: KERNEL_IMPL,
                deployed: !!implCode && implCode.length > 2,
                size: implCode ? implCode.length / 2 - 1 : 0,
              },
              passkeyValidator: {
                address: PASSKEY_VALIDATOR,
                deployed: !!validatorCode && validatorCode.length > 2,
                bytecodeHash: validatorCode && validatorCode.length > 2 ? keccak256(validatorCode) : null,
                size: validatorCode ? validatorCode.length / 2 - 1 : 0,
              },
              kernelFactory: {
                address: KERNEL_FACTORY,
                deployed: !!factoryCode && factoryCode.length > 2,
                bytecodeHash: factoryCode && factoryCode.length > 2 ? keccak256(factoryCode) : null,
                size: factoryCode ? factoryCode.length / 2 - 1 : 0,
              },
            };
          } catch { /* skip */ }

          // 5. Check known paymasters deposit in EntryPoint v0.7
          const KNOWN_PAYMASTER = '0x777777777777AeC03fd955926DbF81597e66834C' as `0x${string}`;
          const ALT_PAYMASTER = '0x2cc0c7981D846b9F2a16276556f6e8cb52BfB633' as `0x${string}`;
          const ENTRYPOINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as `0x${string}`;
          try {
            const nativeClient = createPublicClient({ transport: http(chainConfig.rpc) });
            const balanceOfAbi = [{
              name: 'balanceOf', type: 'function', stateMutability: 'view',
              inputs: [{ name: 'account', type: 'address' }],
              outputs: [{ name: '', type: 'uint256' }],
            }] as const;

            const [pmCode, altPmCode] = await Promise.all([
              nativeClient.getCode({ address: KNOWN_PAYMASTER }),
              nativeClient.getCode({ address: ALT_PAYMASTER }),
            ]);

            entry.paymasters = {};

            // ZeroDev paymaster 0x777...
            const pmDeployed = !!pmCode && pmCode !== '0x' && pmCode.length > 2;
            if (pmDeployed) {
              const deposit = await nativeClient.readContract({
                address: ENTRYPOINT_V07, abi: balanceOfAbi,
                functionName: 'balanceOf', args: [KNOWN_PAYMASTER],
              });
              entry.paymasters['0x777...'] = {
                address: KNOWN_PAYMASTER,
                deployed: true,
                deposit: `${(Number(deposit) / 1e18).toFixed(6)} ${chainConfig.nativeCurrency.symbol}`,
              };
            } else {
              entry.paymasters['0x777...'] = { address: KNOWN_PAYMASTER, deployed: false };
            }

            // Alternative paymaster 0x2cc0c... (seen active on Base)
            const altDeployed = !!altPmCode && altPmCode !== '0x' && altPmCode.length > 2;
            if (altDeployed) {
              const altDeposit = await nativeClient.readContract({
                address: ENTRYPOINT_V07, abi: balanceOfAbi,
                functionName: 'balanceOf', args: [ALT_PAYMASTER],
              });
              entry.paymasters['0x2cc...'] = {
                address: ALT_PAYMASTER,
                deployed: true,
                deposit: `${(Number(altDeposit) / 1e18).toFixed(6)} ${chainConfig.nativeCurrency.symbol}`,
                size: altPmCode!.length / 2 - 1,
              };
            } else {
              entry.paymasters['0x2cc...'] = { address: ALT_PAYMASTER, deployed: false };
            }
          } catch { /* skip */ }

          // 6. Extract dependency addresses from passkey validator bytecode
          //    and check if they have code on this chain
          if (!entry.mscaDeployed) {
            try {
              const nativeClient = createPublicClient({ transport: http(chainConfig.rpc) });
              const validatorCode = await nativeClient.getCode({ address: PASSKEY_VALIDATOR });

              if (validatorCode && validatorCode.length > 2) {
                // Scan bytecode for PUSH20 (0x73) opcodes to find embedded addresses
                const hex = validatorCode.slice(2); // remove 0x
                const addresses = new Set<string>();
                for (let i = 0; i < hex.length - 40; i += 2) {
                  const opcode = hex.slice(i, i + 2);
                  if (opcode === '73') { // PUSH20
                    const addr = '0x' + hex.slice(i + 2, i + 42);
                    // Filter: skip zero-ish addresses, self-references, and small values
                    if (addr !== PASSKEY_VALIDATOR.toLowerCase() &&
                        addr !== KERNEL_IMPL.toLowerCase() &&
                        addr !== KERNEL_FACTORY.toLowerCase() &&
                        !addr.startsWith('0x000000000000000000000000000000') &&
                        addr !== '0xffffffffffffffffffffffffffffffffffffffff') {
                      addresses.add(addr);
                    }
                    i += 40; // skip the address bytes
                  }
                }

                // Also scan kernelImpl bytecode for dependencies
                const implCode = await nativeClient.getCode({ address: KERNEL_IMPL });
                if (implCode && implCode.length > 2) {
                  const implHex = implCode.slice(2);
                  for (let i = 0; i < implHex.length - 40; i += 2) {
                    const opcode = implHex.slice(i, i + 2);
                    if (opcode === '73') {
                      const addr = '0x' + implHex.slice(i + 2, i + 42);
                      if (!addr.startsWith('0x000000000000000000000000000000') &&
                          addr !== '0xffffffffffffffffffffffffffffffffffffffff') {
                        addresses.add(addr);
                      }
                    }
                  }
                }

                // Also scan factory bytecode
                const factoryCode = await nativeClient.getCode({ address: KERNEL_FACTORY });
                if (factoryCode && factoryCode.length > 2) {
                  const factHex = factoryCode.slice(2);
                  for (let i = 0; i < factHex.length - 40; i += 2) {
                    const opcode = factHex.slice(i, i + 2);
                    if (opcode === '73') {
                      const addr = '0x' + factHex.slice(i + 2, i + 42);
                      if (!addr.startsWith('0x000000000000000000000000000000') &&
                          addr !== '0xffffffffffffffffffffffffffffffffffffffff') {
                        addresses.add(addr);
                      }
                    }
                  }
                }

                // Check each dependency address on this chain AND on Polygon
                const deps: Record<string, any> = {};
                const polygonClient = createPublicClient({ transport: http(ALL_CHAINS['polygon']?.rpc || chainConfig.rpc) });

                for (const addr of addresses) {
                  try {
                    const [code, polyCode] = await Promise.all([
                      nativeClient.getCode({ address: addr as `0x${string}` }),
                      polygonClient.getCode({ address: addr as `0x${string}` }),
                    ]);
                    const hasCode = !!code && code !== '0x' && code.length > 2;
                    const hasCodeOnPoly = !!polyCode && polyCode !== '0x' && polyCode.length > 2;
                    deps[addr] = {
                      deployed: hasCode,
                      size: code ? code.length / 2 - 1 : 0,
                      deployedOnPolygon: hasCodeOnPoly,
                      polySize: polyCode ? polyCode.length / 2 - 1 : 0,
                      MISMATCH: hasCode !== hasCodeOnPoly ? '⚠ DIFFERENT!' : undefined,
                    };
                  } catch { /* skip */ }
                }

                entry.dependencyContracts = deps;
                entry.dependencyCount = addresses.size;
              }
            } catch (err: any) {
              entry.dependencyCheck = { error: err.message };
            }
          }

          // 7. Direct paymaster probe — call pm_getPaymasterStubData raw
          //    to see if paymaster responds before bundler simulation
          if (!entry.mscaDeployed) {
            try {
              const rpcUrl = getZeroDevRpc(chainConfig.chainId);
              const acct = account as any;
              let factoryAddr: string | undefined;
              let fData: string | undefined;
              if (typeof acct.generateInitCode === 'function') {
                const initCode = await acct.generateInitCode();
                if (initCode && initCode.length > 42) {
                  factoryAddr = '0x' + initCode.slice(2, 42);
                  fData = '0x' + initCode.slice(42);
                }
              }

              const stubUserOp = {
                sender: account.address,
                nonce: '0x0',
                callData: '0x',
                factory: factoryAddr ?? '0xd703aaE79538628d27099B8c4f621bE4CCd142d5',
                factoryData: fData ?? '0x',
                maxFeePerGas: '0x1',
                maxPriorityFeePerGas: '0x1',
                callGasLimit: '0x1',
                verificationGasLimit: '0x100000',
                preVerificationGas: '0x10000',
                signature: '0x',
              };

              // Try ERC-7677 pm_getPaymasterStubData
              const pmRes = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0', id: 1,
                  method: 'pm_getPaymasterStubData',
                  params: [
                    stubUserOp,
                    '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
                    toHex(chainConfig.chainId),
                    {},
                  ],
                }),
              });
              const pmData = await pmRes.json();
              entry.paymasterStubData = pmData.error
                ? { success: false, error: pmData.error.message, code: pmData.error.code }
                : { success: true, hasPaymaster: !!pmData.result?.paymaster, paymaster: pmData.result?.paymaster };

              // Also try zd_sponsorUserOperation directly
              const zdRes = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0', id: 2,
                  method: 'zd_sponsorUserOperation',
                  params: [{
                    chainId: chainConfig.chainId,
                    userOp: stubUserOp,
                    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
                    shouldOverrideFee: true,
                    shouldConsume: false,
                  }],
                }),
              });
              const zdData = await zdRes.json();
              entry.zdSponsor = zdData.error
                ? { success: false, error: zdData.error.message, code: zdData.error.code }
                : { success: true, hasPaymaster: !!zdData.result };
            } catch (pmErr: any) {
              entry.paymasterProbeError = pmErr.message;
            }
          }

          // 8. Try to prepare a real UserOp (dummy self-call with 0 value)
          const bundlerClient = this.createSponsoredBundlerClient(
            account, client as any, chain, transport,
          );

          try {
            const userOp = await bundlerClient.prepareUserOperation({
              calls: [
                {
                  to: account.address,
                  data: '0x' as `0x${string}`,
                  value: 0n,
                },
              ],
            });

            entry.prepareSuccess = true;
            entry.hasPaymaster = !!userOp.paymaster;
            entry.paymaster = userOp.paymaster;
            entry.gasEstimate = {
              callGasLimit: userOp.callGasLimit?.toString(),
              verificationGasLimit: userOp.verificationGasLimit?.toString(),
              preVerificationGas: userOp.preVerificationGas?.toString(),
              maxFeePerGas: userOp.maxFeePerGas?.toString(),
            };
          } catch (prepErr: any) {
            entry.prepareSuccess = false;
            entry.prepareError = prepErr.shortMessage || prepErr.message?.slice(0, 200);

            // Extract details from error if available
            if (prepErr.details) entry.errorDetails = prepErr.details;
          }

          results[chainKey] = entry;
        } catch (err: any) {
          entry.error = err.message;
          results[chainKey] = entry;
        }
      }),
    );

    return results;
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
