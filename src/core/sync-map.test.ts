import { describe, expect, it } from 'vitest'
import { entryFromServer, entryToServer, itemFromServer, itemToServer, remoteWins } from './sync-map'
import type { Entry, Item } from './types'

const entry: Entry = {
  id: 'e1',
  kind: 'expense',
  occurredAt: '2026-10-03T09:19:00.000Z',
  localDate: '2026-10-03',
  itemId: 'i1',
  title: 'Red Bull',
  note: null,
  money: { direction: 'out', amount: 180, currency: 'ALL', categoryId: 'c1' },
  createdAt: '2026-10-03T09:19:00.000Z',
  updatedAt: '2026-10-03T09:19:00.000Z',
  deletedAt: null,
}

describe('sync mapping', () => {
  it('round-trips an entry through the server shape (facet as a separate row)', () => {
    const { entry: row, money } = entryToServer(entry)
    expect(money).toMatchObject({ entry_id: 'e1', amount: 180, direction: 'out' })
    // Postgres hands back numerics as strings, char(3) padded, +00:00 offsets.
    const back = entryFromServer({
      ...row,
      occurred_at: '2026-10-03T09:19:00+00:00',
      entry_money: { ...money, amount: '180.00', currency: 'ALL' },
    })
    expect(back).toEqual(entry)
  })

  it('keeps unknown item amounts unknown', () => {
    const item: Item = {
      id: 'i1', name: 'Salary', kind: 'income', useCount: 1, lastUsedAt: null,
      favorite: false, archived: false, createdAt: entry.createdAt, updatedAt: entry.updatedAt, deletedAt: null,
    }
    expect(itemToServer(item).default_amount).toBeNull()
    expect(itemFromServer(itemToServer(item)).money).toBeUndefined()
  })

  it('lets the newer edit win', () => {
    expect(remoteWins(undefined, '2026-10-03T10:00:00Z')).toBe(true)
    expect(remoteWins('2026-10-03T11:00:00Z', '2026-10-03T10:00:00+00:00')).toBe(false)
    expect(remoteWins('2026-10-03T10:00:00Z', '2026-10-03T12:00:00+02:00')).toBe(true) // same instant
  })
})
