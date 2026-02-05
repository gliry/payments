import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createPublicClient, http } from 'viem';
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
import { AA_GATEWAY_CHAINS, ALL_CHAINS } from '../circle/config/chains';
import { CIRCLE_BUNDLER_RPCS } from '../circle/config/bundler';
import { GATEWAY_WALLET } from '../circle/config/gateway';
import { GATEWAY_WALLET_DELEGATE_ABI } from '../circle/gateway/gateway.operations';
import { PrepareDelegateDto } from './dto/prepare-delegate.dto';
import { SubmitDelegateDto } from './dto/submit-delegate.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly circleService: CircleService,
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

    try {
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
        await this.prisma.delegateSetup.update({
          where: { id: setup.id },
          data: {
            status: 'FAILED',
            txHash: dto.txHash,
            errorMessage:
              'Delegate not found on-chain. Transaction may have failed or targeted wrong contract.',
          },
        });

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
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.warn(
        `Could not verify delegate on ${dto.chain}: ${error.message}`,
      );

      await this.prisma.delegateSetup.update({
        where: { id: setup.id },
        data: {
          status: 'SUBMITTED',
          txHash: dto.txHash,
          errorMessage: `On-chain verification failed: ${error.message}`,
        },
      });

      return {
        chain: dto.chain,
        status: 'SUBMITTED',
        txHash: dto.txHash,
        message:
          'Transaction submitted but on-chain verification failed. Will retry.',
      };
    }
  }
}
