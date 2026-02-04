import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateDepositAddressDto } from './dto/create-deposit-address.dto';

@Injectable()
export class DepositsService {
  constructor(private prisma: PrismaService) {}

  async createAddress(dto: CreateDepositAddressDto) {
    // TODO: Implement Circle Gateway address generation
    // For now, return a placeholder
    return {
      accountId: dto.accountId,
      chain: dto.chain,
      address: '0x0000000000000000000000000000000000000000', // Placeholder
      feePercent: '0.4',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  async create(createDepositDto: CreateDepositDto) {
    const deposit = await this.prisma.deposit.create({
      data: {
        accountId: createDepositDto.accountId,
        expectedAmount: createDepositDto.expectedAmount,
        sourceChain: createDepositDto.sourceChain,
        metadata: createDepositDto.metadata,
        status: 'AWAITING',
        feePercent: '0.4',
      },
      include: {
        account: {
          select: {
            email: true,
            walletAddress: true,
          },
        },
      },
    });

    return deposit;
  }

  async findAll() {
    const deposits = await this.prisma.deposit.findMany({
      include: {
        account: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: deposits, count: deposits.length };
  }

  async findOne(id: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id },
      include: {
        account: true,
      },
    });

    if (!deposit) {
      throw new NotFoundException(`Deposit with ID ${id} not found`);
    }

    return deposit;
  }
}
