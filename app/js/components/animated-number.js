// ============================================================================
// Animated Number (CountUp)
// ============================================================================

export function animateNumber(element, endValue, duration = 800, prefix = '$') {
  const start = parseFloat(element.dataset.currentValue) || 0;
  const end = typeof endValue === 'string' ? parseFloat(endValue) : endValue;

  if (isNaN(end)) {
    element.textContent = prefix + '0.00';
    return;
  }

  element.dataset.currentValue = end;

  if (Math.abs(end - start) < 0.01) {
    element.textContent = prefix + end.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return;
  }

  const startTime = performance.now();
  const diff = end - start;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + diff * eased;

    element.textContent = prefix + current.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}
