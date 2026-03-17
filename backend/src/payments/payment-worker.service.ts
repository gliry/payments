import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { PaymentSettlementService } from './payment-settlement.service';
import { AA_GATEWAY_CHAINS, getUsdcAddress, getTokenAddress } from '../circle/config/chains';

const WORKER_INTERVAL_MS = 30_000;

/** Transfer event topic for ERC20 */
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

@Injectable()
export class PaymentWorkerService {
  private readonly logger = new Logger(PaymentWorkerService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly settlementService: PaymentSettlementService,
  ) {}

  @Interval(WORKER_INTERVAL_MS)
  async processPayments() {
    if (this.processing) return;
    this.processing = true;

    try {
      await this.expirePendingPayments();
      await this.scanForPayments();
      await this.verifyProcessingPayments();
      await this.settlementService.processSettlements();
    } catch (error) {
      this.logger.error('Payment worker error', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Expire payments past their expiresAt.
   */
  private async expirePendingPayments() {
    const expired = await this.prisma.payment.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    if (expired.count > 0) {
      this.logger.log(`Expired ${expired.count} payment(s)`);
    }
  }

  /**
   * Scan Transfer events on-chain to detect payments that didn't submit txHash.
   * Groups by merchant+chain for efficiency.
   */
  private async scanForPayments() {
    const pendingPayments = await this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        payerTxHash: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        merchant: { select: { walletAddress: true } },
      },
    });

    if (pendingPayments.length === 0) return;

    // Group by merchant wallet + chain
    const groups = new Map<
      string,
      { walletAddress: string; chain: string; payments: typeof pendingPayments }
    >();

    // Get confirmed delegate chains per merchant
    const merchantIds = [...new Set(pendingPayments.map((p) => p.merchantId))];
    const delegates = await this.prisma.delegateSetup.findMany({
      where: { userId: { in: merchantIds }, status: 'CONFIRMED' },
    });
    const merchantChains = new Map<string, Set<string>>();
    for (const d of delegates) {
      if (!merchantChains.has(d.userId)) merchantChains.set(d.userId, new Set());
      merchantChains.get(d.userId)!.add(d.chain);
    }

    for (const payment of pendingPayments) {
      const acceptedChains = merchantChains.get(payment.merchantId) || new Set();
      for (const chainKey of acceptedChains) {
        const key = `${payment.merchant.walletAddress}:${chainKey}`;
        if (!groups.has(key)) {
          groups.set(key, {
            walletAddress: payment.merchant.walletAddress,
            chain: chainKey,
            payments: [],
          });
        }
        groups.get(key)!.payments.push(payment);
      }
    }

    for (const [, group] of groups) {
      try {
        await this.scanChainForGroup(group);
      } catch {
        // RPC failures are expected (public RPCs), silently skip
      }
    }
  }

  private async scanChainForGroup(group: {
    walletAddress: string;
    chain: string;
    payments: Array<{
      id: string;
      paymentId: string;
      amountRaw: string;
      lastScannedBlock: any;
    }>;
  }) {
    const chainConfig = AA_GATEWAY_CHAINS[group.chain];
    if (!chainConfig) return;

    const client = createPublicClient({
      transport: http(chainConfig.rpc),
    });

    const latestBlock = await client.getBlockNumber();

    // Use lastScannedBlock from first payment, or look back ~100 blocks
    const firstPayment = group.payments[0];
    const scannedBlocks =
      (firstPayment.lastScannedBlock as Record<string, number>) || {};
    const fromBlock = BigInt(
      scannedBlocks[group.chain] || Number(latestBlock) - 100,
    );

    if (fromBlock >= latestBlock) return;

    const usdcAddress = getUsdcAddress(group.chain);
    const recipientPadded =
      '0x000000000000000000000000' +
      group.walletAddress.slice(2).toLowerCase();

    const logs = await client.getLogs({
      address: usdcAddress as `0x${string}`,
      event: parseAbiItem(
        'event Transfer(address indexed from, address indexed to, uint256 value)',
      ),
      args: { to: group.walletAddress as `0x${string}` },
      fromBlock,
      toBlock: latestBlock,
    });

    // Build paymentId lookup
    const paymentMap = new Map(
      group.payments.map((p) => [p.paymentId, p]),
    );

    for (const log of logs) {
      try {
        const tx = await client.getTransaction({
          hash: log.transactionHash,
        });

        const extractedId = this.paymentsService.extractPaymentId(tx.input);
        if (!extractedId) continue;

        const payment = paymentMap.get(extractedId);
        if (!payment) continue;

        this.logger.log(
          `Detected payment ${payment.id} via scan on ${group.chain} tx=${log.transactionHash}`,
        );

        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PROCESSING',
            payerTxHash: log.transactionHash,
            payerChain: group.chain,
            payerAddress: tx.from,
            payerToken: 'USDC',
          },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to process log tx=${log.transactionHash}: ${error}`,
        );
      }
    }

    // Update lastScannedBlock for all payments in this group
    for (const payment of group.payments) {
      const existing =
        (payment.lastScannedBlock as Record<string, number>) || {};
      existing[group.chain] = Number(latestBlock);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { lastScannedBlock: existing },
      });
    }
  }

  /**
   * Verify PROCESSING payments — check on-chain that the tx is valid.
   * For same-chain USDC payments: verify Transfer event, mark COMPLETED.
   * For cross-chain: create settlement Operation (TODO).
   */
  private async verifyProcessingPayments() {
    const processing = await this.prisma.payment.findMany({
      where: { status: 'PROCESSING' },
      include: {
        merchant: { select: { walletAddress: true } },
      },
    });

    for (const payment of processing) {
      try {
        await this.verifyPayment(payment);
      } catch (error) {
        this.logger.warn(
          `Verify failed for payment ${payment.id}: ${error}`,
        );
      }
    }
  }

  private async verifyPayment(
    payment: any & { merchant: { walletAddress: string } },
  ) {
    if (!payment.payerTxHash || !payment.payerChain) return;

    const chainConfig = AA_GATEWAY_CHAINS[payment.payerChain];
    if (!chainConfig) return;

    const client = createPublicClient({
      transport: http(chainConfig.rpc),
    });

    const receipt = await client.getTransactionReceipt({
      hash: payment.payerTxHash as `0x${string}`,
    });

    if (receipt.status !== 'success') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Transaction reverted on-chain',
        },
      });
      return;
    }

    // Find Transfer event to merchantWallet — check payer's token
    const payerToken = payment.payerToken || 'USDC';
    const payerTokenAddr = payerToken === 'USDC'
      ? getUsdcAddress(payment.payerChain)
      : getTokenAddress(payerToken, payment.payerChain) || getUsdcAddress(payment.payerChain);
    const merchantAddr = payment.merchant.walletAddress.toLowerCase();

    const transferLog = receipt.logs.find(
      (log) =>
        log.address.toLowerCase() === payerTokenAddr.toLowerCase() &&
        log.topics[0] === TRANSFER_TOPIC &&
        log.topics[2] &&
        log.topics[2].slice(26).toLowerCase() === merchantAddr.slice(2),
    );

    if (!transferLog) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          errorMessage: `No ${payerToken} transfer to merchant found in tx`,
        },
      });
      return;
    }

    const transferredAmount = BigInt(transferLog.data);

    // Determine if settlement is needed
    const isSameChain = payment.payerChain === payment.chain;
    const isSameToken = payerToken === payment.token;

    if (isSameChain && isSameToken) {
      // Simplest case: same chain, same token — check amount and complete
      const expectedAmount = BigInt(payment.amountRaw);
      if (transferredAmount < expectedAmount) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            errorMessage: `Insufficient amount: got ${transferredAmount}, expected ${expectedAmount}`,
          },
        });
        return;
      }

      const feePercent = '0.5';
      const feeAmount = (transferredAmount * 5n) / 1000n;
      const netAmount = transferredAmount - feeAmount;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          feePercent,
          feeAmount: feeAmount.toString(),
          netAmount: netAmount.toString(),
        },
      });

      this.logger.log(
        `Payment ${payment.id} COMPLETED (same-chain, same-token). Net: ${netAmount}`,
      );
    } else {
      // Needs settlement: cross-chain, cross-token, or both
      // Check if merchant has ECDSA module set up for settlement
      const delegateSetup = await this.prisma.delegateSetup.findFirst({
        where: {
          userId: payment.merchantId,
          chain: payment.payerChain,
          status: 'CONFIRMED',
        },
      });

      if (!delegateSetup) {
        // No settlement module — complete immediately, funds stay as-is
        this.logger.log(
          `Payment ${payment.id}: settlement needed but merchant has no ECDSA module on ${payment.payerChain}. Completing without settlement — funds remain as ${payerToken} on ${payment.payerChain}.`,
        );
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            feePercent: '0',
            feeAmount: '0',
            netAmount: transferredAmount.toString(),
            errorMessage: `No settlement: funds received as ${payerToken} on ${payment.payerChain} (merchant ECDSA module not configured)`,
          },
        });
        return;
      }

      const existing = (payment as any).metadata?.settlement;
      if (!existing) {
        this.logger.log(
          `Payment ${payment.id}: settlement needed (${payerToken} on ${payment.payerChain} → ${payment.token} on ${payment.chain}). Initiating.`,
        );

        await this.settlementService.initSettlement(
          payment.id,
          payment.payerChain,
          payment.chain,
          transferredAmount.toString(),
          payerToken,
          payment.token,
        );
      }
    }
  }
}
