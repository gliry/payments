/**
 * Circle Smart Account utilities for Account Abstraction
 *
 * ⚠️  IMPORTANT: OWNER TYPE AFFECTS AA ADDRESS!
 *
 * The Smart Account address is determined by CREATE2 using:
 *   mixedSalt = keccak256(owner + salt)
 *
 * Different owner types produce DIFFERENT addresses:
 *   - EOA owner (privateKey)  → AA address 0xAAA...
 *   - Passkey owner (WebAuthn) → AA address 0xBBB... (DIFFERENT!)
 *
 * For automation/CLI scripts, use EOA mode.
 * For browser UX with biometrics, use Passkey mode.
 *
 * @see https://developers.circle.com/wallets/account-types
 * @see https://developers.circle.com/wallets/modular/web-sdk
 */
import { type Chain, type Hex, type PublicClient } from 'viem';
import { type PrivateKeyAccount } from 'viem/accounts';
/**
 * Circle bundler RPC endpoints for each chain
 */
export declare const CIRCLE_BUNDLER_RPCS: Record<string, string>;
/**
 * Public RPC endpoints for reading chain state
 */
export declare const PUBLIC_RPCS: Record<string, string>;
/**
 * Chain definitions for viem
 */
export declare const CHAIN_DEFINITIONS: Record<string, Chain>;
export interface SmartAccountSetup {
    accountAddress: Hex;
    bundlerClient: BundlerClient;
    publicClient: PublicClient;
    owner: PrivateKeyAccount;
    chainKey: string;
    bundlerRpc: string;
}
export interface UserOperationCall {
    to: Hex;
    data: Hex;
    value?: bigint;
}
export interface UserOperationResult {
    userOpHash: Hex;
    txHash: Hex;
}
interface BundlerClient {
    sendUserOperation(params: {
        calls: UserOperationCall[];
    }): Promise<Hex>;
    waitForUserOperationReceipt(params: {
        hash: Hex;
    }): Promise<{
        receipt: {
            transactionHash: Hex;
        };
    }>;
}
/**
 * Create a Circle Smart Account with EOA signer
 *
 * ✅ Works in: Node.js, Browser
 * ✅ Automation: Full (private key can sign without user interaction)
 *
 * @param chainKey - Chain identifier (e.g., 'ethereum-sepolia', 'arc-testnet')
 * @param ownerPrivateKey - Private key of the EOA owner (hex string with 0x prefix)
 * @returns Smart account setup with bundler client
 */
export declare function createSmartAccountWithEOA(chainKey: string, ownerPrivateKey: Hex): Promise<SmartAccountSetup>;
/**
 * Alias for createSmartAccountWithEOA (backwards compatibility)
 * @deprecated Use createSmartAccountWithEOA for clarity
 */
export declare const createSmartAccountForChain: typeof createSmartAccountWithEOA;
/**
 * Create a Circle Smart Account with Passkey (WebAuthn) signer
 *
 * ⚠️  BROWSER ONLY - Does NOT work in Node.js!
 */
export declare function createSmartAccountWithPasskey(_chainKey: string, _credential: unknown): Promise<SmartAccountSetup>;
/**
 * Send a UserOperation from the Smart Account
 */
export declare function sendUserOperation(setup: SmartAccountSetup, calls: UserOperationCall[]): Promise<UserOperationResult>;
/**
 * Get the Smart Account address for a given EOA owner
 */
export declare function getSmartAccountAddress(ownerPrivateKey: Hex): Promise<Hex>;
/**
 * Create Smart Accounts on multiple chains with the same owner
 */
export declare function createSmartAccountsOnMultipleChains(chainKeys: string[], ownerPrivateKey: Hex): Promise<Map<string, SmartAccountSetup>>;
export declare function encodeApprove(spender: Hex, amount: bigint): Hex;
export declare function encodeDepositForBurn(amount: bigint, destinationDomain: number, mintRecipient: Hex, burnToken: Hex): Hex;
export declare function encodeReceiveMessage(messageBytes: Hex, attestation: Hex): Hex;
export declare function addressToBytes32(address: Hex): Hex;
export {};
