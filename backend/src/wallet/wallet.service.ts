import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createPublicClient, http } from 'viem';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
import { UserOpService } from '../circle/userop.service';
import { AA_GATEWAY_CHAINS, ALL_CHAINS } from '../circle/config/chains';
import { getBundlerRpc } from '../circle/config/bundler';
import { GATEWAY_WALLET } from '../circle/config/gateway';
import { GATEWAY_WALLET_DELEGATE_ABI } from '../circle/gateway/gateway.operations';
import { PrepareDelegateDto } from './dto/prepare-delegate.dto';
import { SubmitDelegateDto } from './dto/submit-delegate.dto';
import { PrepareUserOpDto } from './dto/prepare-userop.dto';
import { SubmitUserOpDto } from './dto/submit-userop.dto';

/** In-memory store for prepared UserOps awaiting signature (short-lived, ~10s TTL) */
interface PendingUserOp {
  userId: string;
  chain: string;
  unsignedUserOp: Record<string, any>;
  entryPointAddress: string;
  entryPointVersion: string;
  createdAt: number;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly pendingUserOps = new Map<string, PendingUserOp>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly circleService: CircleService,
    private readonly userOpService: UserOpService,
  ) {
    // Purge stale entries every 60s
    setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of this.pendingUserOps) {
        if (now - entry.createdAt > 120_000) this.pendingUserOps.delete(id);
      }
    }, 60_000);
  }

  async getWalletInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { delegateSetups: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const supportedChains = Object.keys(AA_GATEWAY_CHAINS);
    const delegateStatuses: Record<string, string> = {};
    for (const chain of supportedChains) {
      const setup = user.delegateSetups.find((d) => d.chain === chain);
      delegateStatuses[chain] = setup?.status ?? 'NOT_SETUP';
    }

    return {
      walletAddress: user.walletAddress,
      delegateAddress: user.delegateAddress,
      supportedChains,
      bundlerRpcs: Object.fromEntries(
        supportedChains.map((chain) => [
          chain,
          getBundlerRpc(AA_GATEWAY_CHAINS[chain].chainId).url,
        ]),
      ),
      delegateStatuses,
    };
  }

  async getExecutorStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const chains = Object.keys(AA_GATEWAY_CHAINS);
    const results: Record<string, {
      delegateConfirmed: boolean;
      ecdsaValidatorInstalled: boolean;
      ecdsaValidatorEnabled: boolean;
    }> = {};

    await Promise.all(
      chains.map(async (chain) => {
        const delegate = await this.prisma.delegateSetup.findUnique({
          where: { userId_chain: { userId, chain } },
        });
        const [ecdsaInstalled, ecdsaEnabled] = await Promise.all([
          this.userOpService.isEcdsaValidatorInstalled(chain, user.walletAddress),
          this.userOpService.isEcdsaValidatorEnabled(chain, user.walletAddress),
        ]);
        results[chain] = {
          delegateConfirmed: delegate?.status === 'CONFIRMED',
          ecdsaValidatorInstalled: ecdsaInstalled,
          ecdsaValidatorEnabled: ecdsaEnabled,
        };
      }),
    );

    return {
      walletAddress: user.walletAddress,
      delegateAddress: user.delegateAddress,
      chains: results,
    };
  }

  async getBalances(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    return this.circleService.getAggregatedBalances(user.walletAddress);
  }

  async prepareDelegate(userId: string, dto: PrepareDelegateDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!(dto.chain in AA_GATEWAY_CHAINS)) {
      throw new BadRequestException(
        `Chain ${dto.chain} does not support Gateway. Supported: ${Object.keys(AA_GATEWAY_CHAINS).join(', ')}`,
      );
    }

    // Build delegate setup calls (addDelegate on GatewayWallet)
    const calls = this.circleService.buildDelegateCallData(
      dto.chain,
      user.delegateAddress,
    );

    // NOTE: ECDSA validator is NOT installed via installModule here.
    // installModule only registers the module but does NOT authorize it for
    // the execute selector (isAllowedSelector returns false).
    // Use POST /wallet/enable-executor after delegate setup to fully enable
    // the ECDSA validator through the Kernel Enable flow (EIP-712 signed by passkey).

    // Prepare UserOp server-side so frontend only needs to sign the hash
    const prepared = await this.userOpService.prepareUserOp(
      dto.chain,
      user.credentialId,
      user.publicKey,
      calls,
    );

    const setup = await this.prisma.delegateSetup.upsert({
      where: { userId_chain: { userId, chain: dto.chain } },
      create: {
        userId,
        chain: dto.chain,
        status: 'AWAITING_SIGNATURE',
        unsignedUserOp: prepared.unsignedUserOp as any,
      },
      update: {
        status: 'AWAITING_SIGNATURE',
        errorMessage: null,
        unsignedUserOp: prepared.unsignedUserOp as any,
      },
    });

    return {
      delegateSetupId: setup.id,
      chain: dto.chain,
      delegateAddress: user.delegateAddress,
      userOpHash: prepared.userOpHash,
      description: `Add delegate ${user.delegateAddress} for USDC on ${dto.chain}`,
    };
  }

  async submitDelegate(userId: string, dto: SubmitDelegateDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const setup = await this.prisma.delegateSetup.findUnique({
      where: { userId_chain: { userId, chain: dto.chain } },
    });

    if (!setup) {
      throw new NotFoundException(
        `No delegate setup found for chain ${dto.chain}`,
      );
    }

    if (!setup.unsignedUserOp) {
      throw new BadRequestException(
        'No prepared UserOp found — call POST /v1/wallet/delegate first',
      );
    }

    const chainConfig = ALL_CHAINS[dto.chain];
    if (!chainConfig) {
      throw new BadRequestException(`Unknown chain: ${dto.chain}`);
    }

    // Submit signed UserOp to bundler
    const txHash = await this.userOpService.submitUserOp(
      dto.chain,
      {
        unsignedUserOp: setup.unsignedUserOp as Record<string, any>,
        entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
        entryPointVersion: '0.7',
      },
      dto.signature,
      dto.webauthn,
    );

    this.logger.log(
      `Delegate UserOp submitted: txHash=${txHash} for ${user.walletAddress} on ${dto.chain}`,
    );

    // Verify delegate is actually registered on the Gateway contract
    const client = createPublicClient({
      transport: http(chainConfig.rpc),
    });

    let isAuthorized = false;
    try {
      isAuthorized = await client.readContract({
        address: GATEWAY_WALLET as `0x${string}`,
        abi: GATEWAY_WALLET_DELEGATE_ABI,
        functionName: 'isAuthorizedForBalance',
        args: [
          chainConfig.usdc as `0x${string}`,
          user.walletAddress as `0x${string}`,
          user.delegateAddress as `0x${string}`,
        ],
      }) as boolean;
    } catch (err) {
      this.logger.warn(`Delegate on-chain check failed (may need time): ${err}`);
    }

    const status = isAuthorized ? 'CONFIRMED' : 'SUBMITTED';

    await this.prisma.delegateSetup.update({
      where: { id: setup.id },
      data: {
        status,
        txHash,
        errorMessage: null,
        unsignedUserOp: Prisma.JsonNull,
      },
    });

    return {
      chain: dto.chain,
      status,
      txHash,
    };
  }

  // ── Generic UserOp prepare/submit (used by operations frontend) ──────

  async prepareGenericUserOp(userId: string, dto: PrepareUserOpDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!(dto.chain in ALL_CHAINS)) {
      throw new BadRequestException(`Unsupported chain: ${dto.chain}`);
    }

    const calls = dto.calls.map((c) => ({
      to: c.to as `0x${string}`,
      data: c.data as `0x${string}`,
      ...(c.value ? { value: BigInt(c.value) } : {}),
    }));

    const prepared = await this.userOpService.prepareUserOp(
      dto.chain,
      user.credentialId,
      user.publicKey,
      calls,
    );

    const requestId = crypto.randomUUID();
    this.pendingUserOps.set(requestId, {
      userId,
      chain: dto.chain,
      unsignedUserOp: prepared.unsignedUserOp,
      entryPointAddress: prepared.entryPointAddress,
      entryPointVersion: prepared.entryPointVersion,
      createdAt: Date.now(),
    });

    return {
      requestId,
      chain: dto.chain,
      userOpHash: prepared.userOpHash,
    };
  }

  async submitGenericUserOp(userId: string, dto: SubmitUserOpDto) {
    const pending = this.pendingUserOps.get(dto.requestId);
    if (!pending) {
      throw new NotFoundException(
        'Prepared UserOp not found or expired — call POST /v1/wallet/userop/prepare first',
      );
    }

    if (pending.userId !== userId) {
      throw new BadRequestException('UserOp belongs to a different user');
    }

    // Remove from store immediately (one-shot use)
    this.pendingUserOps.delete(dto.requestId);

    const txHash = await this.userOpService.submitUserOp(
      pending.chain,
      {
        unsignedUserOp: pending.unsignedUserOp,
        entryPointAddress: pending.entryPointAddress,
        entryPointVersion: pending.entryPointVersion,
      },
      dto.signature,
      dto.webauthn,
    );

    this.logger.log(
      `Generic UserOp submitted: txHash=${txHash} on ${pending.chain}`,
    );

    return {
      chain: pending.chain,
      txHash,
    };
  }

  async checkPaymasterStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.userOpService.checkPaymasterStatus(
      user.credentialId,
      user.publicKey,
    );
  }

  // ── Enable ECDSA Validator (for server-side settlement) ───────────────

  async prepareEnableExecutor(userId: string, dto: { chain: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!(dto.chain in ALL_CHAINS)) {
      throw new BadRequestException(`Unsupported chain: ${dto.chain}`);
    }

    // Check if already enabled
    const isEnabled = await this.userOpService.isEcdsaValidatorEnabled(
      dto.chain, user.walletAddress,
    );
    if (isEnabled) {
      return {
        chain: dto.chain,
        alreadyEnabled: true,
        message: 'ECDSA validator already enabled for execute on this chain',
      };
    }

    // Check if module is installed but not enabled (needs uninstall first)
    const needsUninstall = await this.userOpService.isEcdsaValidatorInstalled(
      dto.chain, user.walletAddress,
    );

    let uninstallUserOpHash: string | undefined;
    let uninstallRequestId: string | undefined;

    if (needsUninstall) {
      // Prepare uninstall UserOp — client must sign it with passkey
      const uninstallCalls = this.userOpService.buildUninstallEcdsaCalls(
        user.walletAddress as `0x${string}`,
        user.delegateAddress as `0x${string}`,
      );
      const prepared = await this.userOpService.prepareUserOp(
        dto.chain,
        user.credentialId,
        user.publicKey,
        uninstallCalls,
      );
      uninstallRequestId = crypto.randomUUID();
      this.pendingUserOps.set(uninstallRequestId, {
        userId,
        chain: dto.chain,
        unsignedUserOp: prepared.unsignedUserOp,
        entryPointAddress: prepared.entryPointAddress,
        entryPointVersion: prepared.entryPointVersion,
        createdAt: Date.now(),
      });
      uninstallUserOpHash = prepared.userOpHash;
    }

    const result = await this.userOpService.getEnableEcdsaTypedData(
      dto.chain,
      user.credentialId,
      user.publicKey,
      this.getDelegatePrivateKey(),
    );

    return {
      chain: dto.chain,
      enableHash: result.enableHash,
      mscaAddress: result.mscaAddress,
      needsUninstall,
      ...(needsUninstall ? { uninstallUserOpHash, uninstallRequestId } : {}),
      description: needsUninstall
        ? `Uninstall + re-enable ECDSA validator on ${dto.chain} (2 signatures needed)`
        : `Enable ECDSA validator for server-side execution on ${dto.chain}`,
    };
  }

  async submitEnableExecutor(
    userId: string,
    dto: {
      chain: string;
      enableSignature: string;
      webauthn?: {
        authenticatorData: string;
        clientDataJSON: string;
        challengeIndex: number;
        typeIndex: number;
      };
      // For uninstall step (when needsUninstall=true from prepare)
      uninstallRequestId?: string;
      uninstallSignature?: string;
      uninstallWebauthn?: {
        authenticatorData: string;
        clientDataJSON: string;
        challengeIndex: number;
        typeIndex: number;
      };
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const chainConfig = ALL_CHAINS[dto.chain];
    if (!chainConfig) throw new BadRequestException(`Unsupported chain: ${dto.chain}`);

    // Step 1: If uninstall is needed, submit it first and wait
    if (dto.uninstallRequestId && dto.uninstallSignature) {
      const pending = this.pendingUserOps.get(dto.uninstallRequestId);
      if (!pending) {
        throw new NotFoundException('Uninstall UserOp not found or expired');
      }
      if (pending.userId !== userId) {
        throw new BadRequestException('UserOp belongs to a different user');
      }
      this.pendingUserOps.delete(dto.uninstallRequestId);

      const uninstallTxHash = await this.userOpService.submitUserOp(
        pending.chain,
        {
          unsignedUserOp: pending.unsignedUserOp,
          entryPointAddress: pending.entryPointAddress,
          entryPointVersion: pending.entryPointVersion,
        },
        dto.uninstallSignature,
        dto.uninstallWebauthn,
      );
      this.logger.log(`ECDSA uninstall confirmed on ${dto.chain}: txHash=${uninstallTxHash}`);
    }

    // Step 2: Submit enable UserOp
    let encodedEnableSignature = dto.enableSignature;
    if (dto.webauthn) {
      encodedEnableSignature = this.userOpService.encodeWebAuthnSignature(
        dto.enableSignature,
        dto.webauthn,
        chainConfig.chainId,
      );
    }

    const txHash = await this.userOpService.submitEnableEcdsaValidator(
      dto.chain,
      user.credentialId,
      user.publicKey,
      this.getDelegatePrivateKey(),
      encodedEnableSignature,
    );

    return { chain: dto.chain, txHash, status: 'ENABLED' };
  }

  /**
   * Combined setup: enable ECDSA validator + add delegate in a single UserOp, one passkey signature.
   */
  async prepareSetupSettlement(userId: string, dto: { chain: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { delegateSetups: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!(dto.chain in ALL_CHAINS)) {
      throw new BadRequestException(`Unsupported chain: ${dto.chain}`);
    }

    // Check current state
    const isEnabled = await this.userOpService.isEcdsaValidatorEnabled(
      dto.chain, user.walletAddress,
    );
    const delegateSetup = user.delegateSetups.find(d => d.chain === dto.chain);
    const delegateConfirmed = delegateSetup?.status === 'CONFIRMED';

    if (isEnabled && delegateConfirmed) {
      return { chain: dto.chain, alreadySetup: true, message: 'Settlement already configured on this chain' };
    }

    const needsUninstall = await this.userOpService.isEcdsaValidatorInstalled(
      dto.chain, user.walletAddress,
    );

    let uninstallUserOpHash: string | undefined;
    let uninstallRequestId: string | undefined;

    if (needsUninstall) {
      const uninstallCalls = this.userOpService.buildUninstallEcdsaCalls(
        user.walletAddress as `0x${string}`,
        user.delegateAddress as `0x${string}`,
      );
      const prepared = await this.userOpService.prepareUserOp(
        dto.chain, user.credentialId, user.publicKey, uninstallCalls,
      );
      uninstallRequestId = crypto.randomUUID();
      this.pendingUserOps.set(uninstallRequestId, {
        userId, chain: dto.chain,
        unsignedUserOp: prepared.unsignedUserOp,
        entryPointAddress: prepared.entryPointAddress,
        entryPointVersion: prepared.entryPointVersion,
        createdAt: Date.now(),
      });
      uninstallUserOpHash = prepared.userOpHash;
    }

    // Get enable EIP-712 hash (one passkey signature needed)
    // Pass delegate private key so SDK can build the exact same ECDSA validator
    // internally, guaranteeing the enable hash matches the UserOp signature
    const result = await this.userOpService.getEnableEcdsaTypedData(
      dto.chain, user.credentialId, user.publicKey, this.getDelegatePrivateKey(),
    );

    return {
      chain: dto.chain,
      enableHash: result.enableHash,
      mscaAddress: result.mscaAddress,
      needsDelegate: !delegateConfirmed,
      needsUninstall,
      ...(needsUninstall ? { uninstallUserOpHash, uninstallRequestId } : {}),
      description: 'Enable settlement module' + (!delegateConfirmed ? ' + add delegate' : '') + ` on ${dto.chain}`,
    };
  }

  async submitSetupSettlement(
    userId: string,
    dto: {
      chain: string;
      enableSignature: string;
      webauthn?: { authenticatorData: string; clientDataJSON: string; challengeIndex: number; typeIndex: number };
      uninstallRequestId?: string;
      uninstallSignature?: string;
      uninstallWebauthn?: { authenticatorData: string; clientDataJSON: string; challengeIndex: number; typeIndex: number };
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const chainConfig = ALL_CHAINS[dto.chain];
    if (!chainConfig) throw new BadRequestException(`Unsupported chain: ${dto.chain}`);

    // Step 1: Uninstall if needed
    if (dto.uninstallRequestId && dto.uninstallSignature) {
      const pending = this.pendingUserOps.get(dto.uninstallRequestId);
      if (!pending) throw new NotFoundException('Uninstall UserOp not found or expired');
      if (pending.userId !== userId) throw new BadRequestException('UserOp belongs to a different user');
      this.pendingUserOps.delete(dto.uninstallRequestId);

      const uninstallTxHash = await this.userOpService.submitUserOp(
        pending.chain,
        { unsignedUserOp: pending.unsignedUserOp, entryPointAddress: pending.entryPointAddress, entryPointVersion: pending.entryPointVersion },
        dto.uninstallSignature, dto.uninstallWebauthn,
      );
      this.logger.log(`ECDSA uninstall confirmed on ${dto.chain}: txHash=${uninstallTxHash}`);
    }

    // Step 2: Encode enable signature
    let encodedEnableSignature = dto.enableSignature;
    if (dto.webauthn) {
      encodedEnableSignature = this.userOpService.encodeWebAuthnSignature(
        dto.enableSignature, dto.webauthn, chainConfig.chainId,
      );
    }

    // Step 3: Submit enable ECDSA + addDelegate in one UserOp
    // The enable happens via the signature (ENABLE mode), and addDelegate
    // executes as the actual call within the same UserOp.
    const delegateCalls = this.circleService.buildDelegateCallData(dto.chain, user.delegateAddress);
    const formattedCalls = delegateCalls.map(c => ({
      to: c.to as `0x${string}`,
      data: c.data as `0x${string}`,
      value: c.value ?? 0n,
    }));

    const txHash = await this.userOpService.submitEnableEcdsaValidator(
      dto.chain, user.credentialId, user.publicKey,
      this.getDelegatePrivateKey(), encodedEnableSignature,
      formattedCalls,
    );
    this.logger.log(`ECDSA enabled + delegate added on ${dto.chain}: txHash=${txHash}`);

    // Step 4: Verify delegate and mark confirmed
    let isAuthorized = false;
    try {
      const client = createPublicClient({ transport: http(chainConfig.rpc) });
      isAuthorized = await client.readContract({
        address: GATEWAY_WALLET as `0x${string}`,
        abi: GATEWAY_WALLET_DELEGATE_ABI,
        functionName: 'isAuthorizedForBalance',
        args: [
          chainConfig.usdc as `0x${string}`,
          user.walletAddress as `0x${string}`,
          user.delegateAddress as `0x${string}`,
        ],
      }) as boolean;
    } catch (err) {
      this.logger.warn(`Delegate on-chain check failed: ${err}`);
    }

    await this.prisma.delegateSetup.upsert({
      where: { userId_chain: { userId, chain: dto.chain } },
      create: { userId, chain: dto.chain, status: isAuthorized ? 'CONFIRMED' : 'SUBMITTED', txHash },
      update: { status: isAuthorized ? 'CONFIRMED' : 'SUBMITTED', txHash, errorMessage: null },
    });

    return { chain: dto.chain, txHash, status: isAuthorized ? 'SETUP_COMPLETE' : 'DELEGATE_PENDING' };
  }

  private getDelegatePrivateKey(): string {
    const key = process.env.SHARED_DELEGATE_PRIVATE_KEY;
    if (!key) throw new BadRequestException('SHARED_DELEGATE_PRIVATE_KEY not configured');
    return key;
  }
}
