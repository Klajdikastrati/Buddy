import { describe, expect, it } from 'vitest'
import { isDoneOn, planFor, priorities } from './plan'
import type { PlanItem } from './types'

let n = 0
const item = (kind: PlanItem['kind'], title: string, extra: Partial<PlanItem> = {}): PlanItem => ({
  id: title,
  kind,
  title,
  localDate: null,
  weekdays: [],
  doneDates: [],
  timesPerDay: 1,
  partOfDay: 'anytime',
  cue: null,
  doneAt: null,
  archived: false,
  createdAt: `2026-10-01T00:00:${String(n++).padStart(2, '0')}Z`,
  updatedAt: '',
  deletedAt: null,
  ...extra,
})

const today = '2026-10-03' // Saturday
const items = [
  item('task', 'Call bank', { localDate: today }),
  item('task', 'Pay rent', { localDate: '2026-10-01' }),
  item('task', 'Old done', { localDate: '2026-10-01', doneAt: 'x' }),
  item('task', 'Buy gift', { localDate: '2026-10-05' }),
  item('task', 'Learn Italian'),
  item('task', 'Done today', { localDate: today, doneAt: 'x' }),
  item('task', 'Deleted', { localDate: today, deletedAt: 'x' }),
  item('routine', 'Stretch', { weekdays: [6, 0], doneDates: [today] }),
  item('routine', 'Weekday walk', { weekdays: [1, 2, 3, 4, 5] }),
  item('goal', 'Run 15 km', { localDate: '2026-09-28' }),
  item('goal', 'Last week', { localDate: '2026-09-21' }),
]

describe('plan', () => {
  it('groups a day: today, carried-over, routines, week goals, later', () => {
    const p = planFor(items, today)
    expect(p.today.map((i) => i.title)).toEqual(['Call bank', 'Done today'])
    expect(p.overdue.map((i) => i.title)).toEqual(['Pay rent'])
    expect(p.routines.map((i) => i.title)).toEqual(['Stretch'])
    expect(p.goals.map((i) => i.title)).toEqual(['Run 15 km'])
    expect(p.upcoming.map((i) => i.title)).toEqual(['Buy gift'])
    expect(p.someday.map((i) => i.title)).toEqual(['Learn Italian'])
  })

  it('gives Today up to three open priorities, overdue first', () => {
    expect(priorities(items, today)).toEqual({ shown: [items[1], items[0]], more: 0 })
    const many = [...items, item('task', 'A', { localDate: today }), item('task', 'B', { localDate: today })]
    expect(priorities(many, today).shown.map((i) => i.title)).toEqual(['Pay rent', 'Call bank', 'A'])
    expect(priorities(many, today).more).toBe(1)
  })

  it('knows when routines and tasks are done', () => {
    expect(isDoneOn(items[7], today)).toBe(true)
    expect(isDoneOn(items[7], '2026-10-04')).toBe(false)
    expect(isDoneOn(items[5], today)).toBe(true)
  })
})
