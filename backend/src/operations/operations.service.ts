import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { parseUnits, formatUnits } from 'viem';
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
import { GatewayService } from '../circle/gateway/gateway.service';
import { AuthService } from '../auth/auth.service';
import {
  AA_GATEWAY_CHAINS,
  GATEWAY_CHAINS,
  HUB_CHAIN,
  getUsdcAddress,
} from '../circle/config/chains';
import { USDC_DECIMALS } from '../circle/gateway/gateway.types';
import { PrepareCollectDto } from './dto/prepare-collect.dto';
import { PrepareSendDto } from './dto/prepare-send.dto';
import { PrepareBridgeDto } from './dto/prepare-bridge.dto';
import { PrepareBatchSendDto } from './dto/prepare-batch-send.dto';
import { SubmitOperationDto } from './dto/submit-operation.dto';

const CROSS_CHAIN_FEE_PERCENT = '0.3';
const BATCH_FEE_PERCENT = '0.25';

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly circleService: CircleService,
    private readonly gatewayService: GatewayService,
    private readonly authService: AuthService,
  ) {}

  async prepareCollect(userId: string, dto: PrepareCollectDto) {
    const user = await this.getUser(userId);
    const destination = dto.destination || HUB_CHAIN;

    this.validateGatewayChain(destination);
    for (const chain of dto.sourceChains) {
      this.validateGatewayChain(chain);
    }

    const gatewayBalances =
      await this.gatewayService.getBalance(user.walletAddress);
    const balanceMap: Record<string, bigint> = {};
    for (const b of gatewayBalances) {
      balanceMap[b.chain] = b.balance;
    }

    const sources: Array<{ chain: string; amount: bigint }> = [];
    let totalAmount = 0n;

    for (const chain of dto.sourceChains) {
      const balance = balanceMap[chain] || 0n;
      if (balance > 0n) {
        sources.push({ chain, amount: balance });
        totalAmount += balance;
      }
    }

    if (sources.length === 0) {
      throw new BadRequestException(
        'No Gateway balance found on specified chains',
      );
    }

    const feePercent = parseFloat(BATCH_FEE_PERCENT);
    const feeRaw = (totalAmount * BigInt(Math.round(feePercent * 10000))) / 10000n;

    const operation = await this.prisma.operation.create({
      data: {
        userId,
        type: 'COLLECT',
        status: 'AWAITING_SIGNATURE',
        params: {
          sourceChains: dto.sourceChains,
          destination,
        },
        summary: {
          sources: sources.map((s) => ({
            chain: s.chain,
            amount: formatUnits(s.amount, USDC_DECIMALS),
          })),
          destination,
          totalAmount: formatUnits(totalAmount, USDC_DECIMALS),
          fee: formatUnits(feeRaw, USDC_DECIMALS),
          feePercent: BATCH_FEE_PERCENT,
          estimatedTime: '15-20 minutes',
        },
        feeAmount: formatUnits(feeRaw, USDC_DECIMALS),
        feePercent: BATCH_FEE_PERCENT,
      },
    });

    const signRequests: Array<{
      stepId: string;
      chain: string;
      type: string;
      calls: any[];
      description: string;
    }> = [];

    let stepIndex = 0;

    // Phase 1 steps: APPROVE_AND_DEPOSIT per source chain
    for (const source of sources) {
      const calls = this.circleService.buildDepositCallData(
        source.chain,
        source.amount,
      );

      const step = await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: source.chain,
          type: 'APPROVE_AND_DEPOSIT',
          status: 'AWAITING_SIGNATURE',
          callData: calls.map((c) => ({
            to: c.to,
            data: c.data,
            value: c.value?.toString(),
          })),
        },
      });

      signRequests.push({
        stepId: step.id,
        chain: source.chain,
        type: 'APPROVE_AND_DEPOSIT',
        calls: calls.map((c) => ({
          to: c.to,
          data: c.data,
        })),
        description: `Approve and deposit ${formatUnits(source.amount, USDC_DECIMALS)} USDC on ${source.chain}`,
      });
    }

    // Future steps (server-side, created as PENDING)
    for (const source of sources) {
      await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: source.chain,
          type: 'BURN_INTENT',
          status: 'PENDING',
          burnIntentData: {
            sourceChain: source.chain,
            destinationChain: destination,
            amount: source.amount.toString(),
            depositor: user.walletAddress,
            recipient: user.walletAddress,
          },
        },
      });
    }

    // Mint step on destination (Phase 2)
    await this.prisma.operationStep.create({
      data: {
        operationId: operation.id,
        stepIndex: stepIndex++,
        chain: destination,
        type: 'MINT',
        status: 'PENDING',
      },
    });

    await this.prisma.operation.update({
      where: { id: operation.id },
      data: { signRequests },
    });

    return {
      id: operation.id,
      type: 'COLLECT',
      status: 'AWAITING_SIGNATURE',
      summary: operation.summary,
      signRequests,
    };
  }

  async prepareSend(userId: string, dto: PrepareSendDto) {
    const user = await this.getUser(userId);
    const sourceChain = dto.sourceChain || HUB_CHAIN;

    this.validateGatewayChain(sourceChain);
    this.validateGatewayChain(dto.destinationChain);

    const amountRaw = parseUnits(dto.amount, USDC_DECIMALS);
    const isInternal =
      sourceChain === dto.destinationChain &&
      sourceChain === HUB_CHAIN;

    const feePercent = isInternal ? '0' : CROSS_CHAIN_FEE_PERCENT;
    const feeRaw = isInternal
      ? 0n
      : (amountRaw * BigInt(Math.round(parseFloat(feePercent) * 10000))) /
        10000n;

    const operation = await this.prisma.operation.create({
      data: {
        userId,
        type: 'SEND',
        status: 'AWAITING_SIGNATURE',
        params: {
          destinationAddress: dto.destinationAddress,
          destinationChain: dto.destinationChain,
          amount: dto.amount,
          sourceChain,
        },
        summary: {
          action: 'send',
          amount: dto.amount,
          fee: formatUnits(feeRaw, USDC_DECIMALS),
          feePercent,
          totalDeducted: formatUnits(amountRaw + feeRaw, USDC_DECIMALS),
          destination: dto.destinationAddress,
          destinationChain: dto.destinationChain,
          sourceChain,
          estimatedTime: isInternal ? 'instant' : '3-5 minutes',
        },
        feeAmount: formatUnits(feeRaw, USDC_DECIMALS),
        feePercent,
      },
    });

    const signRequests: any[] = [];
    let stepIndex = 0;

    if (isInternal) {
      // Direct transfer on Arc — single UserOp
      // For now, the client handles this directly
      const step = await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: HUB_CHAIN,
          type: 'TRANSFER',
          status: 'AWAITING_SIGNATURE',
          callData: {
            type: 'usdc_transfer',
            to: dto.destinationAddress,
            amount: amountRaw.toString(),
          },
        },
      });

      signRequests.push({
        stepId: step.id,
        chain: HUB_CHAIN,
        type: 'TRANSFER',
        description: `Transfer ${dto.amount} USDC to ${dto.destinationAddress} on ${HUB_CHAIN}`,
      });
    } else {
      // Cross-chain: burn on source → mint on destination
      const burnStep = await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: sourceChain,
          type: 'BURN_INTENT',
          status: 'PENDING',
          burnIntentData: {
            sourceChain,
            destinationChain: dto.destinationChain,
            amount: amountRaw.toString(),
            depositor: user.walletAddress,
            recipient: dto.destinationAddress,
          },
        },
      });

      const mintStep = await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: dto.destinationChain,
          type: 'MINT',
          status: 'PENDING',
        },
      });

      // For send, server signs burn intent immediately (no deposit needed if balance already in Gateway)
      signRequests.push({
        stepId: burnStep.id,
        chain: sourceChain,
        type: 'BURN_INTENT',
        description: `Server will sign burn intent for ${dto.amount} USDC from ${sourceChain}`,
        serverSide: true,
      });
    }

    await this.prisma.operation.update({
      where: { id: operation.id },
      data: { signRequests },
    });

    return {
      id: operation.id,
      type: 'SEND',
      status: 'AWAITING_SIGNATURE',
      summary: operation.summary,
      signRequests,
    };
  }

  async prepareBridge(userId: string, dto: PrepareBridgeDto) {
    const user = await this.getUser(userId);

    this.validateGatewayChain(dto.sourceChain);
    this.validateGatewayChain(dto.destinationChain);

    const amountRaw = parseUnits(dto.amount, USDC_DECIMALS);
    const feeRaw =
      (amountRaw *
        BigInt(
          Math.round(parseFloat(CROSS_CHAIN_FEE_PERCENT) * 10000),
        )) /
      10000n;

    const operation = await this.prisma.operation.create({
      data: {
        userId,
        type: 'BRIDGE',
        status: 'AWAITING_SIGNATURE',
        params: {
          sourceChain: dto.sourceChain,
          destinationChain: dto.destinationChain,
          amount: dto.amount,
        },
        summary: {
          action: 'bridge',
          amount: dto.amount,
          fee: formatUnits(feeRaw, USDC_DECIMALS),
          feePercent: CROSS_CHAIN_FEE_PERCENT,
          sourceChain: dto.sourceChain,
          destinationChain: dto.destinationChain,
          estimatedTime: '15-20 minutes',
        },
        feeAmount: formatUnits(feeRaw, USDC_DECIMALS),
        feePercent: CROSS_CHAIN_FEE_PERCENT,
      },
    });

    const signRequests: any[] = [];
    let stepIndex = 0;

    // Step 1: Approve + Deposit on source
    const depositCalls = this.circleService.buildDepositCallData(
      dto.sourceChain,
      amountRaw,
    );

    const depositStep = await this.prisma.operationStep.create({
      data: {
        operationId: operation.id,
        stepIndex: stepIndex++,
        chain: dto.sourceChain,
        type: 'APPROVE_AND_DEPOSIT',
        status: 'AWAITING_SIGNATURE',
        callData: depositCalls.map((c) => ({
          to: c.to,
          data: c.data,
        })),
      },
    });

    signRequests.push({
      stepId: depositStep.id,
      chain: dto.sourceChain,
      type: 'APPROVE_AND_DEPOSIT',
      calls: depositCalls.map((c) => ({ to: c.to, data: c.data })),
      description: `Approve and deposit ${dto.amount} USDC on ${dto.sourceChain}`,
    });

    // Step 2: Burn intent (server-side)
    await this.prisma.operationStep.create({
      data: {
        operationId: operation.id,
        stepIndex: stepIndex++,
        chain: dto.sourceChain,
        type: 'BURN_INTENT',
        status: 'PENDING',
        burnIntentData: {
          sourceChain: dto.sourceChain,
          destinationChain: dto.destinationChain,
          amount: amountRaw.toString(),
          depositor: user.walletAddress,
          recipient: user.walletAddress,
        },
      },
    });

    // Step 3: Mint on destination (Phase 2)
    await this.prisma.operationStep.create({
      data: {
        operationId: operation.id,
        stepIndex: stepIndex++,
        chain: dto.destinationChain,
        type: 'MINT',
        status: 'PENDING',
      },
    });

    await this.prisma.operation.update({
      where: { id: operation.id },
      data: { signRequests },
    });

    return {
      id: operation.id,
      type: 'BRIDGE',
      status: 'AWAITING_SIGNATURE',
      summary: operation.summary,
      signRequests,
    };
  }

  async prepareBatchSend(userId: string, dto: PrepareBatchSendDto) {
    const user = await this.getUser(userId);
    const sourceChain = dto.sourceChain || HUB_CHAIN;

    if (dto.recipients.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    this.validateGatewayChain(sourceChain);
    for (const r of dto.recipients) {
      this.validateGatewayChain(r.chain);
    }

    // Calculate totals and fee
    let totalRaw = 0n;
    const recipientDetails = dto.recipients.map((r) => {
      const amountRaw = parseUnits(r.amount, USDC_DECIMALS);
      totalRaw += amountRaw;
      return { ...r, amountRaw };
    });

    const feeRaw =
      (totalRaw * BigInt(Math.round(parseFloat(BATCH_FEE_PERCENT) * 10000))) /
      10000n;

    const operation = await this.prisma.operation.create({
      data: {
        userId,
        type: 'BATCH_SEND',
        status: 'AWAITING_SIGNATURE',
        params: {
          recipients: dto.recipients.map((r) => ({
            address: r.address,
            chain: r.chain,
            amount: r.amount,
          })),
          sourceChain,
        },
        summary: {
          action: 'batch_send',
          recipientCount: dto.recipients.length,
          recipients: dto.recipients.map((r) => ({
            address: r.address,
            chain: r.chain,
            amount: r.amount,
          })),
          totalAmount: formatUnits(totalRaw, USDC_DECIMALS),
          fee: formatUnits(feeRaw, USDC_DECIMALS),
          feePercent: BATCH_FEE_PERCENT,
          totalDeducted: formatUnits(totalRaw + feeRaw, USDC_DECIMALS),
          sourceChain,
          estimatedTime: '3-5 minutes',
        },
        feeAmount: formatUnits(feeRaw, USDC_DECIMALS),
        feePercent: BATCH_FEE_PERCENT,
      },
    });

    const signRequests: any[] = [];
    let stepIndex = 0;

    for (const r of recipientDetails) {
      const isInternal =
        sourceChain === r.chain && sourceChain === HUB_CHAIN;

      if (isInternal) {
        const step = await this.prisma.operationStep.create({
          data: {
            operationId: operation.id,
            stepIndex: stepIndex++,
            chain: HUB_CHAIN,
            type: 'TRANSFER',
            status: 'AWAITING_SIGNATURE',
            callData: {
              type: 'usdc_transfer',
              to: r.address,
              amount: r.amountRaw.toString(),
            },
          },
        });

        signRequests.push({
          stepId: step.id,
          chain: HUB_CHAIN,
          type: 'TRANSFER',
          description: `Transfer ${r.amount} USDC to ${r.address}`,
        });
      } else {
        const burnStep = await this.prisma.operationStep.create({
          data: {
            operationId: operation.id,
            stepIndex: stepIndex++,
            chain: sourceChain,
            type: 'BURN_INTENT',
            status: 'PENDING',
            burnIntentData: {
              sourceChain,
              destinationChain: r.chain,
              amount: r.amountRaw.toString(),
              depositor: user.walletAddress,
              recipient: r.address,
            },
          },
        });

        await this.prisma.operationStep.create({
          data: {
            operationId: operation.id,
            stepIndex: stepIndex++,
            chain: r.chain,
            type: 'MINT',
            status: 'PENDING',
          },
        });

        signRequests.push({
          stepId: burnStep.id,
          chain: sourceChain,
          type: 'BURN_INTENT',
          description: `Burn ${r.amount} USDC → ${r.address} on ${r.chain}`,
          serverSide: true,
        });
      }
    }

    await this.prisma.operation.update({
      where: { id: operation.id },
      data: { signRequests },
    });

    return {
      id: operation.id,
      type: 'BATCH_SEND',
      status: 'AWAITING_SIGNATURE',
      summary: operation.summary,
      signRequests,
    };
  }

  async submitOperation(userId: string, operationId: string, dto: SubmitOperationDto) {
    const operation = await this.prisma.operation.findFirst({
      where: { id: operationId, userId },
      include: { steps: { orderBy: { stepIndex: 'asc' } } },
    });

    if (!operation) throw new NotFoundException('Operation not found');

    if (
      operation.status !== 'AWAITING_SIGNATURE' &&
      operation.status !== 'AWAITING_SIGNATURE_PHASE2'
    ) {
      throw new BadRequestException(
        `Operation is in ${operation.status} state, cannot submit signatures`,
      );
    }

    const user = await this.getUser(userId);
    const isPhase2 = operation.status === 'AWAITING_SIGNATURE_PHASE2';

    // Update submitted steps
    for (const sig of dto.signatures) {
      await this.prisma.operationStep.update({
        where: { id: sig.stepId },
        data: {
          status: 'CONFIRMED',
          txHash: sig.txHash,
          completedAt: new Date(),
        },
      });
    }

    if (isPhase2) {
      // Phase 2 submitted — mark operation as completed
      await this.prisma.operation.update({
        where: { id: operationId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      return this.getOperation(userId, operationId);
    }

    // Phase 1 submitted — process burn intents server-side
    const burnSteps = operation.steps.filter(
      (s) => s.type === 'BURN_INTENT' && s.status === 'PENDING',
    );

    const delegateKey = this.authService.getDelegatePrivateKey(user);
    const mintCallsData: any[] = [];

    for (const step of burnSteps) {
      const intentData = step.burnIntentData as any;

      try {
        const { transfer } = await this.circleService.submitBurnIntent(
          intentData.sourceChain,
          intentData.destinationChain,
          BigInt(intentData.amount),
          intentData.depositor,
          intentData.recipient,
          delegateKey,
        );

        await this.prisma.operationStep.update({
          where: { id: step.id },
          data: {
            status: 'CONFIRMED',
            attestation: transfer.attestation,
            operatorSignature: transfer.signature,
            completedAt: new Date(),
          },
        });

        mintCallsData.push({
          attestation: transfer.attestation,
          operatorSignature: transfer.signature,
          destinationChain: intentData.destinationChain,
        });
      } catch (error) {
        await this.prisma.operationStep.update({
          where: { id: step.id },
          data: {
            status: 'FAILED',
            errorMessage: error.message,
          },
        });

        await this.prisma.operation.update({
          where: { id: operationId },
          data: { status: 'FAILED', errorMessage: error.message },
        });

        return this.getOperation(userId, operationId);
      }
    }

    // Build Phase 2 sign requests (mint)
    const mintSteps = operation.steps.filter(
      (s) => s.type === 'MINT' && s.status === 'PENDING',
    );

    const phase2SignRequests: any[] = [];

    for (let i = 0; i < mintCallsData.length && i < mintSteps.length; i++) {
      const mintData = mintCallsData[i];
      const mintStep = mintSteps[i];

      const calls = this.circleService.buildMintCallData(
        mintData.attestation,
        mintData.operatorSignature,
      );

      await this.prisma.operationStep.update({
        where: { id: mintStep.id },
        data: {
          status: 'AWAITING_SIGNATURE',
          callData: calls.map((c) => ({ to: c.to, data: c.data })),
        },
      });

      phase2SignRequests.push({
        stepId: mintStep.id,
        chain: mintData.destinationChain,
        type: 'MINT',
        calls: calls.map((c) => ({ to: c.to, data: c.data })),
        description: `Mint USDC on ${mintData.destinationChain}`,
      });
    }

    if (phase2SignRequests.length > 0) {
      await this.prisma.operation.update({
        where: { id: operationId },
        data: {
          status: 'AWAITING_SIGNATURE_PHASE2',
          signRequests: phase2SignRequests,
        },
      });
    } else {
      await this.prisma.operation.update({
        where: { id: operationId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    return this.getOperation(userId, operationId);
  }

  async getOperation(userId: string, operationId: string) {
    const operation = await this.prisma.operation.findFirst({
      where: { id: operationId, userId },
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
          select: {
            id: true,
            stepIndex: true,
            chain: true,
            type: true,
            status: true,
            txHash: true,
            callData: true,
            errorMessage: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!operation) throw new NotFoundException('Operation not found');

    return {
      id: operation.id,
      type: operation.type,
      status: operation.status,
      summary: operation.summary,
      signRequests: operation.signRequests,
      feeAmount: operation.feeAmount,
      feePercent: operation.feePercent,
      steps: operation.steps,
      createdAt: operation.createdAt,
      completedAt: operation.completedAt,
      errorMessage: operation.errorMessage,
    };
  }

  async getOperations(
    userId: string,
    type?: string,
    status?: string,
    limit = 20,
    offset = 0,
  ) {
    const where: any = { userId };
    if (type) where.type = type;
    if (status) where.status = status;

    const [operations, total] = await Promise.all([
      this.prisma.operation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          status: true,
          summary: true,
          feeAmount: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      this.prisma.operation.count({ where }),
    ]);

    return { operations, total, limit, offset };
  }

  private async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private validateGatewayChain(chain: string) {
    if (!(chain in GATEWAY_CHAINS)) {
      throw new BadRequestException(
        `Chain ${chain} does not support Gateway. Supported: ${Object.keys(GATEWAY_CHAINS).join(', ')}`,
      );
    }
  }
}
