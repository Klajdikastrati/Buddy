import type { Item } from './types'

/** Frequency decayed by recency: used often *and* lately ranks first. Works for items and foods. */
export function frecency(item: { useCount: number; lastUsedAt: string | null }, now: number): number {
  if (!item.lastUsedAt) return 0
  const days = Math.max(0, (now - Date.parse(item.lastUsedAt)) / 86_400_000)
  return item.useCount / (1 + days / 7)
}

export function rankItems(items: Item[], now: number, limit = 8): Item[] {
  return items
    .filter((i) => !i.deletedAt && !i.archived && i.useCount > 0)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || frecency(b, now) - frecency(a, now))
    .slice(0, limit)
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function searchItems(items: Item[], query: string, now: number, limit = 8): Item[] {
  const q = normalizeName(query)
  if (!q) return rankItems(items, now, limit)
  return items
    .filter((i) => !i.deletedAt && !i.archived && normalizeName(i.name).includes(q))
    .sort((a, b) => {
      const aStart = normalizeName(a.name).startsWith(q) ? 1 : 0
      const bStart = normalizeName(b.name).startsWith(q) ? 1 : 0
      return bStart - aStart || frecency(b, now) - frecency(a, now)
    })
    .slice(0, limit)
}
