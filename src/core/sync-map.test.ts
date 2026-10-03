import { describe, expect, it } from 'vitest'
import { entryFromServer, entryToServer, itemFromServer, itemToServer, remoteWins, SPECS } from './sync-map'
import type { DayCheckin, Entry, Item } from './types'

const entry: Entry = {
  id: 'e1',
  kind: 'food',
  occurredAt: '2026-10-03T09:19:00.000Z',
  localDate: '2026-10-03',
  itemId: 'i1',
  title: 'Red Bull',
  note: null,
  money: { direction: 'out', amount: 180, currency: 'ALL', categoryId: 'c1' },
  nutrition: {
    foodId: 'f1',
    grams: 250,
    servingLabel: '1 can',
    kcal: 115,
    proteinG: 0,
    carbsG: 27,
    fatG: 0,
    fiberG: null,
    sugarG: 27,
    satFatG: null,
    sodiumMg: 100,
    caffeineMg: 80,
  },
  createdAt: '2026-10-03T09:19:00.000Z',
  updatedAt: '2026-10-03T09:19:00.000Z',
  deletedAt: null,
}

describe('sync mapping', () => {
  it('splits one entry into an entries row plus one row per facet', () => {
    const { entry: row, facets } = entryToServer(entry)
    expect(row).not.toHaveProperty('money')
    expect(row).toMatchObject({ id: 'e1', local_date: '2026-10-03', item_id: 'i1' })
    expect(facets.entry_money).toMatchObject({ entry_id: 'e1', amount: 180, category_id: 'c1' })
    expect(facets.entry_nutrition).toMatchObject({ entry_id: 'e1', caffeine_mg: 80, fiber_g: null })
    expect(facets.entry_sleep).toBeNull()
  })

  it('round-trips through the server shape, keeping unknown nutrients unknown', () => {
    const { entry: row, facets } = entryToServer(entry)
    // Postgres hands back numerics as strings, char(3) padded, +00:00 offsets.
    const back = entryFromServer({
      ...row,
      occurred_at: '2026-10-03T09:19:00+00:00',
      entry_money: { ...facets.entry_money, amount: '180.00', currency: 'ALL', user_id: 'u' },
      entry_nutrition: [{ ...facets.entry_nutrition, kcal: '115.00', fiber_g: null }],
      entry_sleep: null,
    })
    expect(back).toEqual(entry)
    expect(back.nutrition?.fiberG).toBeNull()
  })

  it('keeps unknown item amounts unknown', () => {
    const item: Item = {
      id: 'i1', name: 'Salary', kind: 'income', useCount: 1, lastUsedAt: null,
      favorite: false, archived: false, createdAt: entry.createdAt, updatedAt: entry.updatedAt, deletedAt: null,
    }
    expect(itemToServer(item).default_amount).toBeNull()
    const back = itemFromServer(itemToServer(item))
    expect(back.money).toBeUndefined()
    expect(back.food).toBeUndefined()
  })

  it('maps day check-ins by date (no id column)', () => {
    const c: DayCheckin = {
      localDate: '2026-10-03', mood: 4, energy: 3, stress: null, productivity: null, note: null,
      createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    }
    const row = SPECS.checkins.toServer(c)
    expect(row).toMatchObject({ local_date: '2026-10-03', mood: 4 })
    expect(SPECS.checkins.fromServer({ ...row, user_id: 'u', server_updated_at: 'x' })).toEqual(c)
  })

  it('lets the newer edit win', () => {
    expect(remoteWins(undefined, '2026-10-03T10:00:00Z')).toBe(true)
    expect(remoteWins('2026-10-03T11:00:00Z', '2026-10-03T10:00:00+00:00')).toBe(false)
    expect(remoteWins('2026-10-03T10:00:00Z', '2026-10-03T12:00:00+02:00')).toBe(true) // same instant
  })
})
