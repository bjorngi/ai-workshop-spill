// Shared number/value formatting for axis ticks and reveal panels. Pure, no DOM.

/**
 * Format a number for display: nb-NO thousands grouping at >= 1000, plain
 * integer when whole, otherwise one decimal.
 */
export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toLocaleString("nb-NO");
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** formatNumber plus an optional unit suffix, e.g. "168 cm". */
export function formatValue(value: number, unit?: string): string {
  const n = formatNumber(value);
  return unit ? `${n} ${unit}` : n;
}
