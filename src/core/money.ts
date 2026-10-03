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
