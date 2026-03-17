import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { parseUnits, encodeFunctionData, erc20Abi } from 'viem';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AA_GATEWAY_CHAINS,
  getUsdcAddress,
  getTokenInfo,
  getTokenAddress,
  getTokensForChain,
  TOKEN_REGISTRY,
} from '../circle/config/chains';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SubmitPaymentDto } from './dto/submit-payment.dto';

/** Fee for external payments (0.5%) */
export const PAYMENT_FEE_PERCENT = '0.5';

/** USDC has 6 decimals on all chains */
const USDC_DECIMALS = 6;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a payment invoice.
   */
  async create(merchantId: string, dto: CreatePaymentDto) {
    const merchant = await this.prisma.user.findUnique({
      where: { id: merchantId },
      include: { delegateSetups: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const chain = dto.chain || 'polygon';
    const token = dto.token || 'USDC';

    // Validate chain
    if (!AA_GATEWAY_CHAINS[chain]) {
      throw new BadRequestException(`Unsupported chain: ${chain}`);
    }

    // Determine token address and decimals
    const tokenInfo = getTokenInfo(token);
    if (!tokenInfo) {
      throw new BadRequestException(
        `Unsupported token: ${token}. Supported: ${Object.keys(TOKEN_REGISTRY).join(', ')}`,
      );
    }
    const tokenAddress = getTokenAddress(token, chain);
    if (!tokenAddress) {
      throw new BadRequestException(
        `Token ${token} is not available on ${chain}`,
      );
    }
    const decimals = tokenInfo.decimals;

    const amountRaw = parseUnits(dto.amount, decimals).toString();
    const paymentId = randomBytes(8).toString('hex');

    const expiresAt = dto.expiresIn
      ? new Date(Date.now() + dto.expiresIn * 1000)
      : new Date(Date.now() + 3600 * 1000); // default 1 hour

    // Check if merchant has settlement capability (ECDSA module set up)
    const confirmedChains = merchant.delegateSetups
      .filter((d) => d.status === 'CONFIRMED')
      .map((d) => d.chain);
    const settlementEnabled = confirmedChains.length > 0;

    const payment = await this.prisma.payment.create({
      data: {
        paymentId,
        merchantId,
        amount: dto.amount,
        amountRaw,
        token,
        tokenAddress,
        chain,
        description: dto.description,
        metadata: dto.metadata ?? undefined,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
        expiresAt,
      },
    });

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const checkoutUrl = `${baseUrl}/pay.html?id=${payment.id}`;

    return {
      id: payment.id,
      paymentId: payment.paymentId,
      status: payment.status,
      amount: payment.amount,
      token: payment.token,
      chain: payment.chain,
      checkoutUrl,
      expiresAt: payment.expiresAt,
      acceptedChains: Object.keys(AA_GATEWAY_CHAINS),
      settlementEnabled,
      settlementChains: confirmedChains,
      ...(settlementEnabled ? {} : {
        warning: 'Settlement module not configured. Incoming funds will remain on the chain the payer sends to without conversion. Set up the ECDSA executor module to enable automatic settlement.',
      }),
    };
  }

  /**
   * Get payment details (public — for checkout page).
   * Includes pre-built calldata per chain for the payer.
   */
  async getById(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        merchant: {
          select: {
            username: true,
            walletAddress: true,
            delegateSetups: { where: { status: 'CONFIRMED' } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    // All chains always available for payers — no restrictions
    const acceptedChains = Object.keys(AA_GATEWAY_CHAINS);
    const paymentDetails: Record<
      string,
      { tokenAddress: string; calldata: string; amountRaw: string }
    > = {};

    for (const chainKey of acceptedChains) {
      const receiveTokenAddr = getTokenAddress(payment.token, chainKey)
        || getUsdcAddress(chainKey);
      const calldata = this.buildCalldata(
        payment.merchant.walletAddress as `0x${string}`,
        BigInt(payment.amountRaw),
        payment.paymentId,
      );
      paymentDetails[chainKey] = {
        tokenAddress: receiveTokenAddr,
        calldata,
        amountRaw: payment.amountRaw,
      };
    }

    // Available payer tokens per chain (stablecoins only — no price feeds yet)
    const STABLECOINS = new Set(['USDC', 'USDT', 'DAI']);
    const payerTokens: Record<string, { symbol: string; name: string; address: string; decimals: number }[]> = {};
    for (const chainKey of acceptedChains) {
      payerTokens[chainKey] = getTokensForChain(chainKey)
        .filter((t) => STABLECOINS.has(t.symbol))
        .map((t) => ({
          symbol: t.symbol,
          name: t.name,
          address: t.addresses[chainKey]!,
          decimals: t.decimals,
        }));
    }

    return {
      id: payment.id,
      paymentId: payment.paymentId,
      status: payment.status,
      amount: payment.amount,
      token: payment.token,
      chain: payment.chain,
      description: payment.description,
      expiresAt: payment.expiresAt,
      recipient: payment.merchant.walletAddress,
      merchantName: payment.merchant.username,
      acceptedChains,
      paymentDetails,
      payerTokens,
      successUrl: payment.successUrl,
      cancelUrl: payment.cancelUrl,
      // Don't expose merchant internals
      ...(payment.status === 'COMPLETED'
        ? {
            payerAddress: payment.payerAddress,
            completedAt: payment.completedAt,
            netAmount: payment.netAmount,
          }
        : {}),
    };
  }

  /**
   * List merchant's payments.
   */
  async list(
    merchantId: string,
    query?: { status?: string; limit?: number; offset?: number },
  ) {
    const where: any = { merchantId };
    if (query?.status) where.status = query.status;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      payments,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  /**
   * Cancel a payment (merchant only).
   */
  async cancel(merchantId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.merchantId !== merchantId)
      throw new ForbiddenException('Not your payment');
    if (payment.status !== 'PENDING')
      throw new BadRequestException(
        `Cannot cancel payment in ${payment.status} status`,
      );

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Submit payment proof (payer calls this after sending tx).
   */
  async submitPayment(
    paymentId: string,
    dto: SubmitPaymentDto,
    payerUserId?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING')
      throw new BadRequestException(
        `Payment is ${payment.status}, cannot submit`,
      );
    if (payment.expiresAt && payment.expiresAt < new Date())
      throw new BadRequestException('Payment has expired');

    if (dto.internal) {
      // OmniFlow internal payment
      if (!payerUserId) throw new BadRequestException('Login required for internal payment');
      if (payerUserId === payment.merchantId)
        throw new BadRequestException('Cannot pay yourself');

      // TODO: implement internal transfer (Gateway burn/mint or on-chain transfer)
      return this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PROCESSING',
          payerUserId,
          payerChain: payment.chain,
          payerToken: 'USDC',
        },
      });
    }

    // External wallet payment
    if (!dto.txHash) throw new BadRequestException('txHash required');
    if (!dto.chain) throw new BadRequestException('chain required');
    if (!dto.payerAddress) throw new BadRequestException('payerAddress required');

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PROCESSING',
        payerTxHash: dto.txHash,
        payerChain: dto.chain,
        payerAddress: dto.payerAddress,
        payerToken: dto.token || 'USDC',
      },
    });
  }

  // ── Helpers ───────────────────────────────────────

  /**
   * Build ERC20 transfer calldata with paymentId appended.
   * Standard transfer(address,uint256) = 68 bytes, then paymentId bytes follow.
   */
  private buildCalldata(
    recipient: `0x${string}`,
    amountRaw: bigint,
    paymentId: string,
  ): string {
    const transferCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, amountRaw],
    });
    // Append paymentId hex (without 0x prefix) after standard calldata
    return transferCalldata + paymentId;
  }

  /**
   * Extract paymentId from tx calldata.
   * Standard ERC20 transfer calldata = 4 (selector) + 32 (address) + 32 (amount) = 68 bytes = 136 hex chars.
   */
  extractPaymentId(txData: string): string | null {
    const raw = txData.startsWith('0x') ? txData.slice(2) : txData;
    if (raw.length <= 136) return null;
    return raw.slice(136);
  }
}
