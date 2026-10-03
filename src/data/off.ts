import type { FoodDraft } from '../core/nutrition'
import { foodFromOff, OFF_FIELDS, type OffProduct } from '../core/off'

// Open Food Facts (no key, CORS *). Only called on an explicit search or scan —
// never in a routine flow. Results are not stored until a food is logged.

const BASE = 'https://world.openfoodfacts.org'

async function getJson(url: string, ms = 10_000): Promise<{ status: number; body: unknown }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok && res.status !== 404) throw new Error(`Open Food Facts: HTTP ${res.status}`)
    return { status: res.status, body: await res.json() }
  } finally {
    clearTimeout(timer)
  }
}

/** Product by barcode, or null if Open Food Facts doesn't know it. */
export async function offProduct(code: string): Promise<FoodDraft | null> {
  const { body } = await getJson(`${BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`)
  const data = body as { status?: number; product?: OffProduct }
  return data.status === 1 && data.product ? foodFromOff(data.product, code) : null
}

/**
 * Text search. The search endpoint is often overloaded (503 without CORS
 * headers, which the browser reports as a network error), so retry briefly.
 */
export async function offSearch(query: string): Promise<FoodDraft[]> {
  const q = encodeURIComponent(query.trim())
  const url = `${BASE}/cgi/search.pl?search_terms=${q}&json=1&page_size=20&fields=${OFF_FIELDS}`
  let body: unknown
  for (let attempt = 1; ; attempt++) {
    try {
      body = (await getJson(url)).body
      break
    } catch (e) {
      if (attempt === 3) throw e
      await new Promise((r) => setTimeout(r, 600 * attempt))
    }
  }
  const products = ((body as { products?: OffProduct[] }).products ?? []).filter((p) => p.code)
  // The same product is often listed once per country; keep the first of each name/brand/kcal.
  const seen = new Set<string>()
  return products.flatMap((p) => {
    const f = foodFromOff(p)
    const key = f && `${f.name.toLowerCase()}|${f.brand?.toLowerCase() ?? ''}|${f.kcal}`
    if (!f || seen.has(key!)) return []
    seen.add(key!)
    return [f]
  })
}
