// Wallet management (Modular Wallets with Passkey)
export {
  CircleConfig,
  isWebAuthnSupported,
  isValidAddress,
  getExplorerUrl,
  storeWalletInfo,
  getStoredWalletInfo,
  clearStoredWalletInfo,
  BROWSER_USAGE_INSTRUCTIONS,
} from './lib/wallets';
export type { WalletInfo, WebAuthnCredential, CircleSmartAccount } from './lib/wallets';

// Config
export { CHAINS, ARC_TESTNET, ALL_CHAINS } from './config/chains';
export type { ChainConfig, SupportedChain } from './config/chains';

// Gateway (cross-chain USDC transfers)
export {
  GATEWAY_WALLET,
  GATEWAY_MINTER,
  GATEWAY_API,
  GATEWAY_DOMAINS,
  DOMAIN_TO_CHAIN,
  getDomain,
  buildGatewayDepositCalls,
  buildGatewayMintCalls,
  buildMscaDepositCalls,
  buildAddDelegateCalls,
  buildRemoveDelegateCalls,
  getGatewayBalance,
  getTotalGatewayBalance,
  createBurnIntent,
  requestTransfer,
  initiateTransfer,
  initiateMscaTransfer,
} from './lib/gateway';
export type {
  BurnIntent,
  TransferResponse,
  ParsedBalance,
} from './lib/gateway';
