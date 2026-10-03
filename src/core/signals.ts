// Deterministic associations between the user's own daily numbers. Buddy
// computes; it never claims causes. Shown only with enough paired days.
import { addDays, weekdayOf } from './dates'
import type { DayRow } from './series'

export const MIN_N = 14

/** Pearson correlation; null when n < 3 or either side has no variance. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

/** 95% confidence interval for r (Fisher z). */
export function confidence95(r: number, n: number): [number, number] | null {
  if (n <= 3 || Math.abs(r) >= 1) return null
  const z = Math.atanh(r)
  const se = 1 / Math.sqrt(n - 3)
  return [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)]
}

export type Strength = 'none' | 'weak' | 'moderate' | 'strong'
export const strengthOf = (r: number): Strength => {
  const a = Math.abs(r)
  return a < 0.1 ? 'none' : a < 0.3 ? 'weak' : a < 0.5 ? 'moderate' : 'strong'
}

type Metric = keyof Pick<DayRow, 'sleepMin' | 'energy' | 'mood' | 'caffeineMg' | 'workouts' | 'spend' | 'stress' | 'kcal'>

interface PairDef {
  id: string
  x: Metric
  y: Metric
  /** y is taken this many days after x. */
  lag: number
  xLabel: string
  yLabel: string
  /** Sentence start for "more x": "More sleep", "Workout days". */
  xMore: string
  /** Only days where x is meaningful (e.g. a workout day count needs a logged day). */
  xWhen?: (r: DayRow) => boolean
}

const PAIRS: PairDef[] = [
  { id: 'sleep-energy', x: 'sleepMin', y: 'energy', lag: 0, xLabel: 'Sleep', yLabel: 'energy the same day', xMore: 'More sleep' },
  { id: 'sleep-mood', x: 'sleepMin', y: 'mood', lag: 0, xLabel: 'Sleep', yLabel: 'mood the same day', xMore: 'More sleep' },
  { id: 'caffeine-sleep', x: 'caffeineMg', y: 'sleepMin', lag: 1, xLabel: 'Caffeine', yLabel: 'sleep the next night', xMore: 'More caffeine' },
  { id: 'workout-mood', x: 'workouts', y: 'mood', lag: 0, xLabel: 'Workouts', yLabel: 'mood the same day', xMore: 'Workout days', xWhen: (r) => r.logged },
  { id: 'spend-mood', x: 'spend', y: 'mood', lag: 0, xLabel: 'Spending', yLabel: 'mood the same day', xMore: 'Higher spending' },
  { id: 'sleep-stress', x: 'sleepMin', y: 'stress', lag: 0, xLabel: 'Sleep', yLabel: 'stress the same day', xMore: 'More sleep' },
]

export interface Signal {
  id: string
  x: Metric
  y: Metric
  lag: number
  xLabel: string
  yLabel: string
  xMore: string
  /** Paired days with both values. */
  n: number
  r: number | null
  ci95: [number, number] | null
  strength: Strength | null
  /** n ≥ MIN_N and r defined. */
  ready: boolean
}

export function correlations(rows: DayRow[]): Signal[] {
  const byDate = new Map(rows.map((r) => [r.date, r]))
  return PAIRS.map((p) => {
    const xs: number[] = []
    const ys: number[] = []
    for (const row of rows) {
      const x = row[p.x]
      const target = p.lag ? byDate.get(addDays(row.date, p.lag)) : row
      const y = target?.[p.y]
      if (x == null || y == null || (p.xWhen && !p.xWhen(row))) continue
      xs.push(x)
      ys.push(y)
    }
    const n = xs.length
    const r = n >= 3 ? pearson(xs, ys) : null
    const ready = n >= MIN_N && r != null
    return {
      id: p.id,
      x: p.x,
      y: p.y,
      lag: p.lag,
      xLabel: p.xLabel,
      yLabel: p.yLabel,
      xMore: p.xMore,
      n,
      r: r == null ? null : Math.round(r * 100) / 100,
      ci95: ready ? (confidence95(r!, n)?.map((v) => Math.round(v * 100) / 100) as [number, number]) : null,
      strength: r == null ? null : strengthOf(r),
      ready,
    }
  })
}

export interface WeekSplit {
  metric: 'spend' | 'sleepMin' | 'mood' | 'kcal'
  label: string
  weekday: number | null
  weekend: number | null
  nWeekday: number
  nWeekend: number
  ready: boolean
}

/** Mean on weekdays vs weekends (Sat/Sun) for a few metrics. */
export function weekdayWeekend(rows: DayRow[]): WeekSplit[] {
  const metrics: { metric: WeekSplit['metric']; label: string }[] = [
    { metric: 'spend', label: 'Spending' },
    { metric: 'sleepMin', label: 'Sleep' },
    { metric: 'mood', label: 'Mood' },
    { metric: 'kcal', label: 'Calories' },
  ]
  return metrics.map(({ metric, label }) => {
    const wd: number[] = []
    const we: number[] = []
    for (const r of rows) {
      const v = r[metric]
      if (v == null) continue
      const d = weekdayOf(r.date)
      ;(d === 0 || d === 6 ? we : wd).push(v)
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    return { metric, label, weekday: avg(wd), weekend: avg(we), nWeekday: wd.length, nWeekend: we.length, ready: wd.length >= 8 && we.length >= 4 }
  })
}

/** Plain-language reading of a signal — evidence, never a cause. */
export function describeSignal(s: Signal): string {
  if (!s.ready || s.r == null) return `${s.xLabel} ↔ ${s.yLabel}: ${s.n} of ${MIN_N} days so far`
  if (s.strength === 'none') return `No clear link between ${s.xLabel.toLowerCase()} and ${s.yLabel}`
  return `${s.xMore}: ${s.yLabel} tended to be ${s.r > 0 ? 'higher' : 'lower'}`
}
