import { describe, expect, it } from 'vitest'
import { counterStats, formatGap } from './counter'
import type { Entry, TrackerDef } from './types'

const def: TrackerDef = {
  id: 'cig',
  name: 'Cigarettes',
  fields: [{ key: 'count', label: 'Cigarettes', type: 'count', unit: null }],
  archived: false,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
}
const tap = (iso: string, localDate: string, deleted = false): Entry => ({
  id: iso,
  kind: 'custom',
  occurredAt: iso,
  localDate,
  itemId: null,
  title: 'Cigarettes',
  note: null,
  custom: { trackerId: 'cig', values: { count: 1 } },
  createdAt: '',
  updatedAt: '',
  deletedAt: deleted ? iso : null,
})

describe('tap counter', () => {
  const entries = [
    tap('2026-10-03T20:00:00Z', '2026-10-03'),
    tap('2026-10-04T07:00:00Z', '2026-10-04'), // 11h gap overnight
    tap('2026-10-04T09:00:00Z', '2026-10-04'),
    tap('2026-10-04T09:30:00Z', '2026-10-04', true), // undone
    tap('2026-10-04T10:00:00Z', '2026-10-04'),
  ]

  it('counts today and yesterday, ignoring undone taps', () => {
    const s = counterStats(entries, def, '2026-10-04', '2026-10-03', Date.parse('2026-10-04T11:15:00Z'))
    expect(s).toMatchObject({ today: 3, yesterday: 1, lastAt: '2026-10-04T10:00:00Z', sinceLastMin: 75, longestMin: 660 })
  })

  it('counts the current stretch as the longest once it beats the record', () => {
    const s = counterStats(entries, def, '2026-10-05', '2026-10-04', Date.parse('2026-10-05T00:00:00Z'))
    expect(s.longestMin).toBe(14 * 60)
  })

  it('has no times before the first tap', () => {
    expect(counterStats([], def, '2026-10-04', '2026-10-03', 0)).toMatchObject({ today: 0, lastAt: null, sinceLastMin: null, longestMin: null })
  })

  it('formats gaps', () => {
    expect([0, 42, 125, 3000].map(formatGap)).toEqual(['just now', '42m', '2h 5m', '2d 2h'])
  })
})
