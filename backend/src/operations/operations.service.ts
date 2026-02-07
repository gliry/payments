import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseUnits, formatUnits } from 'viem';
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
import { GatewayService } from '../circle/gateway/gateway.service';
import { AuthService } from '../auth/auth.service';
import {
  AA_GATEWAY_CHAINS,
  GATEWAY_CHAINS,
  HUB_CHAIN,
  getUsdcAddress,
} from '../circle/config/chains';
import { USDC_DECIMALS } from '../circle/gateway/gateway.types';
import { PrepareCollectDto } from './dto/prepare-collect.dto';
import { PrepareSendDto } from './dto/prepare-send.dto';
import { PrepareBridgeDto } from './dto/prepare-bridge.dto';
import { PrepareBatchSendDto } from './dto/prepare-batch-send.dto';
import { SubmitOperationDto } from './dto/submit-operation.dto';

const CROSS_CHAIN_FEE_PERCENT = '0.3';
const BATCH_FEE_PERCENT = '0.25';

// Gateway charges ~2% fee on burn intents (deducted from depositor balance on top of amount)
// We use 205 bps (2.05%) with buffer to avoid "insufficient balance" errors
const GATEWAY_FEE_BPS = 205n;

/** Calculate net amount that can be burned from a given balance (balance covers amount + gateway fee) */
function netBurnAmount(balance: bigint): bigint {
  return (balance * 10000n) / (10000n + GATEWAY_FEE_BPS);
}

/** Calculate how much to deposit so that balance covers burn amount + gateway fee */
function grossDepositAmount(burnAmount: bigint): bigint {
  return (burnAmount * (10000n + GATEWAY_FEE_BPS)) / 10000n;
}

/** Calculate maxFee for burn intent (3% of amount as ceiling, min 50000 = 0.05 USDC) */
function calcMaxFee(amount: bigint): bigint {
  const fee = (amount * 300n) / 10000n;
  return fee > 50000n ? fee : 50000n;
}

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly circleService: CircleService,
    private readonly gatewayService: GatewayService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async prepareCollect(userId: string, dto: PrepareCollectDto) {
    const user = await this.getUser(userId);
    const destination = dto.destination || HUB_CHAIN;

    this.validateGatewayChain(destination);
    for (const chain of dto.sourceChains) {
      this.validateGatewayChain(chain);
    }

    // Read on-chain USDC balances (wallet balance, NOT Gateway balance)
    // Collect deposits on-chain USDC to Gateway first, then burns to destination
    const onChainBalances =
      await this.circleService.getMultiChainBalances(user.walletAddress);

    const sources: Array<{
      chain: string;
      depositAmount: bigint; // full on-chain balance to deposit to Gateway
      burnAmount: bigint;    // net amount to burn (after Gateway ~2% fee)
    }> = [];
    let totalBurnAmount = 0n;

    for (const chain of dto.sourceChains) {
      const onChainBalance = onChainBalances[chain] || 0n;
      if (onChainBalance > 0n) {
        // Deposit full on-chain balance, burn net amount (leaves room for Gateway fee)
        const burnAmount = netBurnAmount(onChainBalance);
        sources.push({ chain, depositAmount: onChainBalance, burnAmount });
        totalBurnAmount += burnAmount;
      }
    }

    if (sources.length === 0) {
      throw new BadRequestException(
        'No on-chain USDC balance found on specified chains',
      );
    }

    const feePercent = parseFloat(BATCH_FEE_PERCENT);
    const feeRaw = (totalBurnAmount * BigInt(Math.round(feePercent * 10000))) / 10000n;

    const operation = await this.prisma.operation.create({
      data: {
        userId,
        type: 'COLLECT',
        status: 'AWAITING_SIGNATURE',
        params: {
          sourceChains: dto.sourceChains,
          destination,
        },
        summary: {
          sources: sources.map((s) => ({
            chain: s.chain,
            deposit: formatUnits(s.depositAmount, USDC_DECIMALS),
            amount: formatUnits(s.burnAmount, USDC_DECIMALS),
          })),
          destination,
          totalAmount: formatUnits(totalBurnAmount, USDC_DECIMALS),
          fee: formatUnits(feeRaw, USDC_DECIMALS),
          feePercent: BATCH_FEE_PERCENT,
          estimatedTime: '15-20 minutes',
        },
        feeAmount: formatUnits(feeRaw, USDC_DECIMALS),
        feePercent: BATCH_FEE_PERCENT,
      },
    });

    const signRequests: any[] = [];
    let stepIndex = 0;

    // Check which source chains need delegate setup
    const chainsNeedingDelegate = new Set(
      await this.getChainsNeedingDelegate(
        sources.map((s) => s.chain),
        user.walletAddress,
        user.delegateAddress,
      ),
    );

    // Phase 1 steps: APPROVE_AND_DEPOSIT per source chain (+ addDelegate if needed, all in one UserOp)
    for (const source of sources) {
      const depositCalls = this.circleService.buildDepositCallData(
        source.chain,
        source.depositAmount,
      );

      // Prepend addDelegate calls if delegate not yet authorized on this chain
      const allCalls = chainsNeedingDelegate.has(source.chain)
        ? [
            ...this.circleService.buildDelegateCallData(source.chain, user.delegateAddress),
            ...depositCalls,
          ]
        : depositCalls;

      const step = await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: source.chain,
          type: 'APPROVE_AND_DEPOSIT',
          status: 'AWAITING_SIGNATURE',
          callData: allCalls.map((c) => ({
            to: c.to,
            data: c.data,
            value: c.value?.toString(),
          })),
        },
      });

      const desc = chainsNeedingDelegate.has(source.chain)
        ? `Add delegate + approve and deposit ${formatUnits(source.depositAmount, USDC_DECIMALS)} USDC on ${source.chain}`
        : `Approve and deposit ${formatUnits(source.depositAmount, USDC_DECIMALS)} USDC on ${source.chain}`;

      signRequests.push({
        stepId: step.id,
        chain: source.chain,
        type: 'APPROVE_AND_DEPOSIT',
        calls: allCalls.map((c) => ({
          to: c.to,
          data: c.data,
        })),
        description: desc,
      });
    }

    // Future steps (server-side, created as PENDING): burn net amount from Gateway
    for (const source of sources) {
      await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: source.chain,
          type: 'BURN_INTENT',
          status: 'PENDING',
          burnIntentData: {
            sourceChain: source.chain,
            destinationChain: destination,
            amount: source.burnAmount.toString(), // burn net amount (leaves room for ~2% fee)
            depositor: user.walletAddress,
            recipient: user.walletAddress,
          },
        },
      });
    }

    // Mint step on destination (Phase 2)
    await this.prisma.operationStep.create({
      data: {
        operationId: operation.id,
        stepIndex: stepIndex++,
        chain: destination,
        type: 'MINT',
        status: 'PENDING',
      },
    });

    await this.prisma.operation.update({
      where: { id: operation.id },
      data: { signRequests },
    });

    return {
      id: operation.id,
      type: 'COLLECT',
      status: 'AWAITING_SIGNATURE',
      summary: operation.summary,
      signRequests,
    };
  }

  async prepareSend(userId: string, dto: PrepareSendDto) {
    const user = await this.getUser(userId);
    const sourceChain = dto.sourceChain || HUB_CHAIN;

    this.validateGatewayChain(sourceChain);
    this.validateGatewayChain(dto.destinationChain);

    const amountRaw = parseUnits(dto.amount, USDC_DECIMALS);
    const isInternal =
      sourceChain === dto.destinationChain &&
      sourceChain === HUB_CHAIN;

    const feePercent = isInternal ? '0' : CROSS_CHAIN_FEE_PERCENT;
    const feeRaw = isInternal
      ? 0n
      : (amountRaw * BigInt(Math.round(parseFloat(feePercent) * 10000))) /
        10000n;

    // Check if auto-deposit to Gateway is needed for cross-chain sends
    let needsDeposit = false;
    let depositAmount = 0n;

    if (!isInternal) {
      const requiredBalance = grossDepositAmount(amountRaw);
      const gatewayBalances = await this.gatewayService.getBalance(
        user.walletAddress,
      );
      const gatewayBalance =
        gatewayBalances.find((b) => b.chain === sourceChain)?.balance ?? 0n;

      if (gatewayBalance < requiredBalance) {
        const shortfall = requiredBalance - gatewayBalance;
        const onChainBalance =
          await this.gatewayService.getOnChainBalance(sourceChain, user.walletAddress);

        if (onChainBalance + gatewayBalance < requiredBalance) {
          const maxBurn = netBurnAmount(onChainBalance + gatewayBalance);
          throw new BadRequestException(
            `Insufficient USDC on ${sourceChain}: on-chain ${formatUnits(onChainBalance, USDC_DECIMALS)} + Gateway ${formatUnits(gatewayBalance, USDC_DECIMALS)} = ${formatUnits(onChainBalance + gatewayBalance, USDC_DECIMALS)} USDC, need ~${formatUnits(requiredBalance, USDC_DECIMALS)} USDC. Max sendable: ~${formatUnits(maxBurn, USDC_DECIMALS)} USDC`,
          );
        }

        // Deposit just enough to cover shortfall (or full on-chain balance if less)
        depositAmount = onChainBalance < shortfall ? onChainBalance : shortfall;
        needsDeposit = true;
      }
    }

    const operation = await this.prisma.operation.create({
      data: {
        userId,
        type: 'SEND',
        status: 'AWAITING_SIGNATURE',
        params: {
          destinationAddress: dto.destinationAddress,
          destinationChain: dto.destinationChain,
          amount: dto.amount,
          sourceChain,
        },
        summary: {
          action: 'send',
          amount: dto.amount,
          fee: formatUnits(feeRaw, USDC_DECIMALS),
          feePercent,
          totalDeducted: formatUnits(amountRaw + feeRaw, USDC_DECIMALS),
          destination: dto.destinationAddress,
          destinationChain: dto.destinationChain,
          sourceChain,
          needsDeposit,
          depositAmount: needsDeposit ? formatUnits(depositAmount, USDC_DECIMALS) : undefined,
          estimatedTime: isInternal ? 'instant' : needsDeposit ? '15-25 minutes' : '3-5 minutes',
        },
        feeAmount: formatUnits(feeRaw, USDC_DECIMALS),
        feePercent,
      },
    });

    const signRequests: any[] = [];
    let stepIndex = 0;

    if (isInternal) {
      const step = await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: HUB_CHAIN,
          type: 'TRANSFER',
          status: 'AWAITING_SIGNATURE',
          callData: {
            type: 'usdc_transfer',
            to: dto.destinationAddress,
            amount: amountRaw.toString(),
          },
        },
      });

      signRequests.push({
        stepId: step.id,
        chain: HUB_CHAIN,
        type: 'TRANSFER',
        description: `Transfer ${dto.amount} USDC to ${dto.destinationAddress} on ${HUB_CHAIN}`,
      });
    } else {
      // Check if delegate needs to be added on source chain
      const delegateNeeded = (
        await this.getChainsNeedingDelegate(
          [sourceChain],
          user.walletAddress,
          user.delegateAddress,
        )
      ).length > 0;

      if (needsDeposit) {
        // Merge delegate + deposit into one UserOp
        const depositCalls = this.circleService.buildDepositCallData(
          sourceChain,
          depositAmount,
        );
        const allCalls = delegateNeeded
          ? [
              ...this.circleService.buildDelegateCallData(sourceChain, user.delegateAddress),
              ...depositCalls,
            ]
          : depositCalls;

        const depositStep = await this.prisma.operationStep.create({
          data: {
            operationId: operation.id,
            stepIndex: stepIndex++,
            chain: sourceChain,
            type: 'APPROVE_AND_DEPOSIT',
            status: 'AWAITING_SIGNATURE',
            callData: allCalls.map((c) => ({
              to: c.to,
              data: c.data,
              value: c.value?.toString(),
            })),
          },
        });

        const desc = delegateNeeded
          ? `Add delegate + deposit ${formatUnits(depositAmount, USDC_DECIMALS)} USDC on ${sourceChain}`
          : `Approve and deposit ${formatUnits(depositAmount, USDC_DECIMALS)} USDC on ${sourceChain}`;

        signRequests.push({
          stepId: depositStep.id,
          chain: sourceChain,
          type: 'APPROVE_AND_DEPOSIT',
          calls: allCalls.map((c) => ({ to: c.to, data: c.data })),
          description: desc,
        });
      } else if (delegateNeeded) {
        // No deposit needed but delegate is — standalone addDelegate UserOp
        const delegateCalls = this.circleService.buildDelegateCallData(
          sourceChain,
          user.delegateAddress,
        );

        const delegateStep = await this.prisma.operationStep.create({
          data: {
            operationId: operation.id,
            stepIndex: stepIndex++,
            chain: sourceChain,
            type: 'ADD_DELEGATE',
            status: 'AWAITING_SIGNATURE',
            callData: delegateCalls.map((c) => ({ to: c.to, data: c.data })),
          },
        });

        signRequests.push({
          stepId: delegateStep.id,
          chain: sourceChain,
          type: 'ADD_DELEGATE',
          calls: delegateCalls.map((c) => ({ to: c.to, data: c.data })),
          description: `Add delegate on ${sourceChain}`,
        });
      }

      // Cross-chain: burn on source → mint on destination
      const burnStep = await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: sourceChain,
          type: 'BURN_INTENT',
          status: 'PENDING',
          burnIntentData: {
            sourceChain,
            destinationChain: dto.destinationChain,
            amount: amountRaw.toString(),
            depositor: user.walletAddress,
            recipient: dto.destinationAddress,
          },
        },
      });

      await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: dto.destinationChain,
          type: 'MINT',
          status: 'PENDING',
        },
      });

      signRequests.push({
        stepId: burnStep.id,
        chain: sourceChain,
        type: 'BURN_INTENT',
        description: `Burn ${dto.amount} USDC → ${dto.destinationAddress} on ${dto.destinationChain}`,
        serverSide: true,
      });
    }

    await this.prisma.operation.update({
      where: { id: operation.id },
      data: { signRequests },
    });

    return {
      id: operation.id,
      type: 'SEND',
      status: 'AWAITING_SIGNATURE',
      summary: operation.summary,
      signRequests,
    };
  }

  async prepareBridge(userId: string, dto: PrepareBridgeDto) {
    const user = await this.getUser(userId);

    this.validateGatewayChain(dto.sourceChain);
    this.validateGatewayChain(dto.destinationChain);

    const amountRaw = parseUnits(dto.amount, USDC_DECIMALS);
    const depositAmount = grossDepositAmount(amountRaw);

    // Check on-chain balance covers deposit + Gateway fee
    const onChainBalance = await this.gatewayService.getOnChainBalance(
      dto.sourceChain,
      user.walletAddress,
    );
    if (depositAmount > onChainBalance) {
      const maxBurn = netBurnAmount(onChainBalance);
      throw new BadRequestException(
        `Insufficient USDC on ${dto.sourceChain}: have ${formatUnits(onChainBalance, USDC_DECIMALS)}, need ${formatUnits(depositAmount, USDC_DECIMALS)} (${dto.amount} + ~2% Gateway fee). Max bridgeable: ~${formatUnits(maxBurn, USDC_DECIMALS)} USDC`,
      );
    }

    const feeRaw =
      (amountRaw *
        BigInt(
          Math.round(parseFloat(CROSS_CHAIN_FEE_PERCENT) * 10000),
        )) /
      10000n;

    const operation = await this.prisma.operation.create({
      data: {
        userId,
        type: 'BRIDGE',
        status: 'AWAITING_SIGNATURE',
        params: {
          sourceChain: dto.sourceChain,
          destinationChain: dto.destinationChain,
          amount: dto.amount,
        },
        summary: {
          action: 'bridge',
          amount: dto.amount,
          fee: formatUnits(feeRaw, USDC_DECIMALS),
          feePercent: CROSS_CHAIN_FEE_PERCENT,
          sourceChain: dto.sourceChain,
          destinationChain: dto.destinationChain,
          estimatedTime: '15-20 minutes',
        },
        feeAmount: formatUnits(feeRaw, USDC_DECIMALS),
        feePercent: CROSS_CHAIN_FEE_PERCENT,
      },
    });

    const signRequests: any[] = [];
    let stepIndex = 0;

    // Check if delegate needs to be added on source chain
    const delegateNeeded = (
      await this.getChainsNeedingDelegate(
        [dto.sourceChain],
        user.walletAddress,
        user.delegateAddress,
      )
    ).length > 0;

    // Merge delegate + deposit into one UserOp
    const depositCalls = this.circleService.buildDepositCallData(
      dto.sourceChain,
      depositAmount,
    );
    const allCalls = delegateNeeded
      ? [
          ...this.circleService.buildDelegateCallData(dto.sourceChain, user.delegateAddress),
          ...depositCalls,
        ]
      : depositCalls;

    const depositStep = await this.prisma.operationStep.create({
      data: {
        operationId: operation.id,
        stepIndex: stepIndex++,
        chain: dto.sourceChain,
        type: 'APPROVE_AND_DEPOSIT',
        status: 'AWAITING_SIGNATURE',
        callData: allCalls.map((c) => ({
          to: c.to,
          data: c.data,
        })),
      },
    });

    const desc = delegateNeeded
      ? `Add delegate + deposit ${dto.amount} USDC on ${dto.sourceChain}`
      : `Approve and deposit ${dto.amount} USDC on ${dto.sourceChain}`;

    signRequests.push({
      stepId: depositStep.id,
      chain: dto.sourceChain,
      type: 'APPROVE_AND_DEPOSIT',
      calls: allCalls.map((c) => ({ to: c.to, data: c.data })),
      description: desc,
    });

    // Step 2: Burn intent (server-side)
    await this.prisma.operationStep.create({
      data: {
        operationId: operation.id,
        stepIndex: stepIndex++,
        chain: dto.sourceChain,
        type: 'BURN_INTENT',
        status: 'PENDING',
        burnIntentData: {
          sourceChain: dto.sourceChain,
          destinationChain: dto.destinationChain,
          amount: amountRaw.toString(),
          depositor: user.walletAddress,
          recipient: user.walletAddress,
        },
      },
    });

    // Step 3: Mint on destination (Phase 2)
    await this.prisma.operationStep.create({
      data: {
        operationId: operation.id,
        stepIndex: stepIndex++,
        chain: dto.destinationChain,
        type: 'MINT',
        status: 'PENDING',
      },
    });

    await this.prisma.operation.update({
      where: { id: operation.id },
      data: { signRequests },
    });

    return {
      id: operation.id,
      type: 'BRIDGE',
      status: 'AWAITING_SIGNATURE',
      summary: operation.summary,
      signRequests,
    };
  }

  async prepareBatchSend(userId: string, dto: PrepareBatchSendDto) {
    const user = await this.getUser(userId);
    const sourceChain = dto.sourceChain || HUB_CHAIN;

    if (dto.recipients.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    this.validateGatewayChain(sourceChain);
    for (const r of dto.recipients) {
      this.validateGatewayChain(r.chain);
    }

    // Calculate totals and fee
    let totalRaw = 0n;
    const recipientDetails = dto.recipients.map((r) => {
      const amountRaw = parseUnits(r.amount, USDC_DECIMALS);
      totalRaw += amountRaw;
      return { ...r, amountRaw };
    });

    const feeRaw =
      (totalRaw * BigInt(Math.round(parseFloat(BATCH_FEE_PERCENT) * 10000))) /
      10000n;

    // Check if auto-deposit to Gateway is needed
    const crossChainTotal = recipientDetails
      .filter(
        (r) => !(sourceChain === r.chain && sourceChain === HUB_CHAIN),
      )
      .reduce((sum, r) => sum + r.amountRaw, 0n);

    let needsDeposit = false;
    let depositAmount = 0n;

    if (crossChainTotal > 0n) {
      const requiredBalance = grossDepositAmount(crossChainTotal);
      const gatewayBalances = await this.gatewayService.getBalance(
        user.walletAddress,
      );
      const gatewayBalance =
        gatewayBalances.find((b) => b.chain === sourceChain)?.balance ?? 0n;

      if (gatewayBalance < requiredBalance) {
        const shortfall = requiredBalance - gatewayBalance;
        const onChainBalance =
          await this.gatewayService.getOnChainBalance(sourceChain, user.walletAddress);

        if (onChainBalance + gatewayBalance < requiredBalance) {
          const maxBurn = netBurnAmount(onChainBalance + gatewayBalance);
          throw new BadRequestException(
            `Insufficient USDC on ${sourceChain}: on-chain ${formatUnits(onChainBalance, USDC_DECIMALS)} + Gateway ${formatUnits(gatewayBalance, USDC_DECIMALS)} = ${formatUnits(onChainBalance + gatewayBalance, USDC_DECIMALS)} USDC, need ~${formatUnits(requiredBalance, USDC_DECIMALS)} USDC. Max sendable: ~${formatUnits(maxBurn, USDC_DECIMALS)} USDC`,
          );
        }

        depositAmount = onChainBalance < shortfall ? onChainBalance : shortfall;
        needsDeposit = true;
      }
    }

    const operation = await this.prisma.operation.create({
      data: {
        userId,
        type: 'BATCH_SEND',
        status: 'AWAITING_SIGNATURE',
        params: {
          recipients: dto.recipients.map((r) => ({
            address: r.address,
            chain: r.chain,
            amount: r.amount,
          })),
          sourceChain,
        },
        summary: {
          action: 'batch_send',
          recipientCount: dto.recipients.length,
          recipients: dto.recipients.map((r) => ({
            address: r.address,
            chain: r.chain,
            amount: r.amount,
          })),
          totalAmount: formatUnits(totalRaw, USDC_DECIMALS),
          fee: formatUnits(feeRaw, USDC_DECIMALS),
          feePercent: BATCH_FEE_PERCENT,
          totalDeducted: formatUnits(totalRaw + feeRaw, USDC_DECIMALS),
          sourceChain,
          needsDeposit,
          depositAmount: needsDeposit ? formatUnits(depositAmount, USDC_DECIMALS) : undefined,
          estimatedTime: needsDeposit ? '15-25 minutes' : '3-5 minutes',
        },
        feeAmount: formatUnits(feeRaw, USDC_DECIMALS),
        feePercent: BATCH_FEE_PERCENT,
      },
    });

    const signRequests: any[] = [];
    let stepIndex = 0;

    // Check if delegate needs to be added on source chain
    const delegateNeeded =
      crossChainTotal > 0n &&
      (await this.getChainsNeedingDelegate(
        [sourceChain],
        user.walletAddress,
        user.delegateAddress,
      )).length > 0;

    if (needsDeposit) {
      // Merge delegate + deposit into one UserOp
      const depositCalls = this.circleService.buildDepositCallData(
        sourceChain,
        depositAmount,
      );
      const allCalls = delegateNeeded
        ? [
            ...this.circleService.buildDelegateCallData(sourceChain, user.delegateAddress),
            ...depositCalls,
          ]
        : depositCalls;

      const depositStep = await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: sourceChain,
          type: 'APPROVE_AND_DEPOSIT',
          status: 'AWAITING_SIGNATURE',
          callData: allCalls.map((c) => ({
            to: c.to,
            data: c.data,
            value: c.value?.toString(),
          })),
        },
      });

      const desc = delegateNeeded
        ? `Add delegate + deposit ${formatUnits(depositAmount, USDC_DECIMALS)} USDC on ${sourceChain}`
        : `Approve and deposit ${formatUnits(depositAmount, USDC_DECIMALS)} USDC on ${sourceChain}`;

      signRequests.push({
        stepId: depositStep.id,
        chain: sourceChain,
        type: 'APPROVE_AND_DEPOSIT',
        calls: allCalls.map((c) => ({ to: c.to, data: c.data })),
        description: desc,
      });
    } else if (delegateNeeded) {
      // No deposit needed but delegate is — standalone addDelegate UserOp
      const delegateCalls = this.circleService.buildDelegateCallData(
        sourceChain,
        user.delegateAddress,
      );

      const delegateStep = await this.prisma.operationStep.create({
        data: {
          operationId: operation.id,
          stepIndex: stepIndex++,
          chain: sourceChain,
          type: 'ADD_DELEGATE',
          status: 'AWAITING_SIGNATURE',
          callData: delegateCalls.map((c) => ({ to: c.to, data: c.data })),
        },
      });

      signRequests.push({
        stepId: delegateStep.id,
        chain: sourceChain,
        type: 'ADD_DELEGATE',
        calls: delegateCalls.map((c) => ({ to: c.to, data: c.data })),
        description: `Add delegate on ${sourceChain}`,
      });
    }

    for (const r of recipientDetails) {
      const isInternal =
        sourceChain === r.chain && sourceChain === HUB_CHAIN;

      if (isInternal) {
        const step = await this.prisma.operationStep.create({
          data: {
            operationId: operation.id,
            stepIndex: stepIndex++,
            chain: HUB_CHAIN,
            type: 'TRANSFER',
            status: 'AWAITING_SIGNATURE',
            callData: {
              type: 'usdc_transfer',
              to: r.address,
              amount: r.amountRaw.toString(),
            },
          },
        });

        signRequests.push({
          stepId: step.id,
          chain: HUB_CHAIN,
          type: 'TRANSFER',
          description: `Transfer ${r.amount} USDC to ${r.address}`,
        });
      } else {
        const burnStep = await this.prisma.operationStep.create({
          data: {
            operationId: operation.id,
            stepIndex: stepIndex++,
            chain: sourceChain,
            type: 'BURN_INTENT',
            status: 'PENDING',
            burnIntentData: {
              sourceChain,
              destinationChain: r.chain,
              amount: r.amountRaw.toString(),
              depositor: user.walletAddress,
              recipient: r.address,
            },
          },
        });

        await this.prisma.operationStep.create({
          data: {
            operationId: operation.id,
            stepIndex: stepIndex++,
            chain: r.chain,
            type: 'MINT',
            status: 'PENDING',
          },
        });

        signRequests.push({
          stepId: burnStep.id,
          chain: sourceChain,
          type: 'BURN_INTENT',
          description: `Burn ${r.amount} USDC → ${r.address} on ${r.chain}`,
          serverSide: true,
        });
      }
    }

    await this.prisma.operation.update({
      where: { id: operation.id },
      data: { signRequests },
    });

    return {
      id: operation.id,
      type: 'BATCH_SEND',
      status: 'AWAITING_SIGNATURE',
      summary: operation.summary,
      signRequests,
    };
  }

  async submitOperation(userId: string, operationId: string, dto: SubmitOperationDto) {
    const operation = await this.prisma.operation.findFirst({
      where: { id: operationId, userId },
      include: { steps: { orderBy: { stepIndex: 'asc' } } },
    });

    if (!operation) throw new NotFoundException('Operation not found');

    if (operation.status !== 'AWAITING_SIGNATURE') {
      throw new BadRequestException(
        `Operation is in ${operation.status} state, cannot submit signatures`,
      );
    }

    const user = await this.getUser(userId);

    // Mark submitted steps as CONFIRMED
    for (const sig of dto.signatures) {
      await this.prisma.operationStep.update({
        where: { id: sig.stepId },
        data: {
          status: 'CONFIRMED',
          txHash: sig.txHash,
          completedAt: new Date(),
        },
      });
    }

    // Eagerly try burn intents + server-side mint
    const burnSteps = operation.steps.filter(
      (s) => s.type === 'BURN_INTENT' && s.status === 'PENDING',
    );

    const delegateKey = this.authService.getDelegatePrivateKey(user);
    const relayerKey = this.configService.get<string>('RELAYER_PRIVATE_KEY');
    const mintSteps = operation.steps.filter(
      (s) => s.type === 'MINT' && s.status === 'PENDING',
    );

    let mintIndex = 0;

    for (const step of burnSteps) {
      const intentData = step.burnIntentData as any;

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

        // Eagerly try server-side mint
        if (relayerKey && mintIndex < mintSteps.length) {
          const mintStep = mintSteps[mintIndex];
          try {
            const txHash = await this.gatewayService.executeMint(
              intentData.destinationChain,
              transfer.attestation,
              transfer.signature,
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

            this.logger.log(`Eager mint succeeded on ${intentData.destinationChain}: ${txHash}`);
          } catch (mintError) {
            this.logger.warn(
              `Eager mint failed on ${intentData.destinationChain}, worker will retry: ${mintError.message}`,
            );
          }
          mintIndex++;
        }
      } catch (error) {
        // Burn intent failed (deposit likely not finalized yet) — leave PENDING for worker
        this.logger.warn(
          `Burn intent failed for ${intentData.sourceChain}→${intentData.destinationChain}, worker will retry: ${error.message}`,
        );
      }
    }

    // Determine final status
    const freshSteps = await this.prisma.operationStep.findMany({
      where: { operationId },
    });

    const allDone = freshSteps.every(
      (s) => s.status === 'CONFIRMED' || s.status === 'SKIPPED',
    );

    if (allDone) {
      await this.prisma.operation.update({
        where: { id: operationId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } else {
      // Pending steps remain — background worker will continue
      await this.prisma.operation.update({
        where: { id: operationId },
        data: { status: 'PROCESSING' },
      });
    }

    return this.getOperation(userId, operationId);
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

  /**
   * Check which chains need delegate setup and return ADD_DELEGATE step data.
   * Checks on-chain `isAuthorizedForBalance` for each chain.
   */
  private async getChainsNeedingDelegate(
    chains: string[],
    walletAddress: string,
    delegateAddress: string,
  ): Promise<string[]> {
    const uniqueChains = [...new Set(chains)];
    const results = await Promise.allSettled(
      uniqueChains.map((chain) =>
        this.gatewayService.isDelegateAuthorized(
          chain,
          walletAddress,
          delegateAddress,
        ),
      ),
    );

    const needsDelegate: string[] = [];
    for (let i = 0; i < uniqueChains.length; i++) {
      const result = results[i];
      const authorized =
        result.status === 'fulfilled' ? result.value : false;
      if (!authorized) {
        needsDelegate.push(uniqueChains[i]);
      }
    }
    return needsDelegate;
  }

  private async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private validateGatewayChain(chain: string) {
    if (!(chain in GATEWAY_CHAINS)) {
      throw new BadRequestException(
        `Chain ${chain} does not support Gateway. Supported: ${Object.keys(GATEWAY_CHAINS).join(', ')}`,
      );
    }
  }
}
