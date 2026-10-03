import { describe, expect, it } from 'vitest'
import { buildExport, type ExportInput } from './export'
import type { Entry, Food, Recommendation, Target, WorkoutSet } from './types'

const e = (id: string, localDate: string, extra: Partial<Entry>): Entry => ({
  id,
  kind: 'note',
  occurredAt: `${localDate}T10:00:00.000Z`,
  localDate,
  itemId: null,
  title: id,
  note: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...extra,
})
const target = (key: Target['key'], value: number, effectiveFrom: string, extra: Partial<Target> = {}): Target => ({
  id: `${key}-${effectiveFrom}`,
  key,
  value,
  unit: key === 'protein_daily' ? 'g' : 'kcal',
  effectiveFrom,
  source: 'user',
  recommendationId: null,
  createdAt: '',
  updatedAt: effectiveFrom,
  deletedAt: null,
  ...extra,
})
const set = (id: string, setIndex: number, done: boolean, deleted = false): WorkoutSet => ({
  id,
  entryId: 'push',
  exerciseId: 'bench',
  exerciseOrder: 0,
  setIndex,
  reps: 8,
  weightKg: 60,
  isWarmup: false,
  doneAt: done ? 'x' : null,
  createdAt: '',
  updatedAt: '',
  deletedAt: deleted ? 'x' : null,
})

const byrekFood = {
  id: 'f1',
  name: 'Byrek',
  brand: null,
  barcode: null,
  basis: '100g',
  kcal: 300,
  proteinG: 8,
  carbsG: null,
  fatG: 18,
  fiberG: null,
  sugarG: null,
  satFatG: null,
  sodiumMg: null,
  caffeineMg: null,
  servings: [],
  ingredients: null,
  source: 'custom',
  sourceId: null,
  favorite: false,
  useCount: 1,
  lastUsedAt: null,
  archived: false,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
} satisfies Food

const input: ExportInput = {
  exportId: 'exp-1',
  generatedAt: '2026-10-03T20:00:00.000Z',
  from: '2026-10-01',
  to: '2026-10-03',
  settings: { currency: 'ALL', timezone: 'Europe/Tirane', rolloverHour: 4 },
  targets: [
    target('protein_daily', 120, '2026-09-01'),
    target('protein_daily', 150, '2026-10-02', { source: 'analyst', recommendationId: 'rec-1' }),
    target('kcal_daily', 2400, '2026-10-05'), // after the period — not current at `to`
  ],
  entries: [
    e('old', '2026-09-20', { kind: 'expense', money: { direction: 'out', amount: 999, currency: 'ALL', categoryId: null } }),
    e('lunch', '2026-10-01', { kind: 'expense', money: { direction: 'out', amount: 900, currency: 'ALL', categoryId: null } }),
    e('gone', '2026-10-01', { deletedAt: 'x', kind: 'expense', money: { direction: 'out', amount: 5, currency: 'ALL', categoryId: null } }),
    e('byrek', '2026-10-02', {
      kind: 'food',
      nutrition: { foodId: 'f1', grams: 150, servingLabel: '1 piece', kcal: 450, proteinG: 12, carbsG: null, fatG: 27, fiberG: null, sugarG: null, satFatG: null, sodiumMg: null, caffeineMg: null },
    }),
    e('push', '2026-10-03', { kind: 'workout', title: 'Push Day', workout: { templateId: 't1', startedAt: '2026-10-03T08:00:00.000Z', endedAt: '2026-10-03T08:50:00.000Z' } }),
  ],
  sets: [set('s1', 0, true), set('s2', 1, false, true)],
  foods: [byrekFood],
  exercises: [{ id: 'bench', name: 'Bench Press', muscle: 'Chest', archived: false, createdAt: '', updatedAt: '', deletedAt: null }],
  templates: [{ id: 't1', name: 'Push Day', exercises: [], weekdays: [6], archived: false, createdAt: '', updatedAt: '', deletedAt: null }],
  checkins: [{ localDate: '2026-10-03', mood: 4, energy: 3, stress: null, productivity: null, note: 'ok', createdAt: '', updatedAt: '' }],
  trackers: [],
  recommendations: [
    {
      id: 'rec-1',
      runId: 'r',
      type: 'target',
      targetKey: 'protein_daily',
      currentValue: 120,
      suggestedValue: 150,
      unit: 'g',
      reason: 'More training',
      confidence: 'medium',
      status: 'accepted',
      decidedAt: '2026-10-02T09:00:00.000Z',
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
    } satisfies Recommendation,
  ],
  moneySince: '2026-09-20',
}

describe('buddy-export v1', () => {
  const x = buildExport(input)

  it('covers exactly the period and skips deleted rows', () => {
    expect(x.export_version).toBe('1')
    expect(x.period).toEqual({ from: '2026-10-01', to: '2026-10-03', days: 3 })
    expect(x.entries.map((r) => r.id)).toEqual(['lunch', 'byrek', 'push'])
    expect(x.daily.map((r) => r.spend)).toEqual([900, 0, 0]) // money tracked since before the period
    expect(x.daily.map((r) => r.kcal)).toEqual([null, 450, null]) // not logged ≠ 0
  })

  it('exports targets as of the end of the period, with bounds and provenance', () => {
    expect(x.targets.current).toEqual({ protein_daily: { value: 150, unit: 'g', effective_from: '2026-10-02', source: 'analyst' } })
    expect(x.targets.proposal_bounds.kcal_daily).toEqual({ min: 1200, max: 5000, unit: 'kcal' })
    expect(x.targets.proposal_bounds.budget_month.unit).toBe('ALL')
    expect(x.interventions).toEqual([
      {
        recommendation_id: 'rec-1',
        target_key: 'protein_daily',
        from_value: 120,
        to_value: 150,
        unit: 'g',
        effective_from: '2026-10-02',
        decided_at: '2026-10-02T09:00:00.000Z',
        reason: 'More training',
      },
    ])
  })

  it('includes workouts with done sets, foods used and check-ins', () => {
    expect(x.workouts).toEqual([
      {
        id: 'push',
        date: '2026-10-03',
        title: 'Push Day',
        template: 'Push Day',
        started_at: '2026-10-03T08:00:00.000Z',
        ended_at: '2026-10-03T08:50:00.000Z',
        duration_min: 50,
        volume_kg: 480,
        sets: [{ exercise: 'Bench Press', set_index: 0, reps: 8, weight_kg: 60, warmup: false }],
      },
    ])
    expect(x.foods_used.map((f) => f.name)).toEqual(['Byrek'])
    expect(x.foods_used[0].per_100).toMatchObject({ kcal: 300, carbs_g: null })
    expect(x.checkins).toEqual([{ date: '2026-10-03', mood: 4, energy: 3, stress: null, productivity: null, note: 'ok' }])
  })

  it('reports data quality honestly', () => {
    expect(x.data_quality).toMatchObject({
      days_in_period: 3,
      days_with_any_log: 3,
      days_missing: { sleep: 3, food: 2, checkin: 2, weight: 3, money: 0 },
      nutrition: { entries: 1, entries_missing_kcal_or_macros: 1 },
    })
    expect(x.data_quality.nutrition.unknown_by_nutrient).toMatchObject({ kcal: 0, carbs_g: 1, caffeine_mg: 1 })
  })

  it('carries signals with their sample size and the import contract', () => {
    expect(x.signals.min_n).toBe(14)
    expect(x.signals.correlations.find((s) => s.id === 'sleep-energy')).toMatchObject({ n: 0, ready: false, r: null })
    expect(x.analysis_contract).toMatchObject({ file: 'buddy-analysis.json', schema_version: '1', proposed_change_types: ['target'] })
    expect(JSON.parse(JSON.stringify(x))).toEqual(x) // plain JSON, nothing lost
  })
})
