// ============================================================================
// OmniFlow Dashboard — UserOp Signing (Circle Modular SDK)
// ============================================================================

import * as state from './state.js';
import { CHAIN_CONFIG } from './utils.js';

// Live client key for mainnet UserOp bundling
const CIRCLE_CLIENT_KEY = 'LIVE_CLIENT_KEY:f7e1a0016e9696cc77499fc2036e0268:2a54d0893cc73933ac0123eaa1ea26e4';

const BUNDLER_RPCS = {
  polygon:   'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/polygon',
  avalanche: 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/avalanche',
  base:      'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/base',
  optimism:  'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/optimism',
  arbitrum:  'https://modular-sdk.circle.com/v1/rpc/w3s/buidl/arbitrum',
};

// SDK references (lazy-loaded)
let toModularTransport, toCircleSmartAccount;
let toWebAuthnAccount, createBundlerClient;
let createPublicClient, defineChain;
let sdkLoaded = false;

/**
 * Load Circle SDK + viem from CDN (once)
 */
async function loadSDK() {
  if (sdkLoaded) return;

  const circleSDK = await import('https://esm.sh/@circle-fin/modular-wallets-core@1');
  toModularTransport = circleSDK.toModularTransport;
  toCircleSmartAccount = circleSDK.toCircleSmartAccount;

  const viemSDK = await import('https://esm.sh/viem@2');
  createPublicClient = viemSDK.createPublicClient;
  defineChain = viemSDK.defineChain;

  const viemAA = await import('https://esm.sh/viem@2/account-abstraction');
  toWebAuthnAccount = viemAA.toWebAuthnAccount;
  createBundlerClient = viemAA.createBundlerClient;

  sdkLoaded = true;
  console.log('[userop] SDK loaded');
}

// Chain definitions cache (built after SDK loads)
let chains = null;

function getChains() {
  if (chains) return chains;
  chains = {};
  for (const [key, cfg] of Object.entries(CHAIN_CONFIG)) {
    chains[key] = defineChain({
      id: cfg.chainId,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      nativeCurrency: { name: cfg.nativeSymbol, symbol: cfg.nativeSymbol, decimals: cfg.nativeDecimals },
      rpcUrls: { default: { http: [cfg.rpc] } },
    });
  }
  return chains;
}

// Per-chain minimum maxFeePerGas — Avalanche C-Chain requires at least 25 gwei
const MIN_FEE_PER_GAS = {
  43114: 30_000_000_000n, // Avalanche: 30 gwei
};

/**
 * Fee estimator — fetch eth_gasPrice from chain's native RPC, apply 2x buffer.
 * Enforces per-chain minimum where the RPC reports a value below what the network accepts.
 */
function nativeFeeEstimator(chain) {
  return async () => {
    const rpcUrl = chain.rpcUrls.default.http[0];
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }),
    });
    const data = await res.json();
    const gasPrice = BigInt(data.result);
    const minFee = MIN_FEE_PER_GAS[chain.id] ?? 100000n;
    const estimated = gasPrice > 100000n ? gasPrice * 2n : 100000n;
    const maxFeePerGas = estimated > minFee ? estimated : minFee;
    const maxPriorityFeePerGas = maxFeePerGas;
    console.log(`[userop] Fee estimate chain ${chain.id}: gasPrice=${gasPrice}, maxFeePerGas=${maxFeePerGas}`);
    return { maxFeePerGas, maxPriorityFeePerGas };
  };
}

/**
 * Sign and submit UserOperations via Circle's bundler.
 *
 * @param {Array} signRequests — client-side sign requests (already filtered for !serverSide)
 *   Each: { stepId, chain, calls: [{ to, data, value? }], description?, type? }
 * @param {Object} [opts] — options
 * @param {boolean} [opts.paymaster=true] — use paymaster (true) or pay gas from AA wallet (false)
 * @returns {Array<{ stepId: string, txHash: string }>}
 */
export async function signAndSubmitUserOps(signRequests, opts = {}) {
  const usePaymaster = opts.paymaster !== undefined ? opts.paymaster : true;
  await loadSDK();

  const walletInfo = state.getWallet();
  if (!walletInfo?.credentialId || !walletInfo?.publicKey) {
    throw new Error('No passkey credential found. Please re-login.');
  }

  const owner = toWebAuthnAccount({
    credential: { id: walletInfo.credentialId, publicKey: walletInfo.publicKey },
  });

  const chainDefs = getChains();

  // Phase 1: Send all UserOps sequentially (each triggers passkey prompt)
  const pending = [];

  for (let i = 0; i < signRequests.length; i++) {
    const req = signRequests[i];
    console.log(`[userop] [${i + 1}/${signRequests.length}] ${req.description || req.type} (${req.chain})...`);

    const chain = chainDefs[req.chain];
    const bundlerUrl = BUNDLER_RPCS[req.chain];

    if (!chain || !bundlerUrl) {
      console.warn(`[userop] SKIP: no config for chain "${req.chain}"`);
      continue;
    }

    const transport = toModularTransport(bundlerUrl, CIRCLE_CLIENT_KEY);
    const client = createPublicClient({ chain, transport });
    const account = await toCircleSmartAccount({ client, owner });

    const bundlerClient = createBundlerClient({
      account,
      client,
      transport,
      paymaster: usePaymaster,
      userOperation: { estimateFeesPerGas: nativeFeeEstimator(chain) },
    });

    console.log('[userop] Sending UserOp...');
    const hash = await bundlerClient.sendUserOperation({
      calls: req.calls.map(c => ({
        to: c.to,
        data: c.data,
        ...(c.value ? { value: BigInt(c.value) } : {}),
      })),
    });

    console.log(`[userop] UserOp hash: ${hash}`);
    pending.push({ stepId: req.stepId, hash, bundlerClient, chain: req.chain });
  }

  // Phase 2: Wait for all receipts in parallel
  console.log(`[userop] Waiting for ${pending.length} receipt(s) in parallel...`);

  const results = await Promise.allSettled(
    pending.map(async ({ stepId, hash, bundlerClient, chain }) => {
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash,
        timeout: 120_000,
        pollingInterval: 3_000,
      });
      const txHash = receipt.receipt.transactionHash;
      console.log(`[userop] ${chain} TX: ${txHash}`);
      return { stepId, txHash };
    })
  );

  const signatures = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      signatures.push(r.value);
    } else {
      console.error('[userop] Receipt failed:', r.reason);
    }
  }

  return signatures;
}
