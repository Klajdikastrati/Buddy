import type { LocalDate } from './types'

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function wallClock(instant: Date, timeZone: string) {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
    partsFormatters.set(timeZone, f)
  }
  const p = Object.fromEntries(f.formatToParts(instant).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }
}

/**
 * The day an instant belongs to. Before `rolloverHour` (wall clock, in
 * `timeZone`) it still counts as the previous day — a 2 a.m. snack is
 * yesterday's. Uses wall-clock hours, so DST transitions don't shift it.
 */
export function localDateOf(instant: Date, timeZone: string, rolloverHour: number): LocalDate {
  const { date, hour } = wallClock(instant, timeZone)
  return hour < rolloverHour ? addDays(date, -1) : date
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function monthStart(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`
}

export function daysInMonth(date: LocalDate): number {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function formatDayLabel(date: LocalDate, today: LocalDate, locale = 'en-GB'): string {
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function formatLongDate(date: LocalDate, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function formatTime(instant: string, timeZone: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(instant),
  )
}

/** Wall-clock hour (0–23) of an instant in a time zone. */
export function hourIn(instant: Date, timeZone: string): number {
  return wallClock(instant, timeZone).hour
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: LocalDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/** The Monday of the week containing `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -((weekdayOf(date) + 6) % 7))
}

/** 452 → "7h 32m"; 45 → "45m". */
export function formatDuration(minutes: number): string {
  const m = Math.round(Math.abs(minutes))
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** "Mon 28 Sep" — for dates near today. */
export function formatShortDate(date: LocalDate, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}
