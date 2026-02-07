// ============================================================================
// Status Badge Component
// ============================================================================

export function statusBadge(status) {
  const labels = {
    COMPLETED: 'Completed',
    completed: 'Completed',
    PROCESSING: 'Processing',
    processing: 'Processing',
    PENDING: 'Pending',
    pending: 'Pending',
    FAILED: 'Failed',
    failed: 'Failed',
    CONFIRMED: 'Confirmed',
    AWAITING_SIGNATURE: 'Awaiting Signature',
    AWAITING_SIGNATURE_PHASE2: 'Awaiting Sig. (2)',
    active: 'Active',
    inactive: 'Inactive',
  };

  const cssMap = {
    COMPLETED: 'completed',
    CONFIRMED: 'completed',
    PROCESSING: 'processing',
    PENDING: 'pending',
    FAILED: 'failed',
    AWAITING_SIGNATURE: 'pending',
    AWAITING_SIGNATURE_PHASE2: 'pending',
  };

  const label = labels[status] || status;
  const cssStatus = cssMap[status] || status;
  return `<span class="badge badge--${cssStatus}">${label}</span>`;
}
