import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

// Gateway charges ~2% fee on burn intents (deducted from depositor balance on top of amount)
// We use 205 bps (2.05%) with buffer to avoid "insufficient balance" errors
const GATEWAY_FEE_BPS = 205n;

/** Calculate net amount that can be burned from a given balance (balance covers amount + gateway fee) */
function netBurnAmount(balance: bigint): bigint {
  return (balance * 10000n) / (10000n + GATEWAY_FEE_BPS);
}

/** Calculate how much to deposit so that balance covers burn amount + gateway fee */
function grossDepositAmount(burnAmount: bigint): bigint {
  return (burnAmount * (10000n + GATEWAY_FEE_BPS)) / 10000n;
}

/** Calculate maxFee for burn intent (3% of amount as ceiling, min 50000 = 0.05 USDC) */
function calcMaxFee(amount: bigint): bigint {
  const fee = (amount * 300n) / 10000n;
  return fee > 50000n ? fee : 50000n;
}

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly circleService: CircleService,
    private readonly gatewayService: GatewayService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async prepareCollect(userId: string, dto: PrepareCollectDto) {
    const user = await this.getUser(userId);
    const destination = dto.destination || HUB_CHAIN;

    this.validateGatewayChain(destination);
    for (const chain of dto.sourceChains) {
      this.validateGatewayChain(chain);
    }

    // Read on-chain USDC balances (wallet balance, NOT Gateway balance)
    // Collect deposits on-chain USDC to Gateway first, then burns to destination
    const onChainBalances =
      await this.circleService.getMultiChainBalances(user.walletAddress);

    const sources: Array<{
      chain: string;
      depositAmount: bigint; // full on-chain balance to deposit to Gateway
      burnAmount: bigint;    // net amount to burn (after Gateway ~2% fee)
    }> = [];
    let totalBurnAmount = 0n;

    for (const chain of dto.sourceChains) {
      const onChainBalance = onChainBalances[chain] || 0n;
      if (onChainBalance > 0n) {
        // Deposit full on-chain balance, burn net amount (leaves room for Gateway fee)
        const burnAmount = netBurnAmount(onChainBalance);
        sources.push({ chain, depositAmount: onChainBalance, burnAmount });
        totalBurnAmount += burnAmount;
      }
    }

    if (sources.length === 0) {
      throw new BadRequestException(
        'No on-chain USDC balance found on specified chains',
      );
    }

    const feePercent = parseFloat(BATCH_FEE_PERCENT);
    const feeRaw = (totalBurnAmount * BigInt(Math.round(feePercent * 10000))) / 10000n;

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
            deposit: formatUnits(s.depositAmount, USDC_DECIMALS),
            amount: formatUnits(s.burnAmount, USDC_DECIMALS),
          })),
          destination,
          totalAmount: formatUnits(totalBurnAmount, USDC_DECIMALS),
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

    // Phase 1 steps: APPROVE_AND_DEPOSIT per source chain (deposit full on-chain balance)
    for (const source of sources) {
      const calls = this.circleService.buildDepositCallData(
        source.chain,
        source.depositAmount, // deposit full on-chain balance to Gateway
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
        description: `Approve and deposit ${formatUnits(source.depositAmount, USDC_DECIMALS)} USDC on ${source.chain}`,
      });
    }

    // Future steps (server-side, created as PENDING): burn net amount from Gateway
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
            amount: source.burnAmount.toString(), // burn net amount (leaves room for ~2% fee)
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

    // Step 1: Approve + Deposit on source (deposit extra to cover Gateway fee)
    const depositAmount = grossDepositAmount(amountRaw);
    const depositCalls = this.circleService.buildDepositCallData(
      dto.sourceChain,
      depositAmount,
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

    if (operation.status !== 'AWAITING_SIGNATURE') {
      throw new BadRequestException(
        `Operation is in ${operation.status} state, cannot submit signatures`,
      );
    }

    const user = await this.getUser(userId);

    // Mark submitted steps as CONFIRMED
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

    // Eagerly try burn intents + server-side mint
    const burnSteps = operation.steps.filter(
      (s) => s.type === 'BURN_INTENT' && s.status === 'PENDING',
    );

    const delegateKey = this.authService.getDelegatePrivateKey(user);
    const relayerKey = this.configService.get<string>('RELAYER_PRIVATE_KEY');
    const mintSteps = operation.steps.filter(
      (s) => s.type === 'MINT' && s.status === 'PENDING',
    );

    let mintIndex = 0;

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

        // Eagerly try server-side mint
        if (relayerKey && mintIndex < mintSteps.length) {
          const mintStep = mintSteps[mintIndex];
          try {
            const txHash = await this.gatewayService.executeMint(
              intentData.destinationChain,
              transfer.attestation,
              transfer.signature,
              relayerKey,
            );

            await this.prisma.operationStep.update({
              where: { id: mintStep.id },
              data: {
                status: 'CONFIRMED',
                txHash,
                completedAt: new Date(),
              },
            });

            this.logger.log(`Eager mint succeeded on ${intentData.destinationChain}: ${txHash}`);
          } catch (mintError) {
            this.logger.warn(
              `Eager mint failed on ${intentData.destinationChain}, worker will retry: ${mintError.message}`,
            );
          }
          mintIndex++;
        }
      } catch (error) {
        // Burn intent failed (deposit likely not finalized yet) — leave PENDING for worker
        this.logger.warn(
          `Burn intent failed for ${intentData.sourceChain}→${intentData.destinationChain}, worker will retry: ${error.message}`,
        );
      }
    }

    // Determine final status
    const freshSteps = await this.prisma.operationStep.findMany({
      where: { operationId },
    });

    const allDone = freshSteps.every(
      (s) => s.status === 'CONFIRMED' || s.status === 'SKIPPED',
    );

    if (allDone) {
      await this.prisma.operation.update({
        where: { id: operationId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } else {
      // Pending steps remain — background worker will continue
      await this.prisma.operation.update({
        where: { id: operationId },
        data: { status: 'PROCESSING' },
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
