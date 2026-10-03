import { ACTIVITY_LABEL } from './body'
import { formatDuration, formatTime } from './dates'
import { formatMoney } from './money'
import { formatNumber as num } from './numbers'
import type { Entry, TrackerDef } from './types'

export interface EntryLine {
  /** Secondary line after the time, e.g. "1 can · 180 Lek". */
  detail: string[]
  /** The number on the right, if any. */
  side: string | null
  positive: boolean
}

/** What a list row shows for an entry — one place for every facet. */
export function entryLine(e: Entry, timeZone: string, tracker?: TrackerDef): EntryLine {
  const detail: string[] = []
  let side: string | null = null
  let positive = false

  if (e.nutrition) {
    const n = e.nutrition
    if (n.servingLabel) detail.push(n.servingLabel)
    else if (n.grams != null) detail.push(`${num(n.grams, 0)} g`)
    side = n.kcal == null ? 'kcal ?' : `${num(n.kcal, 0)} kcal`
    if (e.money) detail.push(formatMoney(e.money.amount, e.money.currency))
  } else if (e.money) {
    side = `${e.money.direction === 'in' ? '+' : ''}${formatMoney(e.money.amount, e.money.currency)}`
    positive = e.money.direction === 'in'
  }
  if (e.sleep) {
    const s = e.sleep
    if (s.bedAt && s.wakeAt) detail.push(`${formatTime(s.bedAt, timeZone)}–${formatTime(s.wakeAt, timeZone)}`)
    if (s.quality != null) detail.push(`quality ${s.quality}/5`)
    side = formatDuration(s.durationMin)
  }
  if (e.measurement) side = `${num(e.measurement.value)} ${e.measurement.unit}`
  if (e.activity) {
    const a = e.activity
    if (a.distanceKm != null) detail.push(`${num(a.distanceKm, 2)} km`)
    if (a.steps != null) detail.push(`${num(a.steps, 0)} steps`)
    if (a.type === 'other' && e.title !== ACTIVITY_LABEL.other) detail.push(ACTIVITY_LABEL.other)
    side = a.durationMin != null ? formatDuration(a.durationMin) : null
  }
  if (e.workout) {
    const w = e.workout
    side = w.endedAt ? formatDuration((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 60_000) : 'in progress'
  }
  if (e.custom) {
    const parts = (tracker?.fields ?? []).flatMap((f) => {
      const v = e.custom!.values[f.key]
      if (v == null || v === '') return []
      if (f.type === 'bool') return [v ? f.label : `no ${f.label.toLowerCase()}`]
      if (f.type === 'number') return [`${num(Number(v), 2)}${f.unit ? ` ${f.unit}` : ''}`]
      return [String(v)]
    })
    side = parts.shift() ?? null
    detail.push(...parts)
  }
  return { detail, side, positive }
}
