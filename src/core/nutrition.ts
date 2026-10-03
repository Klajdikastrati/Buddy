import { frecency, normalizeName } from './recents'
import { NUTRIENT_KEYS, type Entry, type Food, type ID, type LocalDate, type Nutrients, type Synced } from './types'

/** What a food editor or an Open Food Facts lookup provides. */
export type FoodDraft = Omit<Food, keyof Synced | 'favorite' | 'useCount' | 'lastUsedAt' | 'archived'>

/** "g" or "ml" — what amounts of this food are measured in. */
export const unitOf = (f: Pick<Food, 'basis'>) => (f.basis === '100ml' ? 'ml' : 'g')

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

/** Local food search: name or brand contains the query; prefix matches, then most used. */
export function searchFoods(foods: Food[], query: string, now: number, limit = 20): Food[] {
  const q = normalizeName(query)
  const live = foods.filter((f) => !f.deletedAt && !f.archived)
  if (!q) return live.filter((f) => f.useCount > 0).sort((a, b) => frecency(b, now) - frecency(a, now)).slice(0, limit)
  return live
    .filter((f) => normalizeName(`${f.name} ${f.brand ?? ''}`).includes(q))
    .sort((a, b) => {
      const pa = normalizeName(a.name).startsWith(q) ? 1 : 0
      const pb = normalizeName(b.name).startsWith(q) ? 1 : 0
      return pb - pa || frecency(b, now) - frecency(a, now) || a.name.localeCompare(b.name)
    })
    .slice(0, limit)
}

export interface DayNutrition extends NutrientTotals {
  entries: Entry[]
}

/** Everything eaten on a day (entries with a nutrition facet). */
export function nutritionOn(entries: Entry[], day: LocalDate): DayNutrition {
  const eaten = entries.filter((e) => !e.deletedAt && e.localDate === day && e.nutrition)
  return { ...sumNutrients(eaten.map((e) => e.nutrition!)), entries: eaten }
}

/** Per-100 values recovered from a logged snapshot (for editing an entry whose food is gone). */
export function per100FromSnapshot(n: Nutrients & { grams: number | null }): Nutrients {
  const out = emptyNutrients()
  if (!n.grams) return out
  for (const k of NUTRIENT_KEYS) out[k] = n[k] == null ? null : round1((n[k]! * 100) / n.grams)
  return out
}
