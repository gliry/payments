import { GatewayService } from '../../circle/gateway/gateway.service';

/**
 * Check which chains need delegate setup.
 * Checks on-chain `isAuthorizedForBalance` for each chain.
 */
export async function getChainsNeedingDelegate(
  gatewayService: GatewayService,
  chains: string[],
  walletAddress: string,
  delegateAddress: string,
): Promise<string[]> {
  const uniqueChains = [...new Set(chains)];
  const results = await Promise.allSettled(
    uniqueChains.map((chain) =>
      gatewayService.isDelegateAuthorized(chain, walletAddress, delegateAddress),
    ),
  );

  const needsDelegate: string[] = [];
  for (let i = 0; i < uniqueChains.length; i++) {
    const result = results[i];
    const authorized = result.status === 'fulfilled' ? result.value : false;
    if (!authorized) {
      needsDelegate.push(uniqueChains[i]);
    }
  }
  return needsDelegate;
}
