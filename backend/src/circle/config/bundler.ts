/**
 * ZeroDev bundler RPC URL builder.
 * Format: https://rpc.zerodev.app/api/v3/{projectId}/chain/{chainId}
 *
 * The ZeroDev universal RPC proxies bundler, paymaster, and public client.
 */
export function getZeroDevRpc(chainId: number): string {
  const projectId = process.env.ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error('ZERODEV_PROJECT_ID environment variable is required');
  }
  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
}

/**
 * Pimlico bundler RPC URL builder.
 * Format: https://api.pimlico.io/v2/{chainId}/rpc?apikey={apiKey}
 *
 * Pimlico acts as both bundler and paymaster (ERC-7677 standard).
 * Used as fallback for chains where ZeroDev bundler simulation fails
 * (Base, Optimism, Arbitrum — AA13 on first MSCA deployment).
 */
export function getPimlicoRpc(chainId: number): string {
  const apiKey = process.env.PIMLICO_API_KEY;
  if (!apiKey) {
    throw new Error('PIMLICO_API_KEY environment variable is required for this chain');
  }
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`;
}

/**
 * Chains where ZeroDev bundler fails to simulate Kernel v3.1 factory deployment.
 * These chains use Pimlico bundler+paymaster as fallback.
 */
export const PIMLICO_FALLBACK_CHAINS = new Set([8453, 10, 42161]); // Base, Optimism, Arbitrum

/**
 * Get the appropriate bundler RPC for a chain.
 * Uses Pimlico for chains in PIMLICO_FALLBACK_CHAINS, ZeroDev otherwise.
 */
export function getBundlerRpc(chainId: number): { url: string; provider: 'zerodev' | 'pimlico' } {
  if (PIMLICO_FALLBACK_CHAINS.has(chainId) && process.env.PIMLICO_API_KEY) {
    return { url: getPimlicoRpc(chainId), provider: 'pimlico' };
  }
  return { url: getZeroDevRpc(chainId), provider: 'zerodev' };
}
