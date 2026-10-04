// Money planner: where the balance stands now and where it's heading.
// Pure — the dashboard and the Analyst export both use it.
import { addDays, daysBetween, daysInMonth } from './dates'
import { normalizeName } from './recents'
import type { Entry, LocalDate, MoneyPlan } from './types'

export interface MoneyEvent {
  date: LocalDate
  name: string
  /** Positive = money in, negative = money out. */
  amount: number
  kind: 'income' | 'bill' | 'planned'
  planId: string
}

export interface Forecast {
  /** null until the user sets a balance. */
  balance: number | null
  balanceSetOn: LocalDate | null
  /** Everyday (non-bill, non-planned) spending per day, from up to 30 recent days; null with < 3 days of data. */
  everydayPerDay: number | null
  nextPayday: LocalDate | null
  /** Known events from today until the horizon, by date. */
  upcoming: MoneyEvent[]
  /** Until the day before next payday: what's free per day after bills and plans. */
  safePerDay: number | null
  daysToPayday: number | null
  /** Balance the day before payday if everyday spending continues at its average. */
  projectedBeforePayday: number | null
  /** Day-by-day projection (balance at end of each day). */
  daily: { date: LocalDate; balance: number }[]
}

const live = (p: MoneyPlan) => !p.deletedAt && !p.archived

/** Monthly occurrences of an income/bill between `from` and `to` (inclusive), clamped to month length. */
function monthly(plan: MoneyPlan, from: LocalDate, to: LocalDate): LocalDate[] {
  if (!plan.dayOfMonth) return []
  const out: LocalDate[] = []
  let m = `${from.slice(0, 7)}-01`
  while (m <= to) {
    const day = Math.min(plan.dayOfMonth, daysInMonth(m))
    const d = `${m.slice(0, 8)}${String(day).padStart(2, '0')}`
    if (d >= from && d <= to) out.push(d)
    m = addDays(m, daysInMonth(m))
  }
  return out
}

export function forecast(entries: Entry[], plans: MoneyPlan[], today: LocalDate, horizonDays = 45): Forecast {
  const money = entries.filter((e) => !e.deletedAt && e.money)
  const active = plans.filter(live)
  const horizon = addDays(today, horizonDays)

  // Balance: the latest anchor plus every money entry that happened after it was set.
  const anchor = plans
    .filter((p) => !p.deletedAt && p.kind === 'balance')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const balance = anchor
    ? anchor.amount +
      money
        .filter((e) => e.occurredAt > anchor.updatedAt)
        .reduce((t, e) => t + (e.money!.direction === 'in' ? e.money!.amount : -e.money!.amount), 0)
    : null

  // A bill/plan on today counts as handled once something with the same name was logged today.
  const loggedToday = new Set(money.filter((e) => e.localDate === today).map((e) => normalizeName(e.title)))
  const events: MoneyEvent[] = []
  for (const p of active) {
    if (p.kind === 'income' || p.kind === 'bill') {
      for (const date of monthly(p, today, horizon)) {
        if (date === today && loggedToday.has(normalizeName(p.name))) continue
        events.push({ date, name: p.name, amount: p.kind === 'income' ? p.amount : -p.amount, kind: p.kind, planId: p.id })
      }
    } else if (p.kind === 'planned' && p.date && p.date >= today && p.date <= horizon) {
      if (p.date === today && loggedToday.has(normalizeName(p.name))) continue
      events.push({ date: p.date, name: p.name, amount: -p.amount, kind: 'planned', planId: p.id })
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount)

  // Everyday spending: recent expenses that aren't bills or planned items.
  const planned = new Set(active.filter((p) => p.kind !== 'income' && p.kind !== 'balance').map((p) => normalizeName(p.name)))
  const recent = money.filter((e) => e.money!.direction === 'out' && e.localDate < today && e.localDate >= addDays(today, -30) && !planned.has(normalizeName(e.title)))
  const firstDay = money.map((e) => e.localDate).sort()[0]
  const spanStart = firstDay && firstDay > addDays(today, -30) ? firstDay : addDays(today, -30)
  const span = firstDay ? daysBetween(spanStart, today) : 0
  const everydayPerDay = span >= 3 ? recent.reduce((t, e) => t + e.money!.amount, 0) / span : null

  const nextPayday = events.find((e) => e.kind === 'income' && e.date > today)?.date ?? null
  const daysToPayday = nextPayday ? daysBetween(today, nextPayday) : null
  let safePerDay: number | null = null
  let projectedBeforePayday: number | null = null
  if (balance != null && nextPayday && daysToPayday) {
    const before = events.filter((e) => e.date < nextPayday).reduce((t, e) => t + e.amount, 0)
    safePerDay = (balance + before) / daysToPayday
    projectedBeforePayday = balance + before - (everydayPerDay ?? 0) * daysToPayday
  }

  const daily: Forecast['daily'] = []
  if (balance != null) {
    let b = balance
    for (let d = today; d <= horizon; d = addDays(d, 1)) {
      b -= everydayPerDay ?? 0
      for (const e of events) if (e.date === d) b += e.amount
      daily.push({ date: d, balance: Math.round(b) })
    }
  }

  return {
    balance: balance == null ? null : Math.round(balance * 100) / 100,
    balanceSetOn: anchor?.date ?? null,
    everydayPerDay,
    nextPayday,
    upcoming: events,
    safePerDay,
    daysToPayday,
    projectedBeforePayday,
    daily,
  }
}
