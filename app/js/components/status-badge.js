// ============================================================================
// Status Badge Component
// ============================================================================

export function statusBadge(status) {
  const labels = {
    completed: 'Completed',
    processing: 'Processing',
    pending: 'Pending',
    failed: 'Failed',
    active: 'Active',
    inactive: 'Inactive',
  };
  const label = labels[status] || status;
  return `<span class="badge badge--${status}">${label}</span>`;
}
