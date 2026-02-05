export interface BurnIntentSpec {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  sourceContract: string;
  destinationContract: string;
  sourceToken: string;
  destinationToken: string;
  sourceDepositor: string;
  destinationRecipient: string;
  sourceSigner: string;
  destinationCaller: string;
  value: bigint;
  salt: string;
  hookData: string;
}

export interface BurnIntent {
  maxBlockHeight: bigint;
  maxFee: bigint;
  spec: BurnIntentSpec;
}

export interface BurnIntentRequest {
  burnIntent: {
    maxBlockHeight: string;
    maxFee: string;
    spec: {
      version: number;
      sourceDomain: number;
      destinationDomain: number;
      sourceContract: string;
      destinationContract: string;
      sourceToken: string;
      destinationToken: string;
      sourceDepositor: string;
      destinationRecipient: string;
      sourceSigner: string;
      destinationCaller: string;
      value: string;
      salt: string;
      hookData: string;
    };
  };
  signature: string;
}

export interface TransferResponse {
  attestation: string;
  signature: string;
  success?: boolean;
}

export interface BalanceEntry {
  domain: number;
  depositor?: string;
  balance: string;
}

export interface BalancesResponse {
  token?: string;
  balances: BalanceEntry[];
}

export interface ParsedBalance {
  chain: string;
  domain: number;
  balance: bigint;
}

export interface UserOperationCall {
  to: string;
  data: string;
  value?: bigint;
}

export const USDC_DECIMALS = 6;
