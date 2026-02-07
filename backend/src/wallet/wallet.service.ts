import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
import { GatewayService } from '../circle/gateway/gateway.service';
import { AuthService } from '../auth/auth.service';
import { AA_GATEWAY_CHAINS, ALL_CHAINS, GATEWAY_CHAINS } from '../circle/config/chains';
import { CIRCLE_BUNDLER_RPCS } from '../circle/config/bundler';
import { GATEWAY_WALLET } from '../circle/config/gateway';
import { GATEWAY_WALLET_DELEGATE_ABI } from '../circle/gateway/gateway.operations';
import { USDC_DECIMALS } from '../circle/gateway/gateway.types';
import { PrepareDelegateDto } from './dto/prepare-delegate.dto';
import { SubmitDelegateDto } from './dto/submit-delegate.dto';
import { WithdrawDto } from './dto/withdraw.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly circleService: CircleService,
    private readonly gatewayService: GatewayService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

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
      bundlerRpcs: CIRCLE_BUNDLER_RPCS,
      delegateStatuses,
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

    const callData = this.circleService.buildDelegateCallData(
      dto.chain,
      user.delegateAddress,
    );

    const setup = await this.prisma.delegateSetup.upsert({
      where: { userId_chain: { userId, chain: dto.chain } },
      create: {
        userId,
        chain: dto.chain,
        status: 'AWAITING_SIGNATURE',
      },
      update: {
        status: 'AWAITING_SIGNATURE',
        errorMessage: null,
      },
    });

    return {
      delegateSetupId: setup.id,
      chain: dto.chain,
      delegateAddress: user.delegateAddress,
      calls: callData,
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

    const chainConfig = ALL_CHAINS[dto.chain];
    if (!chainConfig) {
      throw new BadRequestException(`Unknown chain: ${dto.chain}`);
    }

    // Verify delegate is actually registered on the Gateway contract
    const client = createPublicClient({
      transport: http(chainConfig.rpc),
    });

    const isAuthorized = await client.readContract({
      address: GATEWAY_WALLET as `0x${string}`,
      abi: GATEWAY_WALLET_DELEGATE_ABI,
      functionName: 'isAuthorizedForBalance',
      args: [
        chainConfig.usdc as `0x${string}`,
        user.walletAddress as `0x${string}`,
        user.delegateAddress as `0x${string}`,
      ],
    });

    if (!isAuthorized) {
      throw new BadRequestException(
        'Delegate is not registered on the Gateway contract',
      );
    }

    this.logger.log(
      `Delegate verified on-chain: ${user.delegateAddress} authorized for ${user.walletAddress} on ${dto.chain}`,
    );

    await this.prisma.delegateSetup.update({
      where: { id: setup.id },
      data: {
        status: 'CONFIRMED',
        txHash: dto.txHash,
        errorMessage: null,
      },
    });

    return {
      chain: dto.chain,
      status: 'CONFIRMED',
      txHash: dto.txHash,
    };
  }

  async withdraw(userId: string, dto: WithdrawDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!(dto.chain in GATEWAY_CHAINS)) {
      throw new BadRequestException(
        `Chain ${dto.chain} does not support Gateway. Supported: ${Object.keys(GATEWAY_CHAINS).join(', ')}`,
      );
    }

    // Get Gateway balances
    const balances = await this.gatewayService.getBalance(user.walletAddress);
    const balanceMap: Record<string, bigint> = {};
    for (const b of balances) {
      balanceMap[b.chain] = b.balance;
    }

    // Determine source chain
    let sourceChain = dto.sourceChain;
    if (sourceChain) {
      if (!(sourceChain in GATEWAY_CHAINS)) {
        throw new BadRequestException(`Source chain ${sourceChain} not supported`);
      }
      if (!balanceMap[sourceChain] || balanceMap[sourceChain] === 0n) {
        throw new BadRequestException(`No Gateway balance on ${sourceChain}`);
      }
    } else {
      // Pick chain with highest balance (excluding destination if same-chain)
      let best: string | null = null;
      let bestBal = 0n;
      for (const [chain, bal] of Object.entries(balanceMap)) {
        if (bal > bestBal) {
          best = chain;
          bestBal = bal;
        }
      }
      if (!best) throw new BadRequestException('No Gateway balance found');
      sourceChain = best;
    }

    // Same chain = no burn/mint needed, just a note
    if (sourceChain === dto.chain) {
      throw new BadRequestException(
        `Source and destination are both ${dto.chain}. Use the Gateway deposit/withdraw directly, or choose a different source chain.`,
      );
    }

    const sourceBalance = balanceMap[sourceChain];

    // Determine amount: account for ~2% gateway fee
    let burnAmount: bigint;
    if (dto.amount) {
      burnAmount = parseUnits(dto.amount, USDC_DECIMALS);
      const requiredBalance = (burnAmount * 10205n) / 10000n;
      if (requiredBalance > sourceBalance) {
        throw new BadRequestException(
          `Insufficient Gateway balance on ${sourceChain}: have ${formatUnits(sourceBalance, USDC_DECIMALS)}, need ~${formatUnits(requiredBalance, USDC_DECIMALS)} (amount + ~2% gateway fee)`,
        );
      }
    } else {
      // Full balance: reduce by gateway fee
      burnAmount = (sourceBalance * 10000n) / 10205n;
    }

    if (burnAmount === 0n) {
      throw new BadRequestException('Amount too small to withdraw');
    }

    this.logger.log(
      `Withdraw: ${formatUnits(burnAmount, USDC_DECIMALS)} USDC from ${sourceChain} → ${dto.chain} for ${user.walletAddress}`,
    );

    // 1. Sign and submit burn intent
    const delegateKey = this.authService.getDelegatePrivateKey(user);

    const { transfer } = await this.circleService.submitBurnIntent(
      sourceChain,
      dto.chain,
      burnAmount,
      user.walletAddress,
      user.walletAddress,
      delegateKey,
    );

    this.logger.log(`Burn intent confirmed: attestation=${transfer.attestation?.slice(0, 20)}...`);

    // 2. Execute mint via relayer
    const relayerKey = this.configService.get<string>('RELAYER_PRIVATE_KEY');
    let mintTxHash: string | null = null;

    if (relayerKey) {
      try {
        mintTxHash = await this.gatewayService.executeMint(
          dto.chain,
          transfer.attestation,
          transfer.signature,
          relayerKey,
        );
        this.logger.log(`Mint executed on ${dto.chain}: ${mintTxHash}`);
      } catch (err) {
        this.logger.warn(`Mint failed (may need retry): ${err.message}`);
      }
    }

    return {
      status: mintTxHash ? 'COMPLETED' : 'BURN_CONFIRMED',
      sourceChain,
      destinationChain: dto.chain,
      amount: formatUnits(burnAmount, USDC_DECIMALS),
      attestation: transfer.attestation,
      mintTxHash,
      message: mintTxHash
        ? `Withdrawn ${formatUnits(burnAmount, USDC_DECIMALS)} USDC to ${dto.chain}`
        : 'Burn confirmed, mint pending (relayer will retry)',
    };
  }
}
