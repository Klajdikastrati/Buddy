import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { dailySeries, trends, type DayRow } from './series'
import { confidence95, correlations, MIN_N, pearson, strengthOf, weekdayWeekend } from './signals'
import type { DayCheckin, Entry } from './types'

const entry = (localDate: string, extra: Partial<Entry>): Entry => ({
  id: Math.random().toString(36).slice(2),
  kind: 'note',
  occurredAt: `${localDate}T09:00:00.000Z`,
  localDate,
  itemId: null,
  title: 'x',
  note: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...extra,
})
const money = (d: string, amount: number) => entry(d, { kind: 'expense', money: { direction: 'out', amount, currency: 'ALL', categoryId: null } })
const sleep = (d: string, min: number) => entry(d, { kind: 'sleep', sleep: { bedAt: null, wakeAt: null, durationMin: min, quality: null } })
const checkin = (d: string, energy: number | null, mood: number | null = null): DayCheckin => ({ localDate: d, mood, energy, stress: null, productivity: null, note: null, createdAt: '', updatedAt: '' })

describe('daily series', () => {
  it('keeps "not logged" as null and "nothing spent" as 0 once money tracking started', () => {
    const rows = dailySeries({
      entries: [money('2026-10-02', 500), sleep('2026-10-03', 420), entry('2026-10-03', { kind: 'food', nutrition: { foodId: null, grams: 100, servingLabel: null, kcal: 300, proteinG: null, carbsG: 10, fatG: 5, fiberG: null, sugarG: null, satFatG: null, sodiumMg: null, caffeineMg: null } })],
      sets: [],
      checkins: [checkin('2026-10-03', 4)],
      from: '2026-10-01',
      to: '2026-10-03',
      moneySince: '2026-10-02',
    })
    expect(rows.map((r) => r.spend)).toEqual([null, 500, 0])
    expect(rows.map((r) => r.sleepMin)).toEqual([null, null, 420])
    expect(rows[2]).toMatchObject({ kcal: 300, proteinG: null, foodEntries: 1, foodIncomplete: 1, energy: 4, logged: true })
    expect(rows[0].logged).toBe(false)
  })

  it('compares the last 30 days with the 30 before, averaging only logged days', () => {
    const entries: Entry[] = []
    for (let i = 0; i < 60; i++) {
      const d = addDays('2026-08-05', i)
      if (i % 2 === 0) entries.push(sleep(d, i < 30 ? 400 : 460))
    }
    const rows = dailySeries({ entries, sets: [], checkins: [], from: '2026-08-05', to: '2026-10-03', moneySince: null })
    const t = trends(rows, '2026-10-03').find((x) => x.key === 'sleepMin')!
    expect(t).toMatchObject({ current: 460, previous: 400, nCurrent: 15, nPrevious: 15 })
    expect(trends(rows, '2026-10-03').find((x) => x.key === 'spend')!.current).toBeNull()
  })
})

describe('signals', () => {
  it('computes Pearson r and its confidence interval', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull() // no variance
    const [lo, hi] = confidence95(0.5, 30)!
    expect(lo).toBeCloseTo(0.17, 2)
    expect(hi).toBeCloseTo(0.73, 2)
    expect(strengthOf(-0.35)).toBe('moderate')
  })

  const days = (n: number, f: (i: number, d: string) => Partial<DayRow>): DayRow[] =>
    Array.from({ length: n }, (_, i) => {
      const date = addDays('2026-09-01', i)
      return { date, spend: null, income: null, kcal: null, proteinG: null, caffeineMg: null, foodEntries: 0, foodIncomplete: 0, sleepMin: null, sleepQuality: null, weightKg: null, activityMin: null, km: null, steps: null, workouts: 0, volumeKg: 0, mood: null, energy: null, stress: null, productivity: null, trackers: {}, logged: true, ...f(i, date) }
    })

  it('needs at least 14 paired days before a signal is shown', () => {
    const few = correlations(days(MIN_N - 1, (i) => ({ sleepMin: 360 + i * 10, energy: 1 + (i % 5) })))
    expect(few.find((s) => s.id === 'sleep-energy')).toMatchObject({ n: 13, ready: false, ci95: null })
    const enough = correlations(days(20, (i) => ({ sleepMin: 360 + i * 10, energy: Math.min(5, 1 + Math.floor(i / 4)) })))
    const s = enough.find((x) => x.id === 'sleep-energy')!
    expect(s.ready).toBe(true)
    expect(s.r!).toBeGreaterThan(0.9)
    expect(s.strength).toBe('strong')
  })

  it('pairs caffeine with the next night’s sleep', () => {
    // More caffeine on day i → less sleep on day i+1.
    const rows = days(16, (i) => ({ caffeineMg: (i % 4) * 80, sleepMin: i === 0 ? 480 : 480 - (((i - 1) % 4) * 80) / 2 }))
    const s = correlations(rows).find((x) => x.id === 'caffeine-sleep')!
    expect(s.n).toBe(15) // the last day has no next night
    expect(s.r).toBeCloseTo(-1, 5)
  })

  it('splits weekdays and weekends', () => {
    const rows = days(28, (_, d) => ({ spend: [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) ? 3000 : 1000 }))
    const spend = weekdayWeekend(rows).find((x) => x.metric === 'spend')!
    expect(spend).toMatchObject({ weekday: 1000, weekend: 3000, nWeekday: 20, nWeekend: 8, ready: true })
  })
})

describe('signal wording', () => {
  it('describes direction without claiming a cause', async () => {
    const { describeSignal } = await import('./signals')
    const base = { id: 'x', x: 'sleepMin', y: 'energy', lag: 0, xLabel: 'Sleep', yLabel: 'energy the same day', xMore: 'More sleep', ci95: null } as const
    expect(describeSignal({ ...base, n: 20, r: 0.42, strength: 'moderate', ready: true })).toBe('More sleep: energy the same day tended to be higher')
    expect(describeSignal({ ...base, n: 20, r: 0.05, strength: 'none', ready: true })).toBe('No clear link between sleep and energy the same day')
    expect(describeSignal({ ...base, n: 5, r: 0.9, strength: 'strong', ready: false })).toBe('Sleep ↔ energy the same day: 5 of 14 days so far')
  })
})
