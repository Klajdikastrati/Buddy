/** Parses a non-negative decimal, accepting a comma ("72,4" → 72.4); null when empty or invalid. */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** 1234.5 → "1,234.5" with at most `digits` decimals. */
export function formatNumber(n: number, digits = 1): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n)
}
