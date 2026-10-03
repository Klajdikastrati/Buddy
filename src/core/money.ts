import { addDays, daysBetween, daysInMonth, monthStart } from './dates'
import type { Entry, LocalDate } from './types'

const SYMBOL: Record<string, string> = { ALL: 'Lek', EUR: '€', USD: '$' }

export function formatMoney(amount: number, currency: string): string {
  const n = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: currency === 'ALL' ? 0 : 2,
  }).format(amount)
  const sym = SYMBOL[currency] ?? currency
  return sym.length === 1 ? `${sym}${n}` : `${n} ${sym}`
}

/** Parses "1,850" / "1850.5" / "1 850" → number, or null if not a positive amount. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, '').replace(/[^\d.]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function spentOn(entries: Entry[]): Map<LocalDate, number> {
  const byDay = new Map<LocalDate, number>()
  for (const e of entries) {
    if (e.deletedAt || e.money?.direction !== 'out') continue
    byDay.set(e.localDate, (byDay.get(e.localDate) ?? 0) + e.money.amount)
  }
  return byDay
}

export interface MoneySummary {
  spentToday: number
  /** Average daily spend over up to 30 days before today; null with no history. */
  dailyAverage: number | null
  spentMonth: number
  incomeMonth: number
  budget: number | null
  remainingMonth: number | null
  /** What's left per remaining day (including today), if a budget is set. */
  perDayLeft: number | null
}

/**
 * `entries` should cover at least the current month and the 30 days before
 * `today`. The average only counts days since the first-ever logged day, so a
 * new user isn't compared against weeks of phantom zeros.
 */
export function moneySummary(
  entries: Entry[],
  today: LocalDate,
  budget: number | null,
  firstLoggedDay: LocalDate | null,
): MoneySummary {
  const byDay = spentOn(entries)
  const spentToday = byDay.get(today) ?? 0

  let dailyAverage: number | null = null
  if (firstLoggedDay && firstLoggedDay < today) {
    const from = firstLoggedDay > addDays(today, -30) ? firstLoggedDay : addDays(today, -30)
    const days = daysBetween(from, today)
    let sum = 0
    for (let d = from; d < today; d = addDays(d, 1)) sum += byDay.get(d) ?? 0
    dailyAverage = days > 0 ? sum / days : null
  }

  const start = monthStart(today)
  let spentMonth = 0
  let incomeMonth = 0
  for (const e of entries) {
    if (e.deletedAt || !e.money || e.localDate < start || e.localDate > today) continue
    if (e.money.direction === 'out') spentMonth += e.money.amount
    else incomeMonth += e.money.amount
  }

  const remainingMonth = budget == null ? null : budget - spentMonth
  const daysLeft = daysInMonth(today) - Number(today.slice(8, 10)) + 1
  // Today's spending is already inside spentMonth; add it back so the per-day
  // allowance answers "what could I spend per day from the start of today".
  const perDayLeft = remainingMonth == null ? null : (remainingMonth + spentToday) / daysLeft

  return {
    spentToday,
    dailyAverage,
    spentMonth,
    incomeMonth,
    budget,
    remainingMonth,
    perDayLeft,
  }
}

export interface MonthMoney {
  /** First day of the month. */
  month: LocalDate
  spent: number
  income: number
  /** Every day of the month up to today (or month end), spending per day. */
  byDay: { date: LocalDate; spent: number }[]
  byCategory: { categoryId: string | null; spent: number; share: number }[]
  /** Biggest spends grouped by what they were. */
  top: { title: string; spent: number; count: number }[]
  /** Money entries this month, newest first. */
  transactions: Entry[]
  /** Spent in the previous month up to the same day of month; null before tracking started. */
  previousToDate: number | null
  /** Average per elapsed day this month. */
  perDay: number
}

/** Everything the finance dashboard shows for the month containing `day`. */
export function monthMoney(entries: Entry[], day: LocalDate, today: LocalDate, firstLoggedDay: LocalDate | null): MonthMoney {
  const start = monthStart(day)
  const end = addDays(start, daysInMonth(start) - 1)
  const last = today < end ? today : end
  const live = entries.filter((e) => !e.deletedAt && e.money)
  const inMonth = live.filter((e) => e.localDate >= start && e.localDate <= end)
  const out = inMonth.filter((e) => e.money!.direction === 'out')

  const perDayMap = spentOn(out)
  const byDay: MonthMoney['byDay'] = []
  for (let d = start; d <= last; d = addDays(d, 1)) byDay.push({ date: d, spent: perDayMap.get(d) ?? 0 })

  const spent = out.reduce((t, e) => t + e.money!.amount, 0)
  const income = inMonth.filter((e) => e.money!.direction === 'in').reduce((t, e) => t + e.money!.amount, 0)

  const cats = new Map<string | null, number>()
  for (const e of out) cats.set(e.money!.categoryId, (cats.get(e.money!.categoryId) ?? 0) + e.money!.amount)
  const byCategory = [...cats.entries()]
    .map(([categoryId, s]) => ({ categoryId, spent: s, share: spent ? s / spent : 0 }))
    .sort((a, b) => b.spent - a.spent)

  const titles = new Map<string, { title: string; spent: number; count: number }>()
  for (const e of out) {
    const key = e.title.trim().toLowerCase()
    const t = titles.get(key) ?? { title: e.title, spent: 0, count: 0 }
    t.spent += e.money!.amount
    t.count++
    titles.set(key, t)
  }
  const top = [...titles.values()].sort((a, b) => b.spent - a.spent).slice(0, 5)

  const prevStart = monthStart(addDays(start, -1))
  const dom = Number(last.slice(8, 10))
  const prevEnd = addDays(prevStart, Math.min(dom, daysInMonth(prevStart)) - 1)
  const previousToDate =
    firstLoggedDay == null || firstLoggedDay > prevStart
      ? null
      : live
          .filter((e) => e.money!.direction === 'out' && e.localDate >= prevStart && e.localDate <= prevEnd)
          .reduce((t, e) => t + e.money!.amount, 0)

  return {
    month: start,
    spent,
    income,
    byDay,
    byCategory,
    top,
    transactions: [...inMonth].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    previousToDate,
    perDay: byDay.length ? spent / byDay.length : 0,
  }
}
