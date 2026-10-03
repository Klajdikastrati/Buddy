import { useMemo } from 'react'
import { activityOn, sleepByDay, trailingAverage, weightReadings } from '../core/body'
import { addDays, formatDuration, formatShortDate } from '../core/dates'
import { formatNumber } from '../core/numbers'
import type { Entry } from '../core/types'
import { db } from '../data/db'
import { DayChart } from '../ui/DayChart'
import { DOMAIN } from '../ui/domains'
import { EntryRow } from '../ui/EntryRow'
import { SubHead } from '../ui/fields'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { useLiveQuery } from '../ui/live'

export type BodyKind = 'sleep' | 'weight' | 'activity'

const TITLE: Record<BodyKind, string> = { sleep: 'Sleep', weight: 'Weight', activity: 'Activity' }
const KINDS: Record<BodyKind, Entry['kind']> = { sleep: 'sleep', weight: 'weight', activity: 'activity' }

/** Read-only history for one body metric: headline numbers, a trend chart, recent logs. */
export function BodyDetail({ kind }: { kind: BodyKind }) {
  const settings = useSettings()
  const today = useToday(settings)
  const entries = useLiveQuery(() => db.entries.where('kind').equals(KINDS[kind]).toArray(), [kind])
  const live = useMemo(() => (entries ?? []).filter((e) => !e.deletedAt).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [entries])
  const head = <SubHead title={TITLE[kind]} back={() => navigate('/')} />
  if (!entries) return head
  const tint = DOMAIN[kind].tint
  const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))

  let stats: [string, string][] = []
  let chart: React.ReactNode = null

  if (kind === 'sleep') {
    const byDay = sleepByDay(live)
    const avg7 = trailingAverage(byDay, addDays(today, 1), 7)
    const avg30 = trailingAverage(byDay, addDays(today, 1), 30)
    const last = byDay.get(today) ?? null
    const fmt = (m: number | null) => (m == null ? '—' : formatDuration(m))
    stats = [
      ['Last night', fmt(last)],
      ['7-day avg', fmt(avg7)],
      ['30-day avg', fmt(avg30)],
    ]
    chart = (
      <DayChart
        points={days(30).map((d) => ({ date: d, value: byDay.get(d) ?? null }))}
        tint={tint}
        format={(v) => formatDuration(v)}
        label={formatShortDate}
        highlight={today}
        average={avg30}
      />
    )
  } else if (kind === 'weight') {
    const readings = weightReadings(live)
    const latest = readings.at(-1)
    const back = (n: number) => {
      const cutoff = addDays(today, -n)
      return [...readings].reverse().find((r) => r.localDate <= cutoff)
    }
    const delta = (n: number) => {
      const b = back(n)
      if (!latest || !b) return '—'
      const d = Math.round((latest.value - b.value) * 10) / 10
      return `${d > 0 ? '+' : d < 0 ? '−' : ''}${formatNumber(Math.abs(d))} kg`
    }
    stats = [
      ['Latest', latest ? `${formatNumber(latest.value)} kg` : '—'],
      ['vs 7 days', delta(7)],
      ['vs 30 days', delta(30)],
    ]
    const lastPerDay = new Map(readings.map((r) => [r.localDate, r.value]))
    chart = (
      <DayChart
        mode="line"
        points={days(60).map((d) => ({ date: d, value: lastPerDay.get(d) ?? null }))}
        tint={tint}
        format={(v) => `${formatNumber(v)} kg`}
        label={formatShortDate}
      />
    )
  } else {
    const week = days(7).map((d) => activityOn(live, d))
    const sum = (k: 'minutes' | 'km' | 'steps') => week.reduce((t, a) => t + (a[k] ?? 0), 0)
    stats = [
      ['Minutes · 7d', formatDuration(sum('minutes'))],
      ['Km · 7d', formatNumber(sum('km'), 1)],
      ['Steps · 7d', formatNumber(sum('steps'), 0)],
    ]
    chart = (
      <DayChart
        points={days(30).map((d) => ({ date: d, value: activityOn(live, d).minutes }))}
        tint={tint}
        format={(v) => formatDuration(v)}
        label={formatShortDate}
        highlight={today}
      />
    )
  }

  return (
    <div className="screen dense-screen">
      {head}
      <div className="stats3">
        {stats.map(([label, value]) => (
          <div key={label}>
            <span className="summary-value num">{value}</span>
            <span className="summary-label">{label}</span>
          </div>
        ))}
      </div>
      <section className="chart-card" aria-label={`${TITLE[kind]} trend`}>
        <span className="block-label" style={{ color: tint }}>
          {kind === 'weight' ? 'Last 60 days' : kind === 'sleep' ? 'Sleep per night · 30 days' : 'Active minutes · 30 days'}
        </span>
        {chart}
      </section>
      <section aria-labelledby="body-recent">
        <h2 id="body-recent" className="section-label">
          Recent
        </h2>
        {live.length ? (
          <ul className="list with-icons dense">
            {live.slice(0, 30).map((e) => (
              <EntryRow key={e.id} entry={e} timeZone={settings.timezone} />
            ))}
          </ul>
        ) : (
          <p className="muted pad-l">Nothing logged yet — use + to add.</p>
        )}
      </section>
    </div>
  )
}
