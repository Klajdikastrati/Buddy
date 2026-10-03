import { NUTRIENT_KEYS, type Food, type ID, type Nutrients } from './types'

export const emptyNutrients = (): Nutrients =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) as unknown as Nutrients

const round1 = (n: number) => Math.round(n * 10) / 10

/** Nutrients for `grams` of something given per 100 g/ml. Unknown stays unknown. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const out = emptyNutrients()
  for (const k of NUTRIENT_KEYS) {
    const v = per100[k]
    out[k] = v == null ? null : round1((v * grams) / 100)
  }
  return out
}

export interface NutrientTotals {
  totals: Nutrients
  /** Per nutrient: how many of the summed rows had it unknown. */
  unknown: Record<keyof Nutrients, number>
  count: number
}

/**
 * Sums rows. A nutrient is `null` only when every row has it unknown; when
 * some rows are unknown the total is a lower bound and `unknown[k] > 0`.
 */
export function sumNutrients(rows: Nutrients[]): NutrientTotals {
  const totals = emptyNutrients()
  const unknown = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<keyof Nutrients, number>
  for (const r of rows) {
    for (const k of NUTRIENT_KEYS) {
      const v = r[k]
      if (v == null) unknown[k]++
      else totals[k] = round1((totals[k] ?? 0) + v)
    }
  }
  return { totals, unknown, count: rows.length }
}

/**
 * Per-100 g nutrients of a recipe from its ingredients. A nutrient is known
 * only if it is known for every ingredient — a partial sum would understate it.
 */
export function recipePer100(ingredients: { foodId: ID; grams: number }[], foods: Map<ID, Food>): Nutrients {
  const total = ingredients.reduce((t, i) => t + i.grams, 0)
  const out = emptyNutrients()
  if (total <= 0) return out
  for (const k of NUTRIENT_KEYS) {
    let sum = 0
    let known = true
    for (const ing of ingredients) {
      const v = foods.get(ing.foodId)?.[k]
      if (v == null) {
        known = false
        break
      }
      sum += (v * ing.grams) / 100
    }
    out[k] = known ? round1((sum / total) * 100) : null
  }
  return out
}

export const recipeGrams = (ingredients: { grams: number }[]) => ingredients.reduce((t, i) => t + i.grams, 0)
