import { describe, expect, it } from 'vitest'
import { forecast } from './forecast'
import type { Entry, MoneyPlan } from './types'

const plan = (kind: MoneyPlan['kind'], name: string, amount: number, extra: Partial<MoneyPlan> = {}): MoneyPlan => ({
  id: name,
  kind,
  name,
  amount,
  dayOfMonth: null,
  date: null,
  categoryId: null,
  archived: false,
  createdAt: '',
  updatedAt: '2026-10-04T08:00:00.000Z',
  deletedAt: null,
  ...extra,
})
const spend = (localDate: string, title: string, amount: number, time = '12:00:00', direction: 'out' | 'in' = 'out'): Entry => ({
  id: `${localDate}-${title}-${time}`,
  kind: direction === 'out' ? 'expense' : 'income',
  occurredAt: `${localDate}T${time}.000Z`,
  localDate,
  itemId: null,
  title,
  note: null,
  money: { direction, amount, currency: 'ALL', categoryId: null },
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
})

describe('money forecast', () => {
  const plans = [
    plan('balance', 'Balance', 40000, { date: '2026-10-04' }),
    plan('income', 'Salary', 58000, { dayOfMonth: 10 }),
    plan('bill', 'Phone', 12000, { dayOfMonth: 5 }),
    plan('bill', 'Wifi', 3800, { dayOfMonth: 31 }), // clamps to 30 in November
    plan('planned', 'Prague trip', 33000, { date: '2026-10-24' }),
  ]

  it('starts from the balance anchor and adds what happened after it', () => {
    const f = forecast([spend('2026-10-04', 'Lunch', 500, '07:00:00'), spend('2026-10-04', 'Coffee', 200, '09:00:00')], plans, '2026-10-04')
    expect(f.balance).toBe(39800) // the 07:00 lunch was already in the balance the user typed at 08:00
  })

  it('lists upcoming income, bills and plans by date and finds the next payday', () => {
    const f = forecast([], plans, '2026-10-04', 60)
    expect(f.upcoming.map((e) => `${e.date} ${e.name} ${e.amount}`)).toEqual([
      '2026-10-05 Phone -12000',
      '2026-10-10 Salary 58000',
      '2026-10-24 Prague trip -33000',
      '2026-10-31 Wifi -3800',
      '2026-11-05 Phone -12000',
      '2026-11-10 Salary 58000',
      '2026-11-30 Wifi -3800',
    ])
    expect(f.nextPayday).toBe('2026-10-10')
    expect(f.daysToPayday).toBe(6)
    expect(f.safePerDay).toBeCloseTo((40000 - 12000) / 6)
  })

  it('uses everyday spending (not bills) to project the balance', () => {
    const entries = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map((d) => spend(d, 'Food', 1000))
    entries.push(spend('2026-10-01', 'Phone', 12000)) // a bill — not everyday spending
    const f = forecast(entries, plans, '2026-10-04')
    expect(f.everydayPerDay).toBeCloseTo(6000 / 6)
    expect(f.projectedBeforePayday).toBeCloseTo(40000 - 12000 - 1000 * 6) // balance − phone bill − 6 days of everyday spend
    expect(f.daily[0]).toEqual({ date: '2026-10-04', balance: 39000 })
  })

  it('treats a bill due today as paid once it is logged', () => {
    const p = [plan('balance', 'Balance', 10000, { date: '2026-10-05', updatedAt: '2026-10-05T06:00:00.000Z' }), plan('bill', 'Phone', 12000, { dayOfMonth: 5 })]
    expect(forecast([], p, '2026-10-05').upcoming.map((e) => e.name)).toEqual(['Phone', 'Phone'])
    const paid = forecast([spend('2026-10-05', 'phone', 12000)], p, '2026-10-05')
    expect(paid.upcoming.filter((e) => e.date === '2026-10-05')).toEqual([])
    expect(paid.balance).toBe(-2000)
  })

  it('needs a balance before projecting', () => {
    const f = forecast([], plans.slice(1), '2026-10-04')
    expect(f).toMatchObject({ balance: null, safePerDay: null, projectedBeforePayday: null, daily: [] })
  })
})
