import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LifiQuoteRequest,
  LifiQuoteResponse,
} from './lifi.types';
import { buildGatewayDepositCalls } from '../circle/gateway/gateway.operations';
import { getUsdcAddress } from '../circle/config/chains';

const LIFI_API = 'https://li.quest/v1';
const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

@Injectable()
export class LifiService {
  private readonly logger = new Logger(LifiService.name);

  constructor(private readonly configService: ConfigService) {}

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  async getQuote(params: LifiQuoteRequest): Promise<LifiQuoteResponse> {
    const qs: Record<string, string> = {
      fromChain: String(params.fromChain),
      toChain: String(params.toChain),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      integrator: params.integrator || 'omniflow',
    };
    if (params.toAddress) qs.toAddress = params.toAddress;
    if (params.order) qs.order = params.order;
    if (params.slippage !== undefined) qs.slippage = String(params.slippage);

    return this.lifiGet<LifiQuoteResponse>('/quote', qs);
  }

  // ---------------------------------------------------------------------------
  // Call-data builders
  // ---------------------------------------------------------------------------

  /**
   * Build UserOp calls for a LiFi swap: [approve?, swap]
   */
  buildSwapCalls(
    quote: LifiQuoteResponse,
    fromToken: string,
    amount: bigint,
  ): Array<{ to: string; data: string; value?: bigint }> {
    const tx = quote.transactionRequest;
    const approvalAddress = quote.estimate.approvalAddress;
    const nativeValue = BigInt(tx.value || '0');

    const calls: Array<{ to: string; data: string; value?: bigint }> = [];

    // ERC20 approval (skip for native token)
    if (fromToken.toLowerCase() !== NATIVE_TOKEN && approvalAddress) {
      const spenderPadded = approvalAddress.slice(2).toLowerCase().padStart(64, '0');
      const amountHex = amount.toString(16).padStart(64, '0');
      calls.push({
        to: fromToken,
        data: `0x095ea7b3${spenderPadded}${amountHex}`,
      });
    }

    // Swap/bridge call
    calls.push({
      to: tx.to,
      data: tx.data,
      ...(nativeValue > 0n && { value: nativeValue }),
    });

    return calls;
  }

  /**
   * Build combined calls for inflow: [approve→LiFi, swap, approve→Gateway, deposit]
   * Optionally prepends addDelegate calls.
   */
  buildSwapAndDepositCalls(
    quote: LifiQuoteResponse,
    fromToken: string,
    amount: bigint,
    chainKey: string,
    depositAmount: bigint,
  ): Array<{ to: string; data: string; value?: bigint }> {
    const swapCalls = this.buildSwapCalls(quote, fromToken, amount);
    const usdcAddress = getUsdcAddress(chainKey);
    const depositCalls = buildGatewayDepositCalls(usdcAddress, depositAmount);

    return [...swapCalls, ...depositCalls];
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = this.configService.get<string>('LIFI_API_KEY');
    if (apiKey) headers['x-lifi-api-key'] = apiKey;
    return headers;
  }

  private async lifiGet<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${LIFI_API}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      }
    }

    this.logger.debug(`GET ${url.toString()}`);
    const res = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LI.FI API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }
}
