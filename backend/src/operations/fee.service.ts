import { Injectable, Logger } from '@nestjs/common';
import { encodeFunctionData } from 'viem';
import { ALL_CHAINS, getUsdcAddress } from '../circle/config/chains';
import type { UserOperationCall } from '../circle/gateway/gateway.types';

// ── Gas unit estimates (empirical, conservative) ───────────────────────────

export const GAS_UNITS = {
  TRANSFER: 100_000n,
  APPROVE_AND_DEPOSIT: 200_000n,
  AA_DEPLOYMENT: 500_000n,
  ADD_DELEGATE: 80_000n,
  LIFI_SWAP: 300_000n,
  RELAYER_MINT: 200_000n,
  FEE_TRANSFER: 30_000n,
  BURN_INTENT: 0n, // off-chain API call, no gas
} as const;

// ── CoinGecko token ID mapping ─────────────────────────────────────────────

const NATIVE_TOKEN_IDS: Record<string, string> = {
  polygon: 'matic-network',
  avalanche: 'avalanche-2',
  base: 'ethereum',
  optimism: 'ethereum',
  arbitrum: 'ethereum',
};

// Fallback prices (conservative high estimates) used when CoinGecko is unavailable
const FALLBACK_PRICES_USD: Record<string, number> = {
  'matic-network': 1.0,
  ethereum: 4000,
  'avalanche-2': 50,
};

// ── Safety buffer ──────────────────────────────────────────────────────────

const FEE_BUFFER_MULTIPLIER = 15n; // 1.5x (divided by 10 later)
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Types ──────────────────────────────────────────────────────────────────

export interface FeeEstimationParams {
  sourceChain: string;
  operationGasUnits: bigint;
  needsSourceDeployment: boolean;
  isCrossChain: boolean;
  destinationChain?: string;
  needsDestDeployment?: boolean;
  operationAmount: bigint;
  feePercent: number;
}

export interface FeeBreakdown {
  sourceGasFeeUsdc: bigint;
  sourceDeployFeeUsdc: bigint;
  relayerGasFeeUsdc: bigint;
  destDeployFeeUsdc: bigint;
  operationalFeeUsdc: bigint;
  totalFeeUsdc: bigint;

  // Metadata
  sourceGasPrice: string;
  destGasPrice?: string;
  sourceNativeTokenPriceUsd: number;
  destNativeTokenPriceUsd?: number;
  estimatedAt: string;
}

const ERC20_TRANSFER_ABI = [
  {
    type: 'function' as const,
    name: 'transfer' as const,
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable' as const,
  },
] as const;

@Injectable()
export class FeeService {
  private readonly logger = new Logger(FeeService.name);

  // Price cache: coinGeckoId → { priceUsd, fetchedAt }
  private priceCache = new Map<
    string,
    { priceUsd: number; fetchedAt: number }
  >();

  // Gas price cache: chain → { gasPrice, fetchedAt }
  private gasPriceCache = new Map<
    string,
    { gasPrice: bigint; fetchedAt: number }
  >();

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Estimate total operation fee in USDC (6 decimals).
   * Covers: source chain gas + AA deployment + relayer mint + operational %.
   */
  async estimateOperationFee(
    params: FeeEstimationParams,
  ): Promise<FeeBreakdown> {
    const now = new Date().toISOString();

    // Source chain gas cost
    const sourceGasPrice = await this.getGasPrice(params.sourceChain);
    const sourceTokenPrice = await this.getNativeTokenPriceUsd(
      params.sourceChain,
    );

    const sourceGasUnits =
      params.operationGasUnits + GAS_UNITS.FEE_TRANSFER;
    const sourceGasFeeUsdc = this.gasToUsdc(
      sourceGasUnits,
      sourceGasPrice,
      sourceTokenPrice,
    );

    // AA deployment on source (if needed)
    const sourceDeployFeeUsdc = params.needsSourceDeployment
      ? this.gasToUsdc(
          GAS_UNITS.AA_DEPLOYMENT,
          sourceGasPrice,
          sourceTokenPrice,
        )
      : 0n;

    // Destination chain costs (if cross-chain)
    let relayerGasFeeUsdc = 0n;
    let destDeployFeeUsdc = 0n;
    let destGasPrice: bigint | undefined;
    let destTokenPrice: number | undefined;

    if (params.isCrossChain && params.destinationChain) {
      destGasPrice = await this.getGasPrice(params.destinationChain);
      destTokenPrice = await this.getNativeTokenPriceUsd(
        params.destinationChain,
      );

      relayerGasFeeUsdc = this.gasToUsdc(
        GAS_UNITS.RELAYER_MINT,
        destGasPrice,
        destTokenPrice,
      );

      if (params.needsDestDeployment) {
        destDeployFeeUsdc = this.gasToUsdc(
          GAS_UNITS.AA_DEPLOYMENT,
          destGasPrice,
          destTokenPrice,
        );
      }
    }

    // Operational fee (percentage of amount)
    const operationalFeeUsdc =
      params.feePercent > 0
        ? (params.operationAmount *
            BigInt(Math.round(params.feePercent * 10000))) /
          10000n
        : 0n;

    const totalFeeUsdc =
      sourceGasFeeUsdc +
      sourceDeployFeeUsdc +
      relayerGasFeeUsdc +
      destDeployFeeUsdc +
      operationalFeeUsdc;

    const breakdown: FeeBreakdown = {
      sourceGasFeeUsdc,
      sourceDeployFeeUsdc,
      relayerGasFeeUsdc,
      destDeployFeeUsdc,
      operationalFeeUsdc,
      totalFeeUsdc,
      sourceGasPrice: sourceGasPrice.toString(),
      destGasPrice: destGasPrice?.toString(),
      sourceNativeTokenPriceUsd: sourceTokenPrice,
      destNativeTokenPriceUsd: destTokenPrice,
      estimatedAt: now,
    };

    this.logger.debug(
      `Fee estimate: ${Number(totalFeeUsdc) / 1e6} USDC ` +
        `(gas: ${Number(sourceGasFeeUsdc) / 1e6}, deploy: ${Number(sourceDeployFeeUsdc + destDeployFeeUsdc) / 1e6}, ` +
        `relayer: ${Number(relayerGasFeeUsdc) / 1e6}, operational: ${Number(operationalFeeUsdc) / 1e6})`,
    );

    return breakdown;
  }

  /**
   * Check if a smart account is already deployed on a chain.
   * Calls eth_getCode — deployed accounts have non-empty bytecode.
   */
  async isAccountDeployed(
    chain: string,
    walletAddress: string,
  ): Promise<boolean> {
    const chainConfig = ALL_CHAINS[chain];
    if (!chainConfig) return false;

    try {
      const res = await fetch(chainConfig.rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getCode',
          params: [walletAddress, 'latest'],
        }),
      });
      const data = await res.json();
      const code = data.result as string;
      return code !== undefined && code !== '0x' && code.length > 2;
    } catch (err) {
      this.logger.warn(
        `Failed to check deployment on ${chain}: ${err.message}`,
      );
      // Assume not deployed (overestimate fee) for safety
      return false;
    }
  }

  /**
   * Build a USDC transfer call for fee collection.
   */
  buildFeeTransferCalls(
    chain: string,
    treasuryAddress: string,
    amount: bigint,
  ): UserOperationCall[] {
    if (amount <= 0n) return [];

    const usdcAddress = getUsdcAddress(chain);
    return [
      {
        to: usdcAddress,
        data: encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [treasuryAddress as `0x${string}`, amount],
        }),
      },
    ];
  }

  /**
   * Serialize a FeeBreakdown for JSON/DB storage (bigints → strings).
   */
  serializeBreakdown(breakdown: FeeBreakdown): Record<string, any> {
    return {
      sourceGasFee: (Number(breakdown.sourceGasFeeUsdc) / 1e6).toFixed(6),
      sourceDeployFee: (Number(breakdown.sourceDeployFeeUsdc) / 1e6).toFixed(6),
      relayerGasFee: (Number(breakdown.relayerGasFeeUsdc) / 1e6).toFixed(6),
      destDeployFee: (Number(breakdown.destDeployFeeUsdc) / 1e6).toFixed(6),
      operationalFee: (Number(breakdown.operationalFeeUsdc) / 1e6).toFixed(6),
      totalFee: (Number(breakdown.totalFeeUsdc) / 1e6).toFixed(6),
      sourceGasPrice: breakdown.sourceGasPrice,
      destGasPrice: breakdown.destGasPrice,
      sourceNativeTokenPriceUsd: breakdown.sourceNativeTokenPriceUsd,
      destNativeTokenPriceUsd: breakdown.destNativeTokenPriceUsd,
      estimatedAt: breakdown.estimatedAt,
    };
  }

  // ── Internal: Price Oracle ─────────────────────────────────────────────

  /**
   * Get native token price in USD for a chain.
   * Uses CoinGecko free API with 5-minute cache + fallback prices.
   */
  async getNativeTokenPriceUsd(chain: string): Promise<number> {
    const tokenId = NATIVE_TOKEN_IDS[chain];
    if (!tokenId) {
      this.logger.warn(`No token ID mapping for chain ${chain}, using fallback`);
      return FALLBACK_PRICES_USD[tokenId] ?? 1;
    }

    // Check cache
    const cached = this.priceCache.get(tokenId);
    if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
      return cached.priceUsd;
    }

    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`;
      const res = await fetch(url);
      const data = await res.json();
      const price = data[tokenId]?.usd;

      if (typeof price === 'number' && price > 0) {
        this.priceCache.set(tokenId, {
          priceUsd: price,
          fetchedAt: Date.now(),
        });
        return price;
      }
    } catch (err) {
      this.logger.warn(
        `CoinGecko price fetch failed for ${tokenId}: ${err.message}`,
      );
    }

    // Fallback
    const fallback = FALLBACK_PRICES_USD[tokenId] ?? 1;
    this.logger.warn(`Using fallback price for ${tokenId}: $${fallback}`);
    return fallback;
  }

  // ── Internal: Gas Price ────────────────────────────────────────────────

  /**
   * Get current gas price for a chain (in wei).
   * Caches for 1 minute to avoid excessive RPC calls.
   */
  async getGasPrice(chain: string): Promise<bigint> {
    const cached = this.gasPriceCache.get(chain);
    if (cached && Date.now() - cached.fetchedAt < 60_000) {
      return cached.gasPrice;
    }

    const chainConfig = ALL_CHAINS[chain];
    if (!chainConfig) {
      this.logger.warn(`Unknown chain ${chain} for gas price`);
      return 30_000_000_000n; // 30 gwei fallback
    }

    try {
      const res = await fetch(chainConfig.rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_gasPrice',
          params: [],
        }),
      });
      const data = await res.json();
      if (!data.result) {
        throw new Error(data.error?.message || `No result from eth_gasPrice (HTTP ${res.status})`);
      }
      const gasPrice = BigInt(data.result);

      this.gasPriceCache.set(chain, {
        gasPrice,
        fetchedAt: Date.now(),
      });

      return gasPrice;
    } catch (err) {
      this.logger.warn(
        `Gas price fetch failed for ${chain}: ${err.message}`,
      );
      return 30_000_000_000n; // 30 gwei fallback
    }
  }

  // ── Internal: Conversion ───────────────────────────────────────────────

  /**
   * Convert gas units + gas price + native token price → USDC amount (6 decimals).
   * Applies 1.5x safety buffer.
   *
   * Formula: gasCostUsdc = gasUnits × gasPriceWei × tokenPriceUsd × 1e6 / 1e18
   * With buffer: × 1.5
   */
  private gasToUsdc(
    gasUnits: bigint,
    gasPriceWei: bigint,
    nativeTokenPriceUsd: number,
  ): bigint {
    // Scale price to avoid floating point: price × 1e8 → integer
    const priceScaled = BigInt(Math.round(nativeTokenPriceUsd * 1e8));

    // gasCostUsdc = gasUnits × gasPriceWei × priceScaled × 1e6 / (1e18 × 1e8)
    // Simplified: / 1e20
    const raw =
      (gasUnits * gasPriceWei * priceScaled * 1_000_000n) /
      (10n ** 18n * 10n ** 8n);

    // Apply 1.5x buffer
    const buffered = (raw * FEE_BUFFER_MULTIPLIER) / 10n;

    // Minimum 1000 = 0.001 USDC (avoid zero fees)
    return buffered > 1000n ? buffered : 1000n;
  }
}
