// Open Food Facts → Buddy food. Pure: the fetch lives in data/off.ts.
import { emptyNutrients, type FoodDraft } from './nutrition'
import type { Nutrients, Serving } from './types'

export interface OffProduct {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string | string[]
  quantity?: string
  product_quantity?: number | string
  product_quantity_unit?: string
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: Record<string, number | string | undefined>
}

export const OFF_FIELDS =
  'code,product_name,product_name_en,brands,quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity,nutriments'

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

/** A value only if it is physically plausible per 100 g; crowd-sourced data has typos. */
const within = (v: number | null, max: number) => (v != null && v <= max ? Math.round(v * 10) / 10 : null)

function isLiquid(p: OffProduct): boolean {
  const unit = (p.product_quantity_unit ?? p.quantity ?? '').toLowerCase()
  return /\b(ml|cl|dl|l|fl\s?oz)\b/.test(unit) || /\d\s*(ml|cl|dl|l)\b/.test(unit)
}

export function nutrientsFromOff(n: OffProduct['nutriments'] = {}): Nutrients {
  const g = (k: string) => num(n[`${k}_100g`])
  const out = emptyNutrients()
  const kj = g('energy-kj') ?? (n.energy_unit === 'kcal' ? null : g('energy'))
  out.kcal = within(g('energy-kcal') ?? (kj != null ? kj / 4.184 : null), 900)
  out.proteinG = within(g('proteins'), 100)
  out.carbsG = within(g('carbohydrates'), 100)
  out.fatG = within(g('fat'), 100)
  out.fiberG = within(g('fiber'), 100)
  out.sugarG = within(g('sugars'), 100)
  out.satFatG = within(g('saturated-fat'), 100)
  // Salt is what EU labels print and is entered more reliably than sodium. 1 g salt = 400 mg sodium.
  const salt = g('salt')
  const sodium = g('sodium')
  out.sodiumMg = within(salt != null ? salt * 400 : sodium != null ? sodium * 1000 : null, 40_000)
  const caffeine = g('caffeine')
  out.caffeineMg = within(caffeine != null ? caffeine * 1000 : null, 5000)
  return out
}

/** Map a product to a food draft; null when it has no usable name. */
export function foodFromOff(p: OffProduct, code = p.code ?? ''): FoodDraft | null {
  const name = (p.product_name || p.product_name_en || '').trim()
  if (!name) return null
  const brands = Array.isArray(p.brands) ? p.brands : (p.brands ?? '').split(',')
  const brand = brands.map((b) => b.trim()).find(Boolean) ?? null
  const liquid = isLiquid(p)
  const u = liquid ? 'ml' : 'g'

  const servings: Serving[] = []
  const serving = num(p.serving_quantity)
  const pack = num(p.product_quantity)
  if (serving && serving > 0) {
    // "250ml" → "1 serving (250ml)"; an already descriptive "1 portion (330 ml)" is used as-is.
    const size = p.serving_size?.trim()
    const bare = size && /^\d+([.,]\d+)?\s*(g|ml|cl|l|oz|fl\s?oz)$/i.test(size)
    const label = !size ? `1 serving (${serving} ${u})` : bare ? `1 serving (${size})` : size
    servings.push({ label, grams: serving })
  }
  if (pack && pack > 0 && pack !== serving) servings.push({ label: `Whole pack (${pack} ${u})`, grams: pack })

  return {
    name: name.slice(0, 160),
    brand: brand && brand.toLowerCase() !== name.toLowerCase() ? brand : null,
    barcode: code || null,
    basis: liquid ? '100ml' : '100g',
    ...nutrientsFromOff(p.nutriments),
    servings,
    ingredients: null,
    source: 'off',
    sourceId: code || null,
  }
}
