import { describe, expect, it } from 'vitest'
import { activityOn, sleepMinutes, sleepSummary, weightSummary } from './body'
import { formatDuration, weekdayOf, weekStart } from './dates'
import { entryLine } from './entries'
import type { Entry } from './types'

const base = (localDate: string, extra: Partial<Entry>): Entry => ({
  id: Math.random().toString(36),
  kind: 'note',
  occurredAt: `${localDate}T08:00:00.000Z`,
  localDate,
  itemId: null,
  title: 'x',
  note: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...extra,
})
const sleep = (d: string, min: number) =>
  base(d, { kind: 'sleep', sleep: { bedAt: null, wakeAt: null, durationMin: min, quality: null } })
const weight = (d: string, kg: number) =>
  base(d, { kind: 'weight', measurement: { metric: 'bodyweight', value: kg, unit: 'kg' } })

describe('sleep', () => {
  it('computes duration across midnight and rejects impossible ranges', () => {
    expect(sleepMinutes('2026-10-02T21:30:00Z', '2026-10-03T05:15:00Z')).toBe(465)
    expect(sleepMinutes('2026-10-03T05:15:00Z', '2026-10-02T21:30:00Z')).toBeNull()
    expect(sleepMinutes('2026-10-01T05:00:00Z', '2026-10-03T05:00:00Z')).toBeNull()
  })

  it('compares last night with the average of logged nights only', () => {
    const s = sleepSummary([sleep('2026-10-03', 400), sleep('2026-10-01', 480), sleep('2026-09-30', 420), sleep('2026-08-01', 100)], '2026-10-03')
    expect(s.today).toBe(400)
    expect(s.average).toBe(450) // 2 nights in the window; the missing night isn't a zero
    expect(sleepSummary([], '2026-10-03')).toEqual({ today: null, average: null })
  })

  it('adds a nap to the same day', () => {
    expect(sleepSummary([sleep('2026-10-03', 400), sleep('2026-10-03', 30)], '2026-10-03').today).toBe(430)
  })
})

describe('weight', () => {
  it('reports the latest reading and the change vs about a week earlier', () => {
    const w = weightSummary([weight('2026-09-20', 74), weight('2026-09-26', 73.1), weight('2026-09-29', 73), weight('2026-10-03', 72.4)])!
    expect(w.latest.value).toBe(72.4)
    expect(w.change).toBe(-0.7) // vs 26 Sep (7 days), not 29 Sep (4) or 20 Sep (13)
    expect(w.changeDays).toBe(7)
  })
  it('has no change without a reading 4–14 days earlier', () => {
    expect(weightSummary([weight('2026-10-01', 73), weight('2026-10-03', 72.4)])!.change).toBeNull()
    expect(weightSummary([])).toBeNull()
  })
})

describe('activity', () => {
  it('totals a day and keeps unrecorded measures unknown', () => {
    const a = (type: 'walk' | 'run', durationMin: number | null, distanceKm: number | null) =>
      base('2026-10-03', { kind: 'activity', activity: { type, durationMin, distanceKm, steps: null } })
    const t = activityOn([a('walk', 30, 2.5), a('run', 20, null), a('walk', null, 1.25)], '2026-10-03')
    expect(t).toMatchObject({ count: 3, minutes: 50, km: 3.75, steps: null, types: ['walk', 'run'] })
  })
})

describe('formatting', () => {
  it('formats durations and weeks', () => {
    expect(formatDuration(452)).toBe('7h 32m')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(-65)).toBe('1h 05m')
    expect(weekdayOf('2026-10-03')).toBe(6) // Saturday
    expect(weekStart('2026-10-03')).toBe('2026-09-28')
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
    expect(weekStart('2026-10-04')).toBe('2026-09-28') // Sunday belongs to the week before
  })

  it('describes each kind of entry for list rows', () => {
    const tz = 'Europe/Tirane'
    const s = base('2026-10-03', { sleep: { bedAt: '2026-10-02T21:30:00Z', wakeAt: '2026-10-03T05:15:00Z', durationMin: 465, quality: 4 } })
    expect(entryLine(s, tz)).toEqual({ detail: ['23:30–07:15', 'quality 4/5'], side: '7h 45m', positive: false })
    const food = base('2026-10-03', {
      nutrition: { foodId: null, grams: 250, servingLabel: '1 can', kcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, sugarG: null, satFatG: null, sodiumMg: null, caffeineMg: null },
      money: { direction: 'out', amount: 180, currency: 'ALL', categoryId: null },
    })
    expect(entryLine(food, tz)).toEqual({ detail: ['1 can', '180 Lek'], side: 'kcal ?', positive: false })
    expect(entryLine(weight('2026-10-03', 72.4), tz).side).toBe('72.4 kg')
  })
})
