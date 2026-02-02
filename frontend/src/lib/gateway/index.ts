/**
 * Circle Gateway Integration
 *
 * Exports all Gateway functionality for cross-chain USDC transfers.
 */

// Config
export {
  GATEWAY_WALLET,
  GATEWAY_MINTER,
  GATEWAY_API,
  GATEWAY_DOMAINS,
  DOMAIN_TO_CHAIN,
  getDomain,
} from './config';

// Types
export type {
  BurnIntent,
  BurnIntentSpec,
  BurnIntentRequest,
  TransferResponse,
  BalanceEntry,
  BalancesResponse,
  ParsedBalance,
  GatewayTypedDataDomain,
} from './types';

// Operations (UserOperation builders)
export {
  buildGatewayDepositCalls,
  buildGatewayMintCalls,
  ERC20_ABI,
  GATEWAY_WALLET_ABI,
  GATEWAY_MINTER_ABI,
} from './operations';

// API interactions
export {
  getGatewayBalance,
  getTotalGatewayBalance,
  createBurnIntent,
  requestTransfer,
  initiateTransfer,
} from './api';
