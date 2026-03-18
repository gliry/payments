import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SendService } from './send.service';
import { CollectService } from './collect.service';
import { SwapDepositService } from './swap-deposit.service';
import { SubmitService } from './submit.service';
import { PrepareCollectDto } from './dto/prepare-collect.dto';
import { PrepareSendDto } from './dto/prepare-send.dto';
import { PrepareSwapDepositDto } from './dto/prepare-swap-deposit.dto';
import { SubmitOperationDto } from './dto/submit-operation.dto';

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sendService: SendService,
    private readonly collectService: CollectService,
    private readonly swapDepositService: SwapDepositService,
    private readonly submitService: SubmitService,
  ) {}

  async prepareCollect(userId: string, dto: PrepareCollectDto) {
    return this.collectService.prepareCollect(userId, dto);
  }

  async prepareSwapDeposit(userId: string, dto: PrepareSwapDepositDto) {
    return this.swapDepositService.prepareSwapDeposit(userId, dto);
  }

  async prepareSend(userId: string, dto: PrepareSendDto) {
    return this.sendService.prepareSend(userId, dto);
  }

  async submitOperation(userId: string, operationId: string, dto: SubmitOperationDto) {
    return this.submitService.submitOperation(userId, operationId, dto);
  }

  async refreshSwapQuote(userId: string, operationId: string) {
    return this.sendService.refreshSwapQuote(userId, operationId);
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
}
