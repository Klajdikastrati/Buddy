import { describe, expect, it } from 'vitest'
import { consistency, countOn, doneOn, habitDetail, habitsForDay, habitsOn, nextCount, withCount } from './habits'
import type { PlanItem } from './types'

const habit = (title: string, extra: Partial<PlanItem> = {}): PlanItem => ({
  id: title,
  kind: 'routine',
  title,
  localDate: null,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  doneDates: [],
  timesPerDay: 1,
  partOfDay: 'anytime',
  cue: null,
  doneAt: null,
  archived: false,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '',
  deletedAt: null,
  ...extra,
})

describe('habits', () => {
  it('lists today’s habits morning → evening → any time', () => {
    const items = [
      habit('Floss', { partOfDay: 'evening' }),
      habit('Teeth', { partOfDay: 'anytime' }),
      habit('Bed', { partOfDay: 'morning' }),
      habit('Gym', { weekdays: [1] }), // Mondays only — 2026-10-04 is a Sunday
      { ...habit('Task'), kind: 'task' as const },
    ]
    expect(habitsOn(items, '2026-10-04').map((h) => h.title)).toEqual(['Bed', 'Floss', 'Teeth'])
  })

  it('counts up to times per day, then a tap clears the day', () => {
    let h = habit('Teeth', { timesPerDay: 2 })
    const day = '2026-10-04'
    for (const expected of [1, 2, 0]) {
      const n = nextCount(h, day)
      expect(n).toBe(expected)
      h = { ...h, doneDates: withCount(h, day, n) }
    }
    h = { ...h, doneDates: withCount(h, day, 2) }
    expect([countOn(h, day), doneOn(h, day)]).toEqual([2, true])
  })

  it('reports consistency as evidence, without counting an untouched today', () => {
    const h = habit('Bed', {
      weekdays: [1, 2, 3, 4, 5], // Mon–Fri
      createdAt: '2026-09-28T08:00:00.000Z', // a Monday
      doneDates: ['2026-09-28', '2026-09-29', '2026-10-01'],
    })
    const c = consistency(h, '2026-10-05', 9) // Sun 27 Sep … Mon 5 Oct
    expect(c.days.map((d) => d.state)).toEqual(['before', 'done', 'done', 'missed', 'done', 'missed', 'off', 'off', 'today'])
    expect([c.done, c.scheduled]).toEqual([3, 5])
  })

  it('a partial day is not done', () => {
    const h = habit('Teeth', { timesPerDay: 2, doneDates: ['2026-10-03'] })
    expect(consistency(h, '2026-10-04', 2).days.map((d) => d.state)).toEqual(['partial', 'today'])
  })

  it('describes the habit', () => {
    expect(habitDetail(habit('Teeth', { timesPerDay: 2, partOfDay: 'evening', cue: 'dinner' }))).toBe('2× a day · Evening · after dinner')
    expect(habitDetail(habit('Bed'))).toBe('')
  })

  it('keeps each past day’s record — scheduled then, or ticked anyway', () => {
    const items = [
      habit('Teeth', { timesPerDay: 2, doneDates: ['2026-04-04', '2026-04-04'], createdAt: '2026-04-01T08:00:00.000Z' }),
      habit('Floss', { createdAt: '2026-05-01T08:00:00.000Z' }), // didn't exist yet on 4 Apr
      habit('Gym', { weekdays: [1], doneDates: ['2026-04-04'], createdAt: '2026-04-01T08:00:00.000Z' }), // a Saturday — off day, ticked anyway
      habit('Old', { deletedAt: '2026-05-01T00:00:00.000Z', doneDates: ['2026-04-04'] }),
    ]
    expect(habitsForDay(items, '2026-04-04').map((r) => `${r.habit.title} ${r.count}/${r.times}`)).toEqual(['Teeth 2/2', 'Gym 1/1'])
  })
})
