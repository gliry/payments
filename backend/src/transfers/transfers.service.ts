import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransfersService {
  constructor(private prisma: PrismaService) {}

  async create(createTransferDto: CreateTransferDto) {
    // Validate accounts exist
    const fromAccount = await this.prisma.account.findUnique({
      where: { id: createTransferDto.fromAccountId },
    });

    if (!fromAccount) {
      throw new NotFoundException(
        `Account ${createTransferDto.fromAccountId} not found`,
      );
    }

    // Handle "to" field (can be email, account_id, or ENS)
    let toAccountId: string;

    if (createTransferDto.to.includes('@') && !createTransferDto.to.includes('.eth')) {
      // Email lookup
      const toAccount = await this.prisma.account.findUnique({
        where: { email: createTransferDto.to },
      });

      if (!toAccount) {
        throw new NotFoundException(
          `Account with email ${createTransferDto.to} not found`,
        );
      }

      toAccountId = toAccount.id;
    } else if (createTransferDto.to.endsWith('.eth')) {
      // ENS lookup (TODO: implement ENS resolution)
      throw new BadRequestException('ENS resolution not yet implemented');
    } else {
      // Assume it's an account ID
      const toAccount = await this.prisma.account.findUnique({
        where: { id: createTransferDto.to },
      });

      if (!toAccount) {
        throw new NotFoundException(
          `Account ${createTransferDto.to} not found`,
        );
      }

      toAccountId = toAccount.id;
    }

    // Create transfer (instant and free for internal transfers)
    const transfer = await this.prisma.transfer.create({
      data: {
        fromAccountId: createTransferDto.fromAccountId,
        toAccountId,
        amount: createTransferDto.amount,
        currency: createTransferDto.currency || 'USDC',
        feeAmount: '0', // Internal transfers are free
        metadata: createTransferDto.metadata,
        status: 'COMPLETED', // Internal transfers are instant
        completedAt: new Date(),
      },
      include: {
        fromAccount: {
          select: {
            email: true,
          },
        },
        toAccount: {
          select: {
            email: true,
          },
        },
      },
    });

    return transfer;
  }

  async findAll() {
    const transfers = await this.prisma.transfer.findMany({
      include: {
        fromAccount: {
          select: {
            email: true,
          },
        },
        toAccount: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: transfers, count: transfers.length };
  }

  async findOne(id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        fromAccount: true,
        toAccount: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer with ID ${id} not found`);
    }

    return transfer;
  }
}
