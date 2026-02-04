import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { CreateBatchPayoutDto } from './dto/create-batch-payout.dto';

@Injectable()
export class PayoutsService {
  constructor(private prisma: PrismaService) {}

  async create(createPayoutDto: CreatePayoutDto) {
    // Calculate fee (placeholder logic)
    const amount = parseFloat(createPayoutDto.amount);
    const feePercent = createPayoutDto.destination.chain === 'arc-testnet' ? 0.1 : 0.4;
    const feeAmount = (amount * feePercent) / 100;
    const totalDeducted = amount + feeAmount;

    const payout = await this.prisma.payout.create({
      data: {
        accountId: createPayoutDto.accountId,
        amount: createPayoutDto.amount,
        currency: createPayoutDto.currency || 'USDC',
        destinationAddress: createPayoutDto.destination.address,
        destinationChain: createPayoutDto.destination.chain,
        destinationToken: createPayoutDto.destination.token,
        feePercent: feePercent.toString(),
        feeAmount: feeAmount.toFixed(2),
        totalDeducted: totalDeducted.toFixed(2),
        metadata: createPayoutDto.metadata,
        status: 'PENDING',
      },
      include: {
        account: {
          select: {
            email: true,
          },
        },
      },
    });

    return payout;
  }

  async createBatch(dto: CreateBatchPayoutDto) {
    // Create batch record
    const batch = await this.prisma.payoutBatch.create({
      data: {
        accountId: dto.accountId,
        status: 'PENDING',
        metadata: dto.metadata,
      },
    });

    // Create individual payouts
    const payouts = await Promise.all(
      dto.payouts.map((payoutDto) =>
        this.create({
          accountId: dto.accountId,
          ...payoutDto,
        }),
      ),
    );

    // Update batch with totals
    const totalAmount = payouts.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0,
    );
    const totalFees = payouts.reduce(
      (sum, p) => sum + parseFloat(p.feeAmount || '0'),
      0,
    );

    await this.prisma.payoutBatch.update({
      where: { id: batch.id },
      data: {
        totalAmount: totalAmount.toFixed(2),
        totalFees: totalFees.toFixed(2),
      },
    });

    return {
      batchId: batch.id,
      status: batch.status,
      payouts,
      totalAmount: totalAmount.toFixed(2),
      totalFees: totalFees.toFixed(2),
    };
  }

  async findAll() {
    const payouts = await this.prisma.payout.findMany({
      include: {
        account: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: payouts, count: payouts.length };
  }

  async findOne(id: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
      include: {
        account: true,
        batch: true,
      },
    });

    if (!payout) {
      throw new NotFoundException(`Payout with ID ${id} not found`);
    }

    return payout;
  }

  async findBatch(id: string) {
    const batch = await this.prisma.payoutBatch.findUnique({
      where: { id },
      include: {
        payouts: true,
      },
    });

    if (!batch) {
      throw new NotFoundException(`Batch payout with ID ${id} not found`);
    }

    return batch;
  }
}
