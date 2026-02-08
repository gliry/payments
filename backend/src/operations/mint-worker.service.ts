import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
import { GatewayService } from '../circle/gateway/gateway.service';
import { LifiService } from '../lifi/lifi.service';
import { AuthService } from '../auth/auth.service';
import { ALL_CHAINS, getUsdcAddress } from '../circle/config/chains';

/**
 * Calculate effective slippage for LiFi swaps — mirrors the function in operations.service.ts.
 * Small amounts need higher slippage to avoid MinimalOutputBalanceViolation reverts.
 */
function effectiveSwapSlippage(usdcAmount: bigint, userSlippage?: number): number {
  const usdc = Number(usdcAmount) / 1e6;
  if (usdc < 1) return Math.max(userSlippage ?? 0, 0.05);
  if (usdc < 10) return Math.max(userSlippage ?? 0, 0.03);
  if (usdc < 100) return Math.max(userSlippage ?? 0, 0.01);
  return userSlippage ?? 0.005;
}

const WORKER_INTERVAL_MS = 30_000;
const STEP_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class MintWorkerService {
  private readonly logger = new Logger(MintWorkerService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly circleService: CircleService,
    private readonly gatewayService: GatewayService,
    private readonly lifiService: LifiService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Interval(WORKER_INTERVAL_MS)
  async processOperations() {
    if (this.processing) return;
    this.processing = true;

    try {
      const operations = await this.prisma.operation.findMany({
        where: { status: 'PROCESSING' },
        include: {
          steps: { orderBy: { stepIndex: 'asc' } },
          user: true,
        },
      });

      if (operations.length > 0) {
        this.logger.debug(`Processing ${operations.length} pending operation(s)`);
      }

      for (const op of operations) {
        try {
          await this.processOperation(op);
        } catch (error) {
          this.logger.error(
            `Error processing operation ${op.id}: ${error.message}`,
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async processOperation(op: any) {
    // 1. Process PENDING burn intents
    const pendingBurns = op.steps.filter(
      (s: any) => s.type === 'BURN_INTENT' && s.status === 'PENDING',
    );

    for (const step of pendingBurns) {
      if (this.isTimedOut(step)) {
        await this.failStep(step.id, 'Timeout waiting for deposit finality');
        await this.failOperation(op.id, 'Deposit finality timeout');
        return;
      }
      await this.tryBurnIntent(op, step);
    }

    // 2. Process PENDING mints that have a confirmed burn with attestation
    const pendingMints = op.steps.filter(
      (s: any) => s.type === 'MINT' && s.status === 'PENDING',
    );

    // Re-fetch steps to get updated burn statuses
    const freshSteps = await this.prisma.operationStep.findMany({
      where: { operationId: op.id },
      orderBy: { stepIndex: 'asc' },
    });

    const confirmedBurns = freshSteps.filter(
      (s) => s.type === 'BURN_INTENT' && s.status === 'CONFIRMED' && s.attestation,
    );

    // Match burn→mint pairs by order
    const freshPendingMints = freshSteps.filter(
      (s) => s.type === 'MINT' && s.status === 'PENDING',
    );

    for (let i = 0; i < freshPendingMints.length && i < confirmedBurns.length; i++) {
      const mintStep = freshPendingMints[i];
      const burnStep = confirmedBurns[i];
      await this.tryMint(mintStep, burnStep);
    }

    // 3. Handle PENDING LIFI_SWAP steps (prepare calldata after mint completes)
    const pendingSwaps = freshSteps.filter(
      (s) => s.type === 'LIFI_SWAP' && s.status === 'PENDING',
    );

    for (const swapStep of pendingSwaps) {
      // Only prepare swap if all preceding steps are done
      const precedingSteps = freshSteps.filter(
        (s) => s.stepIndex < swapStep.stepIndex,
      );
      const allPrecedingDone = precedingSteps.every(
        (s) => s.status === 'CONFIRMED' || s.status === 'SKIPPED',
      );

      if (!allPrecedingDone) continue;

      if (this.isTimedOut(swapStep)) {
        await this.failStep(swapStep.id, 'Timeout waiting for LiFi swap preparation');
        await this.failOperation(op.id, 'LiFi swap timeout');
        return;
      }

      await this.prepareLifiSwap(op, swapStep);
    }

    // 4. Check completion (LIFI_SWAP in AWAITING_SIGNATURE does NOT count as done)
    await this.checkCompletion(op.id);
  }

  private async tryBurnIntent(op: any, step: any) {
    const intentData = step.burnIntentData as any;
    if (!intentData) {
      this.logger.warn(`Step ${step.id} has no burnIntentData, skipping`);
      return;
    }

    const delegateKey = this.authService.getDelegatePrivateKey(op.user);

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

      this.logger.log(`Burn intent confirmed: step ${step.id}`);
    } catch (error) {
      this.logger.warn(
        `Burn intent retry failed for step ${step.id}: ${error.message}`,
      );
    }
  }

  private async tryMint(mintStep: any, burnStep: any) {
    // Skip if already has a txHash (eager mint succeeded but DB update may have lagged)
    if (mintStep.txHash) {
      await this.prisma.operationStep.update({
        where: { id: mintStep.id },
        data: { status: 'CONFIRMED', completedAt: new Date() },
      });
      this.logger.log(`Mint step ${mintStep.id} already has txHash, marked CONFIRMED`);
      return;
    }

    const relayerKey = this.configService.get<string>('RELAYER_PRIVATE_KEY');
    if (!relayerKey) {
      this.logger.error('RELAYER_PRIVATE_KEY not configured, cannot execute mint');
      return;
    }

    const destinationChain =
      (burnStep.burnIntentData as any)?.destinationChain;

    if (!destinationChain) {
      this.logger.warn(`Cannot determine destination chain for mint step ${mintStep.id}`);
      return;
    }

    try {
      const txHash = await this.gatewayService.executeMint(
        destinationChain,
        burnStep.attestation,
        burnStep.operatorSignature,
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

      this.logger.log(`Mint executed on ${destinationChain}: ${txHash}`);
    } catch (error) {
      const msg = error.message || '';
      // TransferSpecHashUsed (0x160ca292) = attestation already consumed on-chain
      // This means a previous mint attempt actually succeeded — mark CONFIRMED
      if (msg.includes('0x160ca292') || msg.includes('TransferSpecHashUsed')) {
        this.logger.log(
          `Mint step ${mintStep.id}: attestation already consumed on ${destinationChain} — marking CONFIRMED`,
        );
        await this.prisma.operationStep.update({
          where: { id: mintStep.id },
          data: {
            status: 'CONFIRMED',
            completedAt: new Date(),
            errorMessage: 'Attestation already consumed (duplicate mint detected)',
          },
        });
        return;
      }

      // AttestationExpiredAtIndex (0xa31dc54b) = attestation maxBlockHeight exceeded
      // Non-retryable: the attestation is permanently invalid, need a new burn intent
      if (msg.includes('0xa31dc54b') || msg.includes('AttestationExpiredAtIndex')) {
        this.logger.error(
          `Mint step ${mintStep.id}: attestation expired on ${destinationChain} — failing step`,
        );
        await this.failStep(mintStep.id, `Attestation expired on ${destinationChain}. The mint window has passed.`);
        return;
      }

      this.logger.warn(
        `Mint retry failed for step ${mintStep.id}: ${msg}`,
      );
    }
  }

  private async prepareLifiSwap(op: any, swapStep: any) {
    const params = swapStep.burnIntentData as any;
    if (!params?.outputToken) {
      this.logger.warn(`LIFI_SWAP step ${swapStep.id} missing outputToken params`);
      return;
    }

    const chain = swapStep.chain;
    const chainConfig = ALL_CHAINS[chain];
    if (!chainConfig) {
      this.logger.warn(`Unknown chain ${chain} for LIFI_SWAP step ${swapStep.id}`);
      return;
    }

    const usdcAddress = getUsdcAddress(chain);

    try {
      // Get fresh LiFi quote (previous quote from preparation may have expired)
      const slippage = effectiveSwapSlippage(BigInt(params.usdcAmount), params.slippage);

      const quote = await this.lifiService.getQuote({
        fromChain: chainConfig.chainId,
        toChain: chainConfig.chainId,
        fromToken: usdcAddress,
        toToken: params.outputToken,
        fromAmount: params.usdcAmount,
        fromAddress: op.user.walletAddress,
        toAddress: params.recipientAddress,
        slippage,
      });

      const swapCalls = this.lifiService.buildSwapCalls(
        quote,
        usdcAddress,
        BigInt(params.usdcAmount),
      );

      // Update step with fresh calldata → AWAITING_SIGNATURE
      await this.prisma.operationStep.update({
        where: { id: swapStep.id },
        data: {
          status: 'AWAITING_SIGNATURE',
          callData: swapCalls.map((c) => ({
            to: c.to,
            data: c.data,
            value: c.value?.toString(),
          })),
        },
      });

      // Transition operation to AWAITING_SIGNATURE so frontend knows to prompt user
      const signRequests = [
        {
          stepId: swapStep.id,
          chain,
          type: 'LIFI_SWAP',
          calls: swapCalls.map((c) => ({
            to: c.to,
            data: c.data,
            ...(c.value ? { value: c.value.toString() } : {}),
          })),
          description: `Swap USDC → ${quote.action.toToken.symbol} on ${chain}`,
        },
      ];

      await this.prisma.operation.update({
        where: { id: op.id },
        data: {
          status: 'AWAITING_SIGNATURE',
          signRequests,
        },
      });

      this.logger.log(
        `LiFi swap prepared for step ${swapStep.id} — ${quote.tool} route, awaiting user signature`,
      );
    } catch (error) {
      this.logger.warn(
        `LiFi quote failed for step ${swapStep.id}: ${error.message}, will retry`,
      );
    }
  }

  private async checkCompletion(operationId: string) {
    const steps = await this.prisma.operationStep.findMany({
      where: { operationId },
    });

    const allDone = steps.every(
      (s) => s.status === 'CONFIRMED' || s.status === 'SKIPPED',
    );
    const anyFailed = steps.some((s) => s.status === 'FAILED');

    if (anyFailed) {
      await this.failOperation(operationId, 'One or more steps failed');
    } else if (allDone) {
      await this.prisma.operation.update({
        where: { id: operationId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      this.logger.log(`Operation ${operationId} completed`);
    }
  }

  private async failStep(stepId: string, message: string) {
    await this.prisma.operationStep.update({
      where: { id: stepId },
      data: { status: 'FAILED', errorMessage: message },
    });
  }

  private async failOperation(operationId: string, message: string) {
    await this.prisma.operation.update({
      where: { id: operationId },
      data: { status: 'FAILED', errorMessage: message },
    });
    this.logger.error(`Operation ${operationId} failed: ${message}`);
  }

  private isTimedOut(step: any): boolean {
    const elapsed = Date.now() - new Date(step.createdAt).getTime();
    return elapsed > STEP_TIMEOUT_MS;
  }
}
