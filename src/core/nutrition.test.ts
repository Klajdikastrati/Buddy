import { describe, expect, it } from 'vitest'
import { emptyNutrients, recipePer100, scaleNutrients, sumNutrients } from './nutrition'
import { targetHistory, targetOn } from './targets'
import type { Food, Nutrients, Target } from './types'

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
