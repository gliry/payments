"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSmartAccountForChain = exports.CHAIN_DEFINITIONS = exports.PUBLIC_RPCS = exports.CIRCLE_BUNDLER_RPCS = void 0;
exports.createSmartAccountWithEOA = createSmartAccountWithEOA;
exports.createSmartAccountWithPasskey = createSmartAccountWithPasskey;
exports.sendUserOperation = sendUserOperation;
exports.getSmartAccountAddress = getSmartAccountAddress;
exports.createSmartAccountsOnMultipleChains = createSmartAccountsOnMultipleChains;
exports.encodeApprove = encodeApprove;
exports.encodeDepositForBurn = encodeDepositForBurn;
exports.encodeReceiveMessage = encodeReceiveMessage;
exports.addressToBytes32 = addressToBytes32;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const circle_1 = require("../../config/circle");
// =============================================================================
// CONFIGURATION
// =============================================================================
/**
 * Circle bundler RPC endpoints for each chain
 */
exports.CIRCLE_BUNDLER_RPCS = {
    'ethereum-sepolia': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/ethereumSepolia',
    'base-sepolia': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/baseSepolia',
    'sonic-testnet': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/sonicTestnet',
    'arc-testnet': 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/arcTestnet',
};
/**
 * Public RPC endpoints for reading chain state
 */
exports.PUBLIC_RPCS = {
    'ethereum-sepolia': 'https://rpc.sepolia.org',
    'base-sepolia': 'https://sepolia.base.org',
    'sonic-testnet': 'https://rpc.blaze.soniclabs.com',
    'arc-testnet': 'https://rpc.testnet.arc.network',
};
/**
 * Chain definitions for viem
 */
exports.CHAIN_DEFINITIONS = {
    'ethereum-sepolia': {
        id: 11155111,
        name: 'Ethereum Sepolia',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
            default: { http: ['https://rpc.sepolia.org'] },
        },
    },
    'base-sepolia': {
        id: 84532,
        name: 'Base Sepolia',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
            default: { http: ['https://sepolia.base.org'] },
        },
    },
    'sonic-testnet': {
        id: 64165,
        name: 'Sonic Testnet',
        nativeCurrency: { name: 'S', symbol: 'S', decimals: 18 },
        rpcUrls: {
            default: { http: ['https://rpc.blaze.soniclabs.com'] },
        },
    },
    'arc-testnet': {
        id: 5042002,
        name: 'Arc Testnet',
        nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
        rpcUrls: {
            default: { http: ['https://rpc.testnet.arc.network'] },
        },
    },
};
// EntryPoint v0.7 address (same on all chains)
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
let rpcId = 1;
async function callBundler(bundlerUrl, method, params) {
    const request = {
        jsonrpc: '2.0',
        id: rpcId++,
        method,
        params,
    };
    console.log(`[RPC] ${method}`, JSON.stringify(params).slice(0, 200));
    const response = await fetch(bundlerUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${circle_1.CIRCLE_CLIENT_KEY}`,
        },
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Bundler HTTP error: ${response.status} ${response.statusText}: ${text}`);
    }
    const data = (await response.json());
    if (data.error) {
        throw new Error(`Bundler RPC error: ${data.error.message} (code: ${data.error.code})`);
    }
    return data.result;
}
// =============================================================================
// CALLDATA ENCODING
// =============================================================================
function encodeExecute(target, value, data) {
    return (0, viem_1.encodeFunctionData)({
        abi: (0, viem_1.parseAbi)(['function execute(address target, uint256 value, bytes data)']),
        functionName: 'execute',
        args: [target, value, data],
    });
}
function encodeExecuteBatch(targets, values, datas) {
    return (0, viem_1.encodeFunctionData)({
        abi: (0, viem_1.parseAbi)(['function executeBatch(address[] targets, uint256[] values, bytes[] datas)']),
        functionName: 'executeBatch',
        args: [targets, values, datas],
    });
}
function encodeCalls(calls) {
    if (calls.length === 1) {
        const call = calls[0];
        return encodeExecute(call.to, call.value ?? 0n, call.data);
    }
    else {
        const targets = calls.map(c => c.to);
        const values = calls.map(c => c.value ?? 0n);
        const datas = calls.map(c => c.data);
        return encodeExecuteBatch(targets, values, datas);
    }
}
// =============================================================================
// EOA MODE (CLI + Browser)
// =============================================================================
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
async function createSmartAccountWithEOA(chainKey, ownerPrivateKey) {
    const bundlerRpc = exports.CIRCLE_BUNDLER_RPCS[chainKey];
    const publicRpc = exports.PUBLIC_RPCS[chainKey];
    const chain = exports.CHAIN_DEFINITIONS[chainKey];
    if (!bundlerRpc || !chain || !publicRpc) {
        throw new Error(`Unsupported chain: ${chainKey}. Supported: ${Object.keys(exports.CIRCLE_BUNDLER_RPCS).join(', ')}`);
    }
    if (!circle_1.CIRCLE_CLIENT_KEY) {
        throw new Error('CIRCLE_CLIENT_KEY is not set in environment. ' +
            'Get your Client Key from https://console.circle.com');
    }
    console.log(`[EOA MODE] Creating Smart Account on ${chainKey}...`);
    // Create EOA owner account from private key
    const owner = (0, accounts_1.privateKeyToAccount)(ownerPrivateKey);
    // Create public client for reading chain state
    const publicClient = (0, viem_1.createPublicClient)({
        chain,
        transport: (0, viem_1.http)(publicRpc),
    });
    // Get the Smart Account address from Circle bundler
    // Using circle_getAddress RPC method
    const accountAddress = await callBundler(bundlerRpc, 'circle_getAddress', [owner.address, 0] // owner address and salt
    );
    console.log(`[${chainKey}] Smart Account: ${accountAddress}`);
    console.log(`[${chainKey}] Owner EOA: ${owner.address}`);
    // Create bundler client
    const bundlerClient = {
        async sendUserOperation({ calls }) {
            // Encode the calls
            const callData = encodeCalls(calls);
            // Get nonce from EntryPoint
            const nonce = await publicClient.readContract({
                address: ENTRY_POINT,
                abi: (0, viem_1.parseAbi)(['function getNonce(address sender, uint192 key) view returns (uint256)']),
                functionName: 'getNonce',
                args: [accountAddress, 0n],
            });
            // Build UserOperation (ERC-4337 v0.7 format)
            const userOp = {
                sender: accountAddress,
                nonce: (0, viem_1.toHex)(nonce),
                callData,
                callGasLimit: (0, viem_1.toHex)(0n),
                verificationGasLimit: (0, viem_1.toHex)(0n),
                preVerificationGas: (0, viem_1.toHex)(0n),
                maxFeePerGas: (0, viem_1.toHex)(0n),
                maxPriorityFeePerGas: (0, viem_1.toHex)(0n),
                signature: '0x' + '00'.repeat(65), // Stub signature for estimation
            };
            // Estimate gas via bundler
            console.log(`[${chainKey}] Estimating gas...`);
            const gasEstimate = await callBundler(bundlerRpc, 'eth_estimateUserOperationGas', [userOp, ENTRY_POINT]);
            // Update UserOp with gas estimates
            userOp.callGasLimit = gasEstimate.callGasLimit;
            userOp.verificationGasLimit = gasEstimate.verificationGasLimit;
            userOp.preVerificationGas = gasEstimate.preVerificationGas;
            userOp.maxFeePerGas = gasEstimate.maxFeePerGas;
            userOp.maxPriorityFeePerGas = gasEstimate.maxPriorityFeePerGas;
            // Get UserOp hash for signing
            console.log(`[${chainKey}] Getting UserOp hash...`);
            const userOpHash = await callBundler(bundlerRpc, 'eth_getUserOperationHash', [userOp, ENTRY_POINT]);
            // Sign the UserOp hash
            console.log(`[${chainKey}] Signing UserOp...`);
            userOp.signature = await owner.signMessage({ message: { raw: userOpHash } });
            // Send UserOperation
            console.log(`[${chainKey}] Sending UserOp...`);
            const opHash = await callBundler(bundlerRpc, 'eth_sendUserOperation', [userOp, ENTRY_POINT]);
            return opHash;
        },
        async waitForUserOperationReceipt({ hash }) {
            console.log(`[${chainKey}] Waiting for receipt...`);
            // Poll for receipt
            for (let i = 0; i < 60; i++) {
                try {
                    const receipt = await callBundler(bundlerRpc, 'eth_getUserOperationReceipt', [hash]);
                    if (receipt && receipt.receipt) {
                        return receipt;
                    }
                }
                catch (e) {
                    // Not found yet, continue polling
                }
                await new Promise(r => setTimeout(r, 2000));
            }
            throw new Error('UserOperation receipt timeout');
        },
    };
    return {
        accountAddress,
        bundlerClient,
        publicClient,
        owner,
        chainKey,
        bundlerRpc,
    };
}
/**
 * Alias for createSmartAccountWithEOA (backwards compatibility)
 * @deprecated Use createSmartAccountWithEOA for clarity
 */
exports.createSmartAccountForChain = createSmartAccountWithEOA;
// =============================================================================
// PASSKEY MODE (Browser only)
// =============================================================================
/**
 * Create a Circle Smart Account with Passkey (WebAuthn) signer
 *
 * ⚠️  BROWSER ONLY - Does NOT work in Node.js!
 */
async function createSmartAccountWithPasskey(_chainKey, _credential) {
    throw new Error('Passkey mode is only available in the browser with WebAuthn support. ' +
        'For CLI/Node.js scripts, use createSmartAccountWithEOA() instead.');
}
// =============================================================================
// USER OPERATIONS
// =============================================================================
/**
 * Send a UserOperation from the Smart Account
 */
async function sendUserOperation(setup, calls) {
    console.log(`[${setup.chainKey}] Sending UserOperation with ${calls.length} call(s)...`);
    const userOpHash = await setup.bundlerClient.sendUserOperation({ calls });
    console.log(`[${setup.chainKey}] UserOperation sent: ${userOpHash}`);
    const receipt = await setup.bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
    console.log(`[${setup.chainKey}] UserOperation included in tx: ${receipt.receipt.transactionHash}`);
    return {
        userOpHash,
        txHash: receipt.receipt.transactionHash,
    };
}
// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
/**
 * Get the Smart Account address for a given EOA owner
 */
async function getSmartAccountAddress(ownerPrivateKey) {
    const setup = await createSmartAccountWithEOA('ethereum-sepolia', ownerPrivateKey);
    return setup.accountAddress;
}
/**
 * Create Smart Accounts on multiple chains with the same owner
 */
async function createSmartAccountsOnMultipleChains(chainKeys, ownerPrivateKey) {
    const accounts = new Map();
    for (const chainKey of chainKeys) {
        const setup = await createSmartAccountWithEOA(chainKey, ownerPrivateKey);
        accounts.set(chainKey, setup);
    }
    return accounts;
}
// =============================================================================
// CCTP HELPERS
// =============================================================================
const ERC20_ABI = (0, viem_1.parseAbi)([
    'function approve(address spender, uint256 value) returns (bool)',
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
]);
const TOKEN_MESSENGER_ABI = (0, viem_1.parseAbi)([
    'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)',
]);
const MESSAGE_TRANSMITTER_ABI = (0, viem_1.parseAbi)([
    'function receiveMessage(bytes message, bytes attestation) returns (bool success)',
]);
function encodeApprove(spender, amount) {
    return (0, viem_1.encodeFunctionData)({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount],
    });
}
function encodeDepositForBurn(amount, destinationDomain, mintRecipient, burnToken) {
    return (0, viem_1.encodeFunctionData)({
        abi: TOKEN_MESSENGER_ABI,
        functionName: 'depositForBurn',
        args: [amount, destinationDomain, mintRecipient, burnToken],
    });
}
function encodeReceiveMessage(messageBytes, attestation) {
    return (0, viem_1.encodeFunctionData)({
        abi: MESSAGE_TRANSMITTER_ABI,
        functionName: 'receiveMessage',
        args: [messageBytes, attestation],
    });
}
function addressToBytes32(address) {
    return `0x000000000000000000000000${address.slice(2)}`;
}
