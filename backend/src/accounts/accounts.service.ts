import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async create(createAccountDto: CreateAccountDto) {
    const account = await this.prisma.account.create({
      data: createAccountDto,
    });

    return {
      id: account.id,
      email: account.email,
      externalId: account.externalId,
      walletAddress: account.walletAddress,
      metadata: account.metadata,
      createdAt: account.createdAt,
    };
  }

  async findAll() {
    const accounts = await this.prisma.account.findMany({
      select: {
        id: true,
        email: true,
        externalId: true,
        walletAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: accounts, count: accounts.length };
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            deposits: true,
            payouts: true,
            transfersFrom: true,
            transfersTo: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }

    return account;
  }

  async getBalance(id: string) {
    // Verify account exists
    await this.findOne(id);

    // TODO: Implement actual balance calculation
    // This is a placeholder that will be implemented with Circle integration
    return {
      accountId: id,
      balance: '0.00',
      currency: 'USDC',
      lastUpdated: new Date().toISOString(),
    };
  }

  async update(id: string, updateAccountDto: UpdateAccountDto) {
    const account = await this.prisma.account.update({
      where: { id },
      data: updateAccountDto,
    });

    return account;
  }
}
