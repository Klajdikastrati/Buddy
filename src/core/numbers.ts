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

/** 62.5 → "62.5 kg". */
export const formatKg = (n: number, digits = 1) => `${formatNumber(n, digits)} kg`

/** "Glasses of water" → "glasses_of_water", unique among `taken`. */
export function slugKey(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'field'
  let key = base
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`
  return key
}
