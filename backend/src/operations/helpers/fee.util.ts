/**
 * Fee and slippage calculation utilities.
 * Shared across operations.service.ts, mint-worker.service.ts, wallet.service.ts.
 */

/** Service fee for cross-chain sends (0.3%) */
export const CROSS_CHAIN_FEE_PERCENT = '0.3';

/** Service fee for batch sends (0.25%) */
export const BATCH_FEE_PERCENT = '0.25';

/**
 * Gateway charges ~2% fee on burn intents (deducted from depositor balance on top of amount).
 * We use 205 bps (2.05%) with buffer to avoid "insufficient balance" errors.
 */
export const GATEWAY_FEE_BPS = 205n;

/** Calculate net amount that can be burned from a given balance (balance covers amount + gateway fee) */
export function netBurnAmount(balance: bigint): bigint {
  return (balance * 10000n) / (10000n + GATEWAY_FEE_BPS);
}

/** Calculate how much to deposit so that balance covers burn amount + gateway fee */
export function grossDepositAmount(burnAmount: bigint): bigint {
  return (burnAmount * (10000n + GATEWAY_FEE_BPS)) / 10000n;
}

/** Calculate maxFee for burn intent (3% of amount as ceiling, min 50000 = 0.05 USDC) */
export function calcMaxFee(amount: bigint): bigint {
  const fee = (amount * 300n) / 10000n;
  return fee > 50000n ? fee : 50000n;
}

/**
 * Calculate effective slippage for LiFi swaps.
 * Small amounts need higher slippage because DEX fees + price impact
 * eat a proportionally larger share, and even tiny price movements
 * between quote and execution can trigger MinimalOutputBalanceViolation.
 */
export function effectiveSwapSlippage(usdcAmount: bigint, userSlippage?: number): number {
  const usdc = Number(usdcAmount) / 1e6; // human-readable USDC
  if (usdc < 1) return Math.max(userSlippage ?? 0, 0.05);    // < $1: 5% min
  if (usdc < 10) return Math.max(userSlippage ?? 0, 0.03);   // < $10: 3% min
  if (usdc < 100) return Math.max(userSlippage ?? 0, 0.01);  // < $100: 1% min
  return userSlippage ?? 0.005;                                // >= $100: 0.5% default
}
