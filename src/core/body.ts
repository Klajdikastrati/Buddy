import { addDays, daysBetween } from './dates'
import type { ActivityFacet, Entry, Instant, LocalDate } from './types'

export const ACTIVITY_LABEL: Record<ActivityFacet['type'], string> = {
  walk: 'Walk',
  run: 'Run',
  cycle: 'Cycle',
  other: 'Activity',
}

/** Minutes between going to bed and waking, or null if the range is impossible (≤ 0 or > 24 h). */
export function sleepMinutes(bedAt: Instant, wakeAt: Instant): number | null {
  const min = Math.round((Date.parse(wakeAt) - Date.parse(bedAt)) / 60_000)
  return min > 0 && min <= 1440 ? min : null
}

const live = (entries: Entry[]) => entries.filter((e) => !e.deletedAt)

/** Total sleep per day (the day you woke up). Days without a log are absent, not zero. */
export function sleepByDay(entries: Entry[]): Map<LocalDate, number> {
  const out = new Map<LocalDate, number>()
  for (const e of live(entries)) if (e.sleep) out.set(e.localDate, (out.get(e.localDate) ?? 0) + e.sleep.durationMin)
  return out
}

/** Mean of the logged values in the `days` days before `day` (not including it); null if none. */
export function trailingAverage(byDay: Map<LocalDate, number>, day: LocalDate, days = 30): number | null {
  let sum = 0
  let n = 0
  for (let d = addDays(day, -days); d < day; d = addDays(d, 1)) {
    const v = byDay.get(d)
    if (v != null) {
      sum += v
      n++
    }
  }
  return n ? sum / n : null
}

export interface SleepSummary {
  /** Slept "last night" (sleep logged for today), minutes. */
  today: number | null
  /** Average over logged nights in the 30 days before today. */
  average: number | null
}

export function sleepSummary(entries: Entry[], today: LocalDate): SleepSummary {
  const byDay = sleepByDay(entries)
  return { today: byDay.get(today) ?? null, average: trailingAverage(byDay, today) }
}

export interface WeightReading {
  value: number
  localDate: LocalDate
  occurredAt: Instant
}

export function weightReadings(entries: Entry[]): WeightReading[] {
  return live(entries)
    .filter((e) => e.measurement?.metric === 'bodyweight')
    .map((e) => ({ value: e.measurement!.value, localDate: e.localDate, occurredAt: e.occurredAt }))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
}

export interface WeightSummary {
  latest: WeightReading
  /** Latest minus the reading closest to 7 days earlier (4–14 days back); null without one. */
  change: number | null
  changeDays: number | null
}

export function weightSummary(entries: Entry[]): WeightSummary | null {
  const readings = weightReadings(entries)
  const latest = readings.at(-1)
  if (!latest) return null
  let best: WeightReading | null = null
  for (const r of readings) {
    const gap = daysBetween(r.localDate, latest.localDate)
    if (gap < 4 || gap > 14) continue
    if (!best || Math.abs(gap - 7) < Math.abs(daysBetween(best.localDate, latest.localDate) - 7)) best = r
  }
  return {
    latest,
    change: best ? Math.round((latest.value - best.value) * 10) / 10 : null,
    changeDays: best ? daysBetween(best.localDate, latest.localDate) : null,
  }
}

export interface ActivityTotals {
  count: number
  minutes: number | null
  km: number | null
  steps: number | null
  types: ActivityFacet['type'][]
}

/** One day's activity. A total is null when no entry recorded that measure. */
export function activityOn(entries: Entry[], day: LocalDate): ActivityTotals {
  const out: ActivityTotals = { count: 0, minutes: null, km: null, steps: null, types: [] }
  for (const e of live(entries)) {
    if (!e.activity || e.localDate !== day) continue
    const a = e.activity
    out.count++
    if (a.durationMin != null) out.minutes = (out.minutes ?? 0) + a.durationMin
    if (a.distanceKm != null) out.km = Math.round(((out.km ?? 0) + a.distanceKm) * 100) / 100
    if (a.steps != null) out.steps = (out.steps ?? 0) + a.steps
    if (!out.types.includes(a.type)) out.types.push(a.type)
  }
  return out
}
