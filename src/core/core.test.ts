import { describe, expect, it } from 'vitest'
import { addDays, daysInMonth, localDateOf } from './dates'
import { formatMoney, moneySummary, parseAmount } from './money'
import { rankItems, searchItems } from './recents'
import type { Entry, Item } from './types'

describe('localDateOf', () => {
  const tz = 'Europe/Tirane'
  it('counts early hours as the previous day', () => {
    // 01:30 Tirana (UTC+2 in summer) = 23:30 UTC the day before
    expect(localDateOf(new Date('2026-10-02T23:30:00Z'), tz, 4)).toBe('2026-10-02')
  })
  it('switches day at the rollover hour', () => {
    expect(localDateOf(new Date('2026-10-03T02:00:00Z'), tz, 4)).toBe('2026-10-03') // 04:00 local
    expect(localDateOf(new Date('2026-10-03T01:59:00Z'), tz, 4)).toBe('2026-10-02') // 03:59 local
  })
  it('handles the DST change night by wall clock', () => {
    // 2026-10-25 03:00 local (after fall-back, UTC+1) = 02:00 UTC
    expect(localDateOf(new Date('2026-10-25T02:00:00Z'), tz, 4)).toBe('2026-10-24')
    expect(localDateOf(new Date('2026-10-25T03:00:00Z'), tz, 4)).toBe('2026-10-25')
  })
})

describe('date helpers', () => {
  it('adds days across months and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('knows month lengths', () => {
    expect(daysInMonth('2026-10-03')).toBe(31)
    expect(daysInMonth('2028-02-10')).toBe(29)
  })
})

describe('money', () => {
  it('parses messy input', () => {
    expect(parseAmount('1,850')).toBe(1850)
    expect(parseAmount(' 180 ')).toBe(180)
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
  it('formats Lek without decimals', () => {
    expect(formatMoney(1850, 'ALL')).toBe('1,850 Lek')
    expect(formatMoney(3.5, 'EUR')).toBe('€3.5')
  })

  const e = (localDate: string, amount: number, direction: 'out' | 'in' = 'out', deleted = false): Entry => ({
    id: `${localDate}-${amount}`,
    kind: direction === 'out' ? 'expense' : 'income',
    occurredAt: `${localDate}T12:00:00Z`,
    localDate,
    itemId: null,
    title: 'x',
    note: null,
    money: { direction, amount, currency: 'ALL', categoryId: null },
    createdAt: '',
    updatedAt: '',
    deletedAt: deleted ? 'yes' : null,
  })

  it('summarises today, month, budget and a fair average', () => {
    const entries = [
      e('2026-10-01', 1000),
      e('2026-10-02', 2000),
      e('2026-10-03', 500),
      e('2026-10-03', 999, 'out', true), // deleted — ignored
      e('2026-10-02', 50000, 'in'),
    ]
    const s = moneySummary(entries, '2026-10-03', 31000, '2026-10-01')
    expect(s.spentToday).toBe(500)
    expect(s.spentMonth).toBe(3500)
    expect(s.incomeMonth).toBe(50000)
    expect(s.dailyAverage).toBe(1500) // 2 prior days only, not 30
    expect(s.remainingMonth).toBe(27500)
    expect(s.perDayLeft).toBeCloseTo(28000 / 29)
  })
  it('has no average on day one', () => {
    expect(moneySummary([e('2026-10-03', 10)], '2026-10-03', null, '2026-10-03').dailyAverage).toBeNull()
  })
})

describe('recents', () => {
  const now = Date.parse('2026-10-03T12:00:00Z')
  const item = (name: string, useCount: number, daysAgo: number, favorite = false): Item => ({
    id: name,
    name,
    kind: 'expense',
    useCount,
    lastUsedAt: new Date(now - daysAgo * 86_400_000).toISOString(),
    favorite,
    archived: false,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  })
  const items = [item('Red Bull', 20, 1), item('Coffee', 40, 30), item('Bread', 3, 0), item('Taxi', 1, 2, true)]

  it('ranks favourites, then frequent-and-recent', () => {
    expect(rankItems(items, now).map((i) => i.name)).toEqual(['Taxi', 'Red Bull', 'Coffee', 'Bread'])
  })
  it('searches prefix matches first', () => {
    expect(searchItems(items, 're', now).map((i) => i.name)).toEqual(['Red Bull', 'Bread'])
  })
})
