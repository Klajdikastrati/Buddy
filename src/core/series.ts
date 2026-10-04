// One row per day with every domain's number — the shared input for trends,
// signals and the Analyst export. `null` = nothing logged, never zero.
import { addDays } from './dates'
import { sumNutrients } from './nutrition'
import { finishedWorkouts, volumeOf } from './training'
import type { DayCheckin, Entry, ID, LocalDate, TrackerDef, WorkoutSet } from './types'

export interface DayRow {
  date: LocalDate
  /** Spending; 0 on a day with none (once money tracking has started), null before. */
  spend: number | null
  income: number | null
  kcal: number | null
  proteinG: number | null
  caffeineMg: number | null
  foodEntries: number
  /** Food entries missing kcal or a macro that day. */
  foodIncomplete: number
  sleepMin: number | null
  sleepQuality: number | null
  weightKg: number | null
  activityMin: number | null
  km: number | null
  steps: number | null
  workouts: number
  volumeKg: number
  mood: number | null
  energy: number | null
  stress: number | null
  productivity: number | null
  /** trackerId → fieldKey → value (numbers summed, others last value). */
  trackers: Record<ID, Record<string, number | string | boolean>>
  /** Anything at all logged (entry or check-in). */
  logged: boolean
}

export interface SeriesInput {
  entries: Entry[]
  sets: WorkoutSet[]
  checkins: DayCheckin[]
  trackers?: TrackerDef[]
  from: LocalDate
  to: LocalDate
  /** First day money was ever logged; spend is 0 (not unknown) from then on. */
  moneySince: LocalDate | null
}

/** Null-aware sum, rounded to 2 decimals so 3.1 + 4.2 doesn't export as 7.300000000000001. */
const add = (a: number | null, b: number | null | undefined) => (b == null ? a : Math.round(((a ?? 0) + b) * 100) / 100)

export function dailySeries({ entries, sets, checkins, trackers = [], from, to, moneySince }: SeriesInput): DayRow[] {
  const live = entries.filter((e) => !e.deletedAt && e.localDate >= from && e.localDate <= to)
  const byDay = new Map<LocalDate, Entry[]>()
  for (const e of live) byDay.set(e.localDate, [...(byDay.get(e.localDate) ?? []), e])
  const checkinOn = new Map(checkins.map((c) => [c.localDate, c]))
  const workouts = finishedWorkouts(live)
  const setsOf = new Map<ID, WorkoutSet[]>()
  for (const s of sets) setsOf.set(s.entryId, [...(setsOf.get(s.entryId) ?? []), s])
  const numericFields = new Map(trackers.map((t) => [t.id, new Set(t.fields.filter((f) => f.type === 'number' || f.type === 'count').map((f) => f.key))]))

  const rows: DayRow[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = byDay.get(d) ?? []
    const c = checkinOn.get(d)
    const moneyOn = moneySince != null && d >= moneySince
    const row: DayRow = {
      date: d,
      spend: moneyOn ? 0 : null,
      income: moneyOn ? 0 : null,
      kcal: null,
      proteinG: null,
      caffeineMg: null,
      foodEntries: 0,
      foodIncomplete: 0,
      sleepMin: null,
      sleepQuality: null,
      weightKg: null,
      activityMin: null,
      km: null,
      steps: null,
      workouts: 0,
      volumeKg: 0,
      mood: c?.mood ?? null,
      energy: c?.energy ?? null,
      stress: c?.stress ?? null,
      productivity: c?.productivity ?? null,
      trackers: {},
      logged: day.length > 0 || !!c,
    }
    const food = day.filter((e) => e.nutrition)
    if (food.length) {
      const t = sumNutrients(food.map((e) => e.nutrition!)).totals
      row.kcal = t.kcal
      row.proteinG = t.proteinG
      row.caffeineMg = t.caffeineMg
      row.foodEntries = food.length
      row.foodIncomplete = food.filter((e) => ['kcal', 'proteinG', 'carbsG', 'fatG'].some((k) => e.nutrition![k as 'kcal'] == null)).length
    }
    let qualities = 0
    let qualitySum = 0
    for (const e of [...day].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      if (e.money) {
        if (e.money.direction === 'out') row.spend = add(row.spend, e.money.amount)
        else row.income = add(row.income, e.money.amount)
      }
      if (e.sleep) {
        row.sleepMin = add(row.sleepMin, e.sleep.durationMin)
        if (e.sleep.quality != null) {
          qualities++
          qualitySum += e.sleep.quality
        }
      }
      if (e.measurement?.metric === 'bodyweight') row.weightKg = e.measurement.value
      if (e.activity) {
        row.activityMin = add(row.activityMin, e.activity.durationMin)
        row.km = add(row.km, e.activity.distanceKm)
        row.steps = add(row.steps, e.activity.steps)
      }
      if (e.custom) {
        const vals = (row.trackers[e.custom.trackerId] ??= {})
        const numeric = numericFields.get(e.custom.trackerId)
        for (const [k, v] of Object.entries(e.custom.values)) {
          if (v == null || v === '') continue
          vals[k] = numeric?.has(k) && typeof v === 'number' ? (Number(vals[k]) || 0) + v : v
        }
      }
    }
    if (qualities) row.sleepQuality = Math.round((qualitySum / qualities) * 10) / 10
    for (const w of workouts.filter((x) => x.localDate === d)) {
      row.workouts++
      row.volumeKg += volumeOf(setsOf.get(w.id) ?? [])
    }
    rows.push(row)
  }
  return rows
}

/* --------------------------------- trends --------------------------------- */

export type TrendKey = 'spend' | 'kcal' | 'proteinG' | 'sleepMin' | 'weightKg' | 'workouts' | 'km'

export interface Trend {
  key: TrendKey | `tracker:${string}`
  label: string
  unit: string
  current: number | null
  previous: number | null
  /** Days with a value in each window. */
  nCurrent: number
  nPrevious: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function windowStat(rows: DayRow[], pick: (r: DayRow) => number | null, mode: 'mean' | 'perWeek'): { value: number | null; n: number } {
  const vals = rows.map(pick).filter((v): v is number => v != null)
  if (mode === 'perWeek') return { value: rows.length ? (vals.reduce((a, b) => a + b, 0) * 7) / rows.length : null, n: vals.length }
  return { value: mean(vals), n: vals.length }
}

/**
 * The last `days` days (ending yesterday-inclusive `today`) vs the `days` before.
 * Averages only count days with a value; per-week rates count every day.
 */
export function trends(rows: DayRow[], today: LocalDate, trackers: TrackerDef[] = [], days = 30): Trend[] {
  const curFrom = addDays(today, -(days - 1))
  const prevFrom = addDays(curFrom, -days)
  const cur = rows.filter((r) => r.date >= curFrom && r.date <= today)
  const prev = rows.filter((r) => r.date >= prevFrom && r.date < curFrom)
  const defs: { key: Trend['key']; label: string; unit: string; pick: (r: DayRow) => number | null; mode: 'mean' | 'perWeek' }[] = [
    { key: 'spend', label: 'Spending', unit: 'per day', pick: (r) => r.spend, mode: 'mean' },
    { key: 'kcal', label: 'Calories', unit: 'kcal / day', pick: (r) => r.kcal, mode: 'mean' },
    { key: 'proteinG', label: 'Protein', unit: 'g / day', pick: (r) => r.proteinG, mode: 'mean' },
    { key: 'sleepMin', label: 'Sleep', unit: 'per night', pick: (r) => r.sleepMin, mode: 'mean' },
    { key: 'weightKg', label: 'Weight', unit: 'kg avg', pick: (r) => r.weightKg, mode: 'mean' },
    { key: 'workouts', label: 'Workouts', unit: 'per week', pick: (r) => (r.logged || r.workouts ? r.workouts : null), mode: 'perWeek' },
    { key: 'km', label: 'Distance', unit: 'km / week', pick: (r) => r.km, mode: 'perWeek' },
  ]
  for (const t of trackers.filter((x) => !x.deletedAt && !x.archived)) {
    for (const f of t.fields.filter((x) => x.type === 'number')) {
      defs.push({
        key: `tracker:${t.id}:${f.key}`,
        label: t.fields.length > 1 ? `${t.name} · ${f.label}` : t.name,
        unit: `${f.unit ? `${f.unit} ` : ''}/ logged day`,
        pick: (r) => {
          const v = r.trackers[t.id]?.[f.key]
          return typeof v === 'number' ? v : null
        },
        mode: 'mean',
      })
    }
  }
  return defs.map((d) => {
    const c = windowStat(cur, d.pick, d.mode)
    const p = windowStat(prev, d.pick, d.mode)
    return { key: d.key, label: d.label, unit: d.unit, current: c.n ? c.value : null, previous: p.n ? p.value : null, nCurrent: c.n, nPrevious: p.n }
  })
}
