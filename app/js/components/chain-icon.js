// ============================================================================
// Chain Icon + Badge Component
// ============================================================================

import { getChainMeta, getChainSVG } from '../utils.js';

export function chainBadge(chain, showIcon = true) {
  const meta = getChainMeta(chain);
  const icon = showIcon ? getChainSVG(chain, 14) : '';
  return `<span class="badge badge--chain" style="background: ${meta.color}15; color: ${meta.color}">${icon} ${meta.name}</span>`;
}

export function chainIcon(chain, size = 32) {
  return getChainSVG(chain, size);
}
