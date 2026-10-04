// Tap counters: a custom tracker with a `count` field gets a +1 button on Today.
// Each tap is one entry (value 1, or more if edited); stats come from the taps.
import type { Entry, LocalDate, TrackerDef, TrackerField } from './types'

/** The tracker's count field, or null if it isn't a tap counter. */
export function counterField(def: TrackerDef): TrackerField | null {
  return def.fields.find((f) => f.type === 'count') ?? null
}

export interface CounterStats {
  today: number
  yesterday: number
  /** Last tap, or null before the first one. */
  lastAt: string | null
  /** Minutes since the last tap. */
  sinceLastMin: number | null
  /** Longest stretch between taps since the first one — the current stretch counts once it's longer. */
  longestMin: number | null
}

export function counterStats(entries: Entry[], def: TrackerDef, today: LocalDate, yesterday: LocalDate, now: number): CounterStats {
  const field = counterField(def)
  const taps = entries
    .filter((e) => !e.deletedAt && e.custom?.trackerId === def.id && field && typeof e.custom.values[field.key] === 'number')
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const sum = (day: LocalDate) => taps.filter((e) => e.localDate === day).reduce((t, e) => t + (e.custom!.values[field!.key] as number), 0)
  const times = taps.map((e) => Date.parse(e.occurredAt))
  const last = times.at(-1) ?? null
  let longest = 0
  for (let i = 1; i < times.length; i++) longest = Math.max(longest, times[i] - times[i - 1])
  if (last != null) longest = Math.max(longest, now - last)
  return {
    today: sum(today),
    yesterday: sum(yesterday),
    lastAt: taps.at(-1)?.occurredAt ?? null,
    sinceLastMin: last == null ? null : Math.max(0, Math.floor((now - last) / 60_000)),
    longestMin: last == null ? null : Math.floor(longest / 60_000),
  }
}

/** 0 → "just now", 42 → "42m", 125 → "2h 5m", 3000 → "2d 2h". */
export function formatGap(min: number): string {
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h}h ${min % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}
