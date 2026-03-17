/**
 * Fee and slippage calculation utilities.
 * Shared across operations.service.ts, mint-worker.service.ts, wallet.service.ts.
 */

/** Service fee for cross-chain sends */
export const CROSS_CHAIN_FEE_PERCENT = '0';

/** Service fee for batch sends */
export const BATCH_FEE_PERCENT = '0';

/**
 * Gateway fee = transfer fee (0.005%) + per-chain gas fee.
 * See: https://developers.circle.com/gateway/references/fees
 * Values include ~50% buffer over documented fees.
 */
const GATEWAY_GAS_FEES: Record<string, bigint> = {
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

const DEFAULT_GAS_FEE = 30_000n; // $0.03 fallback

/** Calculate Gateway fee for a given amount on a source chain */
export function gatewayFee(amount: bigint, sourceChain: string): bigint {
  const transferFee = (amount * 10n) / 100000n; // 0.01% (2× buffer over 0.005%)
  const gasFee = GATEWAY_GAS_FEES[sourceChain] ?? DEFAULT_GAS_FEE;
  return transferFee + gasFee;
}

/** Calculate net amount that can be burned from a given balance */
export function netBurnAmount(balance: bigint, sourceChain: string = 'polygon'): bigint {
  const fee = gatewayFee(balance, sourceChain);
  return balance > fee ? balance - fee : 0n;
}

/** Calculate how much to deposit so that balance covers burn amount + gateway fee */
export function grossDepositAmount(burnAmount: bigint, sourceChain: string = 'polygon'): bigint {
  // fee is based on burn amount, so deposit = burnAmount + fee(burnAmount)
  return burnAmount + gatewayFee(burnAmount, sourceChain);
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
