import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
import { GatewayService } from '../circle/gateway/gateway.service';
import { AuthService } from '../auth/auth.service';

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

    // 3. Check completion
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
      this.logger.warn(
        `Mint retry failed for step ${mintStep.id}: ${error.message}`,
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
