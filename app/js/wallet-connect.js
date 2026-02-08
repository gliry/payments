// ============================================================================
// OmniFlow Dashboard — External Wallet (MetaMask) Connection
// ============================================================================

import { CHAIN_CONFIG, getChainKeyByChainId, formatTokenBalance } from './utils.js';

let connectedAddress = null;
let connectedChainId = null;

// ERC20 balanceOf(address) selector
const BALANCE_OF_SELECTOR = '0x70a08231';

function getEthereum() {
  return window.ethereum;
}

/**
 * Connect MetaMask wallet
 * @returns {{ address: string, chainId: number }}
 */
export async function connectWallet() {
  const ethereum = getEthereum();
  if (!ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
  }

  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from MetaMask.');
  }

  connectedAddress = accounts[0];
  connectedChainId = parseInt(await ethereum.request({ method: 'eth_chainId' }), 16);

  // Listen for account/chain changes
  ethereum.on('accountsChanged', handleAccountsChanged);
  ethereum.on('chainChanged', handleChainChanged);

  return { address: connectedAddress, chainId: connectedChainId };
}

/**
 * Disconnect wallet (reset module state)
 */
export function disconnectWallet() {
  const ethereum = getEthereum();
  if (ethereum) {
    ethereum.removeListener('accountsChanged', handleAccountsChanged);
    ethereum.removeListener('chainChanged', handleChainChanged);
  }
  connectedAddress = null;
  connectedChainId = null;
}

/**
 * Get currently connected address
 */
export function getConnectedAddress() {
  return connectedAddress;
}

/**
 * Fetch native + USDC balances across all chains
 * @param {string} address
 * @returns {Promise<Array<{ chainKey, nativeSymbol, nativeBalance, nativeFormatted, usdcBalance, usdcFormatted }>>}
 */
export async function getMultiChainBalances(address) {
  const entries = Object.entries(CHAIN_CONFIG);

  const results = await Promise.allSettled(
    entries.map(async ([chainKey, cfg]) => {
      // Fetch native balance
      const nativeHex = await rpcCall(cfg.rpc, 'eth_getBalance', [address, 'latest']);
      const nativeBalance = BigInt(nativeHex);

      // Fetch USDC balance via balanceOf(address)
      const paddedAddr = address.slice(2).toLowerCase().padStart(64, '0');
      const callData = BALANCE_OF_SELECTOR + paddedAddr;
      const usdcHex = await rpcCall(cfg.rpc, 'eth_call', [
        { to: cfg.usdc, data: callData },
        'latest',
      ]);
      const usdcBalance = BigInt(usdcHex || '0x0');

      return {
        chainKey,
        nativeSymbol: cfg.nativeSymbol,
        nativeBalance,
        nativeFormatted: formatTokenBalance(nativeBalance, 18),
        usdcBalance,
        usdcFormatted: formatTokenBalance(usdcBalance, 6),
      };
    })
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((r) => r.nativeBalance > 0n || r.usdcBalance > 0n);
}

/**
 * Switch MetaMask to a specific chain
 */
export async function switchChain(chainId) {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error('MetaMask not available');

  const hexChainId = '0x' + chainId.toString(16);

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (err) {
    // 4902 = chain not added
    if (err.code === 4902) {
      const cfg = Object.values(CHAIN_CONFIG).find((c) => c.chainId === chainId);
      const chainKey = getChainKeyByChainId(chainId);
      if (cfg && chainKey) {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hexChainId,
            chainName: chainKey.charAt(0).toUpperCase() + chainKey.slice(1),
            rpcUrls: [cfg.rpc],
            nativeCurrency: {
              name: cfg.nativeSymbol,
              symbol: cfg.nativeSymbol,
              decimals: cfg.nativeDecimals,
            },
          }],
        });
      }
    } else {
      throw err;
    }
  }

  connectedChainId = chainId;
}

/**
 * Send a transaction via MetaMask
 * @returns {string} txHash
 */
export async function sendTransaction(tx) {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error('MetaMask not available');

  const txHash = await ethereum.request({
    method: 'eth_sendTransaction',
    params: [tx],
  });
  return txHash;
}

/**
 * Wait for a transaction to be mined (receipt)
 * @param {string} txHash
 * @param {number} chainId
 * @param {number} timeoutMs - max wait time (default 60s)
 * @returns {Promise<object>} receipt
 */
export async function waitForReceipt(txHash, chainId, timeoutMs = 60000) {
  const cfg = Object.values(CHAIN_CONFIG).find((c) => c.chainId === chainId);
  const rpcUrl = cfg?.rpc;
  if (!rpcUrl) throw new Error(`No RPC for chainId ${chainId}`);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await rpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
      if (receipt && receipt.blockNumber) return receipt;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Transaction not confirmed in time');
}

// --- Internal helpers ---

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    connectedAddress = null;
  } else {
    connectedAddress = accounts[0];
  }
  window.dispatchEvent(new CustomEvent('wallet-external-change'));
}

function handleChainChanged(chainIdHex) {
  connectedChainId = parseInt(chainIdHex, 16);
  window.dispatchEvent(new CustomEvent('wallet-external-change'));
}
