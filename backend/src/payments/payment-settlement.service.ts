import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
import { GatewayService } from '../circle/gateway/gateway.service';
import { UserOpService } from '../circle/userop.service';
import { AuthService } from '../auth/auth.service';
import { LifiService } from '../lifi/lifi.service';
import {
  AA_GATEWAY_CHAINS,
  getUsdcAddress,
  getTokenAddress,
} from '../circle/config/chains';
import { buildGatewayDepositCalls } from '../circle/gateway/gateway.operations';
import {
  isAttestationConsumed,
  isAttestationExpired,
} from '../circle/gateway/gateway.errors';
import { effectiveSwapSlippage } from '../operations/helpers/fee.util';

/**
 * Settlement phases for cross-chain / cross-token payments.
 *
 * Full flow (worst case: different token + different chain):
 *   SWAP_TO_USDC → APPROVE_DEPOSIT → BURN_INTENT → MINT → SWAP_TO_MERCHANT_TOKEN → COMPLETED
 *
 * Same token, cross-chain:
 *   APPROVE_DEPOSIT → BURN_INTENT → MINT → COMPLETED
 *
 * Different token, same chain:
 *   SWAP_TO_MERCHANT_TOKEN → COMPLETED
 */
export type SettlementPhase =
  | 'SWAP_TO_USDC'            // Swap payer's non-USDC token → USDC on source chain
  | 'APPROVE_DEPOSIT'         // Approve + deposit USDC to Gateway on source chain
  | 'BURN_INTENT'             // Submit burn intent (delegate EIP-712 signature)
  | 'MINT'                    // Execute mint on destination chain
  | 'SWAP_TO_MERCHANT_TOKEN'  // Swap USDC → merchant's requested token on dest chain
  | 'COMPLETED'
  | 'FAILED';

interface SettlementState {
  [key: string]: unknown;
  phase: SettlementPhase;
  sourceChain: string;
  destChain: string;
  amount: string;              // raw amount in payer's token
  usdcAmount?: string;         // raw USDC amount (after swap or = amount if USDC)
  payerToken: string;          // token the payer sent (e.g. 'WETH')
  merchantToken: string;       // token the merchant wants (e.g. 'USDC')
  depositTxHash?: string;
  swapToUsdcTxHash?: string;
  swapToMerchantTxHash?: string;
  mintedAmount?: string;         // raw USDC minted on dest chain (after gateway fee)
  attestation?: string;
  operatorSignature?: string;
  mintTxHash?: string;
  error?: string;
  retries: number;
}

const MAX_RETRIES = 10;

@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly circleService: CircleService,
    private readonly gatewayService: GatewayService,
    private readonly userOpService: UserOpService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly lifiService: LifiService,
  ) {}

  /**
   * Initialize settlement for a payment that needs processing.
   * Determines the starting phase based on token/chain differences.
   */
  async initSettlement(
    paymentId: string,
    sourceChain: string,
    destChain: string,
    amountRaw: string,
    payerToken: string,
    merchantToken: string,
  ): Promise<void> {
    // Don't overwrite existing settlement state
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if ((payment?.metadata as any)?.settlement) {
      this.logger.log(`Settlement already exists for payment ${paymentId}, skipping init`);
      return;
    }

    const needsSwapToUsdc = payerToken !== 'USDC';
    const needsBridge = sourceChain !== destChain;
    const needsSwapToMerchant = merchantToken !== 'USDC';

    // Determine starting phase
    let phase: SettlementPhase;
    if (needsSwapToUsdc) {
      phase = 'SWAP_TO_USDC';
    } else if (needsBridge) {
      phase = 'APPROVE_DEPOSIT';
    } else if (needsSwapToMerchant) {
      phase = 'SWAP_TO_MERCHANT_TOKEN';
    } else {
      // Same chain, same token — shouldn't need settlement
      phase = 'COMPLETED';
    }

    const settlement: SettlementState = {
      phase,
      sourceChain,
      destChain,
      amount: amountRaw,
      usdcAmount: payerToken === 'USDC' ? amountRaw : undefined,
      payerToken,
      merchantToken,
      retries: 0,
    };

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PROCESSING',
        metadata: { settlement } as any,
      },
    });

    this.logger.log(
      `Settlement initialized for payment ${paymentId}: ` +
      `${payerToken} on ${sourceChain} → ${merchantToken} on ${destChain} ` +
      `(phase=${phase}, swapIn=${needsSwapToUsdc}, bridge=${needsBridge}, swapOut=${needsSwapToMerchant})`,
    );
  }

  /**
   * Process all in-progress settlements.
   */
  async processSettlements(): Promise<void> {
    const payments = await this.prisma.payment.findMany({
      where: { status: 'PROCESSING' },
      include: { merchant: true },
    });

    for (const payment of payments) {
      const metadata = payment.metadata as any;
      if (!metadata?.settlement) continue;

      const settlement = metadata.settlement as SettlementState;

      try {
        await this.processSettlement(payment, settlement);
      } catch (error) {
        this.logger.warn(
          `Settlement error for payment ${payment.id} (phase=${settlement.phase}): ${error.message}`,
        );

        settlement.retries = (settlement.retries || 0) + 1;
        if (settlement.retries > MAX_RETRIES) {
          settlement.phase = 'FAILED';
          settlement.error = `Max retries exceeded: ${error.message}`;
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              errorMessage: `Settlement failed after ${MAX_RETRIES} retries: ${error.message}`,
              metadata: { settlement } as any,
            },
          });
        } else {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { metadata: { settlement } as any },
          });
        }
      }
    }
  }

  private async processSettlement(payment: any, settlement: SettlementState) {
    switch (settlement.phase) {
      case 'SWAP_TO_USDC':
        await this.executeSwapToUsdc(payment, settlement);
        break;
      case 'APPROVE_DEPOSIT':
        await this.executeApproveDeposit(payment, settlement);
        break;
      case 'BURN_INTENT':
        await this.executeBurnIntent(payment, settlement);
        break;
      case 'MINT':
        await this.executeMint(payment, settlement);
        break;
      case 'SWAP_TO_MERCHANT_TOKEN':
        await this.executeSwapToMerchantToken(payment, settlement);
        break;
    }
  }

  // ── Phase: Swap payer's token → USDC on source chain ──────────────────

  private async executeSwapToUsdc(
    payment: any,
    settlement: SettlementState,
  ) {
    const merchant = payment.merchant;
    const sourceChain = settlement.sourceChain;
    const chainConfig = AA_GATEWAY_CHAINS[sourceChain];
    if (!chainConfig) throw new Error(`Unsupported chain: ${sourceChain}`);

    const payerTokenAddr = getTokenAddress(settlement.payerToken, sourceChain);
    if (!payerTokenAddr) throw new Error(`Token ${settlement.payerToken} not found on ${sourceChain}`);

    const usdcAddr = getUsdcAddress(sourceChain);
    const amount = BigInt(settlement.amount);

    // Verify ECDSA validator
    await this.requireEcdsaEnabled(sourceChain, merchant.walletAddress);

    this.logger.log(
      `Swapping ${settlement.payerToken} → USDC on ${sourceChain} for payment ${payment.id}`,
    );

    // Get LiFi quote
    const slippage = effectiveSwapSlippage(amount);
    const quote = await this.lifiService.getQuote({
      fromChain: chainConfig.chainId,
      toChain: chainConfig.chainId,
      fromToken: payerTokenAddr,
      toToken: usdcAddr,
      fromAmount: amount.toString(),
      fromAddress: merchant.walletAddress,
      slippage,
    });

    const swapCalls = this.lifiService.buildSwapCalls(quote, payerTokenAddr, amount);
    const delegateKey = this.authService.getDelegatePrivateKey(merchant);

    const txHash = await this.userOpService.executeServerSide(
      sourceChain,
      merchant.credentialId,
      merchant.publicKey,
      delegateKey,
      swapCalls,
    );

    // Use minimum expected output (after slippage) as USDC amount
    const usdcAmount = quote.estimate.toAmountMin || quote.estimate.toAmount;

    settlement.swapToUsdcTxHash = txHash;
    settlement.usdcAmount = usdcAmount;
    settlement.retries = 0;

    // Next phase depends on whether bridge is needed
    if (sourceChain !== settlement.destChain) {
      settlement.phase = 'APPROVE_DEPOSIT';
    } else if (settlement.merchantToken !== 'USDC') {
      settlement.phase = 'SWAP_TO_MERCHANT_TOKEN';
    } else {
      settlement.phase = 'COMPLETED';
      await this.completePayment(payment, settlement, BigInt(usdcAmount));
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { metadata: { settlement } as any },
    });

    this.logger.log(
      `Swap ${settlement.payerToken} → USDC done for payment ${payment.id}: txHash=${txHash}, usdcAmount=${usdcAmount}`,
    );
  }

  // ── Phase: Approve + Deposit USDC to Gateway ──────────────────────────

  private async executeApproveDeposit(
    payment: any,
    settlement: SettlementState,
  ) {
    const merchant = payment.merchant;
    const sourceChain = settlement.sourceChain;
    const usdcAmount = BigInt(settlement.usdcAmount || settlement.amount);

    const usdcAddress = getUsdcAddress(sourceChain);
    const calls = buildGatewayDepositCalls(usdcAddress, usdcAmount);

    await this.requireEcdsaEnabled(sourceChain, merchant.walletAddress);

    const delegateKey = this.authService.getDelegatePrivateKey(merchant);

    this.logger.log(
      `Executing approve+deposit for payment ${payment.id} on ${sourceChain} (${usdcAmount} raw USDC)`,
    );

    const txHash = await this.userOpService.executeServerSide(
      sourceChain,
      merchant.credentialId,
      merchant.publicKey,
      delegateKey,
      calls,
    );

    settlement.depositTxHash = txHash;
    settlement.phase = 'BURN_INTENT';
    settlement.retries = 0;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { metadata: { settlement } as any },
    });

    this.logger.log(
      `Approve+deposit done for payment ${payment.id}: txHash=${txHash}`,
    );
  }

  // ── Phase: Burn Intent ────────────────────────────────────────────────

  private async executeBurnIntent(
    payment: any,
    settlement: SettlementState,
  ) {
    const merchant = payment.merchant;
    const delegateKey = this.authService.getDelegatePrivateKey(merchant);
    const depositedAmount = BigInt(settlement.usdcAmount || settlement.amount);

    // Gateway fee = gas fee + (amount × 0.005%).
    // See: https://developers.circle.com/gateway/references/fees
    // Gas fees range $0.001 (cheap L2s) to $2.00 (Ethereum).
    // We reserve: transferFee (0.01% with buffer) + gasFee per chain.
    const transferFee = (depositedAmount * 10n) / 100000n; // 0.01% (2× buffer over 0.005%)
    // Gas fees from https://developers.circle.com/gateway/references/fees
    // Values include ~50% buffer over documented fees.
    const gasFees: Record<string, bigint> = {
      ethereum: 3_000_000n,   // $2.00 → $3.00 buffer
      base: 15_000n,          // $0.01 → $0.015
      avalanche: 30_000n,     // $0.02 → $0.03
      arbitrum: 15_000n,      // $0.01 → $0.015
      optimism: 2_500n,       // $0.0015 → $0.0025
      polygon: 2_500n,        // $0.0015 → $0.0025
      sonic: 15_000n,         // $0.01 → $0.015
      unichain: 2_000n,       // $0.001 → $0.002
      sei: 2_000n,            // $0.001 → $0.002
      worldchain: 15_000n,    // $0.01 → $0.015
      hyperevm: 75_000n,      // $0.05 → $0.075
    };
    const chainGasFee = gasFees[settlement.sourceChain] ?? 30_000n; // default $0.03
    const gatewayFee = transferFee + chainGasFee;
    const burnAmount = depositedAmount - gatewayFee;

    this.logger.log(
      `Submitting burn intent for payment ${payment.id}: ${settlement.sourceChain} → ${settlement.destChain} ` +
      `(deposited=${depositedAmount}, fee=${gatewayFee}, burn=${burnAmount})`,
    );

    const { transfer } = await this.circleService.submitBurnIntent(
      settlement.sourceChain,
      settlement.destChain,
      burnAmount,
      merchant.walletAddress,
      merchant.walletAddress,
      delegateKey,
    );

    settlement.attestation = transfer.attestation;
    settlement.operatorSignature = transfer.signature;
    settlement.mintedAmount = burnAmount.toString();
    settlement.phase = 'MINT';
    settlement.retries = 0;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { metadata: { settlement } as any },
    });

    this.logger.log(
      `Burn intent confirmed for payment ${payment.id}, attestation received (mintedAmount=${burnAmount})`,
    );
  }

  // ── Phase: Mint on destination chain ──────────────────────────────────

  private async executeMint(
    payment: any,
    settlement: SettlementState,
  ) {
    const relayerKey = this.configService.get<string>('RELAYER_PRIVATE_KEY');
    if (!relayerKey) throw new Error('RELAYER_PRIVATE_KEY not configured');

    if (!settlement.attestation || !settlement.operatorSignature) {
      throw new Error('Missing attestation for mint');
    }

    this.logger.log(
      `Executing mint for payment ${payment.id} on ${settlement.destChain}`,
    );

    try {
      const txHash = await this.gatewayService.executeMint(
        settlement.destChain,
        settlement.attestation,
        settlement.operatorSignature,
        relayerKey,
      );

      settlement.mintTxHash = txHash;
      settlement.retries = 0;

      // If merchant wants non-USDC, swap after mint
      if (settlement.merchantToken !== 'USDC') {
        settlement.phase = 'SWAP_TO_MERCHANT_TOKEN';
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { metadata: { settlement } as any },
        });
        this.logger.log(
          `Mint done for payment ${payment.id}: txHash=${txHash}. Next: swap USDC → ${settlement.merchantToken}`,
        );
      } else {
        // Done — USDC is already what merchant wants
        const usdcAmount = BigInt(settlement.usdcAmount || settlement.amount);
        await this.completePayment(payment, settlement, usdcAmount);
      }
    } catch (error) {
      const msg = error.message || '';

      if (isAttestationConsumed(msg)) {
        this.logger.log(
          `Payment ${payment.id}: attestation already consumed — continuing`,
        );
        if (settlement.merchantToken !== 'USDC') {
          settlement.phase = 'SWAP_TO_MERCHANT_TOKEN';
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { metadata: { settlement } as any },
          });
        } else {
          const usdcAmount = BigInt(settlement.usdcAmount || settlement.amount);
          await this.completePayment(payment, settlement, usdcAmount);
        }
        return;
      }

      if (isAttestationExpired(msg)) {
        settlement.phase = 'FAILED';
        settlement.error = 'Attestation expired';
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Cross-chain settlement failed: attestation expired',
            metadata: { settlement } as any,
          },
        });
        return;
      }

      throw error;
    }
  }

  // ── Phase: Swap USDC → merchant's requested token on dest chain ───────

  private async executeSwapToMerchantToken(
    payment: any,
    settlement: SettlementState,
  ) {
    const merchant = payment.merchant;
    const destChain = settlement.destChain;
    const chainConfig = AA_GATEWAY_CHAINS[destChain];
    if (!chainConfig) throw new Error(`Unsupported chain: ${destChain}`);

    const merchantTokenAddr = getTokenAddress(settlement.merchantToken, destChain);
    if (!merchantTokenAddr) throw new Error(`Token ${settlement.merchantToken} not found on ${destChain}`);

    const usdcAddr = getUsdcAddress(destChain);
    // Use mintedAmount (after gateway fee) if available, otherwise full usdcAmount
    const swapAmount = BigInt(settlement.mintedAmount || settlement.usdcAmount || settlement.amount);

    await this.requireEcdsaEnabled(destChain, merchant.walletAddress);

    this.logger.log(
      `Swapping ${swapAmount} USDC → ${settlement.merchantToken} on ${destChain} for payment ${payment.id}`,
    );

    const slippage = effectiveSwapSlippage(swapAmount);
    const quote = await this.lifiService.getQuote({
      fromChain: chainConfig.chainId,
      toChain: chainConfig.chainId,
      fromToken: usdcAddr,
      toToken: merchantTokenAddr,
      fromAmount: swapAmount.toString(),
      fromAddress: merchant.walletAddress,
      slippage,
    });

    const swapCalls = this.lifiService.buildSwapCalls(quote, usdcAddr, swapAmount);
    const delegateKey = this.authService.getDelegatePrivateKey(merchant);

    const txHash = await this.userOpService.executeServerSide(
      destChain,
      merchant.credentialId,
      merchant.publicKey,
      delegateKey,
      swapCalls,
    );

    settlement.swapToMerchantTxHash = txHash;
    await this.completePayment(payment, settlement, swapAmount);

    this.logger.log(
      `Swap USDC → ${settlement.merchantToken} done for payment ${payment.id}: txHash=${txHash}`,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async completePayment(
    payment: any,
    settlement: SettlementState,
    usdcAmount: bigint,
  ) {
    const feePercent = '0.5';
    const feeAmount = (usdcAmount * 5n) / 1000n;
    const netAmount = usdcAmount - feeAmount;

    settlement.phase = 'COMPLETED';

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        feePercent,
        feeAmount: feeAmount.toString(),
        netAmount: netAmount.toString(),
        metadata: { settlement } as any,
      },
    });

    this.logger.log(
      `Payment ${payment.id} COMPLETED. Net: ${netAmount} (fee: ${feeAmount})`,
    );
  }

  private async requireEcdsaEnabled(chain: string, walletAddress: string) {
    const isEnabled = await this.userOpService.isEcdsaValidatorEnabled(
      chain, walletAddress,
    );
    if (!isEnabled) {
      throw new Error(
        `ECDSA validator not enabled for ${walletAddress} on ${chain}. ` +
        `Merchant must call POST /wallet/enable-executor first.`,
      );
    }
  }
}
