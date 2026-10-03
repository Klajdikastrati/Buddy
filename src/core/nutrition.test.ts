import { describe, expect, it } from 'vitest'
import { emptyNutrients, nutritionOn, recipePer100, scaleNutrients, searchFoods, sumNutrients } from './nutrition'
import { foodFromOff } from './off'
import { targetHistory, targetOn } from './targets'
import type { Entry, Food, Nutrients, Target } from './types'

const n = (v: Partial<Nutrients>): Nutrients => ({ ...emptyNutrients(), ...v })

describe('nutrition math', () => {
  it('scales per-100 values to a portion and keeps unknowns unknown', () => {
    const redBull = n({ kcal: 46, carbsG: 11, sugarG: 11, caffeineMg: 32, proteinG: 0 })
    const can = scaleNutrients(redBull, 250)
    expect(can).toMatchObject({ kcal: 115, carbsG: 27.5, caffeineMg: 80, proteinG: 0, fiberG: null })
  })

  it('sums rows, counting unknowns instead of treating them as zero', () => {
    const s = sumNutrients([n({ kcal: 100, proteinG: 10 }), n({ kcal: 250, proteinG: null }), n({ kcal: 0.1 })])
    expect(s.totals.kcal).toBe(350.1)
    expect(s.totals.proteinG).toBe(10)
    expect(s.unknown.proteinG).toBe(2)
    expect(s.unknown.kcal).toBe(0)
    expect(s.totals.fiberG).toBeNull() // unknown everywhere
    expect(sumNutrients([]).totals.kcal).toBeNull()
  })

  it('computes recipes per 100 g; a nutrient unknown in any ingredient is unknown', () => {
    const food = (id: string, v: Partial<Nutrients>) => ({ id, ...n(v) }) as unknown as Food
    const foods = new Map([
      ['flour', food('flour', { kcal: 364, proteinG: 10, fiberG: 2.7 })],
      ['cheese', food('cheese', { kcal: 264, proteinG: 14, fiberG: null })],
    ])
    const per100 = recipePer100(
      [
        { foodId: 'flour', grams: 300 },
        { foodId: 'cheese', grams: 200 },
      ],
      foods,
    )
    expect(per100.kcal).toBe(324) // (1092 + 528) / 500 * 100
    expect(per100.proteinG).toBe(11.6)
    expect(per100.fiberG).toBeNull()
    expect(recipePer100([], foods).kcal).toBeNull()
  })
})

describe('targets', () => {
  const t = (key: Target['key'], value: number, effectiveFrom: string, deleted = false, updatedAt = 'a'): Target => ({
    id: `${key}${effectiveFrom}${updatedAt}`,
    key,
    value,
    unit: 'g',
    effectiveFrom,
    source: 'user',
    recommendationId: null,
    createdAt: '',
    updatedAt,
    deletedAt: deleted ? 'x' : null,
  })
  const rows = [t('protein_daily', 120, '2026-09-01'), t('protein_daily', 150, '2026-09-12'), t('kcal_daily', 2400, '2026-09-01')]

  it('uses the latest version effective on a day', () => {
    expect(targetOn(rows, 'protein_daily', '2026-09-11')).toBe(120)
    expect(targetOn(rows, 'protein_daily', '2026-09-12')).toBe(150)
    expect(targetOn(rows, 'protein_daily', '2026-08-31')).toBeNull()
    expect(targetOn(rows, 'sleep_min', '2026-09-12')).toBeNull()
  })

  it('treats a deleted latest version as removed', () => {
    expect(targetOn([...rows, t('protein_daily', 0, '2026-09-20', true)], 'protein_daily', '2026-09-21')).toBeNull()
  })

  it('lists history newest first', () => {
    expect(targetHistory(rows, 'protein_daily').map((x) => x.value)).toEqual([150, 120])
  })
})

describe('Open Food Facts mapping', () => {
  // Real response for 9002490100070 (Red Bull 250 ml), trimmed. Note sodium_100g = 40 "g" — a data-entry error.
  const redBull = {
    code: '9002490100070',
    product_name: 'Red Bull',
    brands: 'Red Bull GmbH',
    quantity: '250ml',
    product_quantity: 250,
    product_quantity_unit: 'ml',
    serving_size: '250ml',
    serving_quantity: 250,
    nutriments: {
      'energy-kcal_100g': 46,
      proteins_100g: 0,
      carbohydrates_100g: 11,
      sugars_100g: 11,
      fat_100g: 0,
      'saturated-fat_100g': 0,
      fiber_100g: 0,
      salt_100g: 0.1,
      sodium_100g: 40,
      caffeine_100g: 0.032,
    },
  }

  it('maps a liquid product per 100 ml with plausible sodium and caffeine in mg', () => {
    const f = foodFromOff(redBull)!
    expect(f).toMatchObject({ name: 'Red Bull', brand: 'Red Bull GmbH', basis: '100ml', barcode: '9002490100070', source: 'off' })
    expect(f.kcal).toBe(46)
    expect(f.sodiumMg).toBe(40) // from salt, not the bogus 40 g sodium
    expect(f.caffeineMg).toBe(32)
    expect(f.servings).toEqual([{ label: '1 serving (250ml)', grams: 250 }]) // pack = serving → listed once
  })

  it('keeps missing or impossible values unknown and converts kJ', () => {
    const f = foodFromOff({ code: '1', product_name: 'Byrek', quantity: '500 g', product_quantity: '500', nutriments: { 'energy-kj_100g': 1255, proteins_100g: 120, fat_100g: '14.5' } })!
    expect(f.basis).toBe('100g')
    expect(f.kcal).toBe(300)
    expect(f.proteinG).toBeNull() // 120 g per 100 g is impossible
    expect(f.fatG).toBe(14.5)
    expect(f.fiberG).toBeNull()
    expect(f.servings).toEqual([{ label: 'Whole pack (500 g)', grams: 500 }])
    expect(foodFromOff({ code: '2', product_name: '  ' })).toBeNull()
    expect(foodFromOff({ code: '3', product_name: 'Cola', serving_size: '1 portion (330 ml)', serving_quantity: 330 })!.servings[0].label).toBe(
      '1 portion (330 ml)',
    )
  })
})

describe('food search and day totals', () => {
  const food = (name: string, useCount: number, extra: Partial<Food> = {}) =>
    ({ id: name, name, brand: null, useCount, lastUsedAt: useCount ? '2026-10-01T00:00:00Z' : null, archived: false, deletedAt: null, ...extra }) as Food
  const foods = [food('Greek yogurt', 2), food('Yogurt drink', 9), food('Bread', 0, { brand: 'Yogurtland' }), food('Old yogurt', 50, { archived: true })]

  it('ranks prefix matches first, then frequent; ignores archived', () => {
    const now = Date.parse('2026-10-03T00:00:00Z')
    expect(searchFoods(foods, 'yog', now).map((f) => f.name)).toEqual(['Yogurt drink', 'Greek yogurt', 'Bread'])
    expect(searchFoods(foods, '', now).map((f) => f.name)).toEqual(['Yogurt drink', 'Greek yogurt'])
  })

  it('sums only the day’s food entries', () => {
    const entry = (localDate: string, kcal: number | null, deleted = false) =>
      ({ localDate, deletedAt: deleted ? 'x' : null, nutrition: { ...n({ kcal }), foodId: null, grams: 100, servingLabel: null } }) as unknown as Entry
    const day = nutritionOn([entry('2026-10-03', 200), entry('2026-10-03', null), entry('2026-10-03', 500, true), entry('2026-10-02', 900)], '2026-10-03')
    expect(day.totals.kcal).toBe(200)
    expect(day.unknown.kcal).toBe(1)
    expect(day.entries).toHaveLength(2)
  })
})

describe('built-in common foods', () => {
  it('finds foods by English or Albanian name, accents optional', async () => {
    const { searchBase } = await import('./foodbase')
    expect(searchBase('banana')[0].draft.name).toBe('Banana')
    expect(searchBase('banane')[0].draft.name).toBe('Banana')
    expect(searchBase('molle')[0].draft.name).toBe('Apple')
    expect(searchBase('kos').map((b) => b.draft.name)).toContain('Yogurt (plain)')
    expect(searchBase('byrek').length).toBe(3)
    const banana = searchBase('banana')[0].draft
    expect(banana).toMatchObject({ kcal: 89, basis: '100g', source: 'generic', sourceId: 'gen:banana' })
    expect(banana.servings[0]).toEqual({ label: '1 medium (118 g)', grams: 118 })
    expect(searchBase('espresso')[0].draft).toMatchObject({ basis: '100ml', caffeineMg: 212 })
    expect(searchBase('')).toEqual([])
  })
})
