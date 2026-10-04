import { useLiveQuery } from '../ui/live'
import { useMemo, useState } from 'react'
import { counterField } from '../core/counter'
import { addDays, formatDayLabel, formatDuration, formatTime } from '../core/dates'
import { habitsForDay } from '../core/habits'
import { formatMoney } from '../core/money'
import { formatNumber } from '../core/numbers'
import { dailySeries, trends, type Trend } from '../core/series'
import { correlations, describeSignal, weekdayWeekend, type Signal, type WeekSplit } from '../core/signals'
import type { DayCheckin, Entry, PlanItem, TrackerDef } from '../core/types'
import { db } from '../data/db'
import { EntryRow } from '../ui/EntryRow'
import { Segmented } from '../ui/fields'
import { useSettings, useToday } from '../ui/hooks'
import { DOMAIN } from '../ui/domains'
import { Icon, IconChip } from '../ui/icons'

const PAGE_DAYS = 60
type View = 'days' | 'trends' | 'signals'

export function History() {
  const [view, setView] = useState<View>('days')
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>History</h1>
      </header>
      <Segmented
        label="View"
        options={[
          { value: 'days', label: 'Days' },
          { value: 'trends', label: 'Trends' },
          { value: 'signals', label: 'Signals' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'days' ? <Days /> : <Insights view={view} />}
    </div>
  )
}

function checkinText(c: DayCheckin): string {
  const parts = (
    [
      ['Mood', c.mood],
      ['Energy', c.energy],
      ['Stress', c.stress],
      ['Productivity', c.productivity],
    ] as const
  ).flatMap(([label, v]) => (v == null ? [] : [`${label} ${v}`]))
  return [...parts, ...(c.note ? [`“${c.note}”`] : [])].join(' · ')
}

/** Past days, newest first. Tap any entry to fix it. */
function Days() {
  const settings = useSettings()
  const today = useToday(settings)
  const [days, setDays] = useState(PAGE_DAYS)
  const from = addDays(today, -days)

  const entries = useLiveQuery(
    () => db.entries.where('localDate').aboveOrEqual(from).filter((e) => !e.deletedAt).toArray(),
    [from],
  )
  const older = useLiveQuery(() => db.entries.where('localDate').below(from).count(), [from])
  const checkins = useLiveQuery(() => db.checkins.where('localDate').aboveOrEqual(from).toArray(), [from])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const trackers = useLiveQuery(() => db.trackers.toArray(), [])
  const plan = useLiveQuery(() => db.plan.toArray(), [])
  const catName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories])
  const trackerById = useMemo(() => new Map(trackers?.map((t) => [t.id, t])), [trackers])
  const checkinOn = useMemo(() => new Map(checkins?.map((c) => [c.localDate, c])), [checkins])

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of entries ?? []) map.set(e.localDate, [...(map.get(e.localDate) ?? []), e])
    for (const c of checkins ?? []) if (!map.has(c.localDate) && checkinText(c)) map.set(c.localDate, [])
    // Days where only habits were ticked still show up.
    for (const h of plan ?? []) if (h.kind === 'routine' && !h.deletedAt) for (const d of h.doneDates) if (d >= from && !map.has(d)) map.set(d, [])
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, list]) => ({
        day,
        list: list.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
        spent: list.reduce((t, e) => t + (e.money?.direction === 'out' ? e.money.amount : 0), 0),
        kcal: list.reduce((t, e) => t + (e.nutrition?.kcal ?? 0), 0),
      }))
  }, [entries, checkins, plan, from])

  if (!entries) return null

  return (
    <>
      {groups.length === 0 && <p className="muted pad-l">No entries yet.</p>}
      {groups.map((g) => {
        const c = checkinOn.get(g.day)
        return (
          <section key={g.day} aria-label={g.day}>
            <div className="day-head">
              <h2 className="section-label">{formatDayLabel(g.day, today)}</h2>
              <span className="muted num day-totals">
                {[g.kcal > 0 ? `${formatNumber(g.kcal, 0)} kcal` : null, g.spent > 0 ? formatMoney(g.spent, settings.currency) : null].filter(Boolean).join(' · ')}
              </span>
            </div>
            {c && checkinText(c) && <p className="day-checkin num">{checkinText(c)}</p>}
            <DayHabits day={g.day} plan={plan ?? []} />
            <ul className="list with-icons">
              {counterSummaries(g.list, trackers ?? [], settings.timezone).map((s) => (
                <li key={s.id} className="list-row">
                  <span className="row-icon">
                    <IconChip name="tracker" tint={DOMAIN.tracker.tint} />
                  </span>
                  <span className="row-main static">
                    <span className="row-title">{s.name}</span>
                    <span className="row-sub num">{s.span}</span>
                  </span>
                  <span className="row-side num">{s.total}</span>
                </li>
              ))}
              {g.list.filter((e) => !isCounterTap(e, trackers ?? [])).map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  timeZone={settings.timezone}
                  tracker={e.custom ? trackerById.get(e.custom.trackerId) : undefined}
                  categoryName={e.money && !e.nutrition && e.money.categoryId ? catName.get(e.money.categoryId) : undefined}
                />
              ))}
            </ul>
          </section>
        )
      })}
      {!!older && (
        <button type="button" className="btn btn-quiet full" onClick={() => setDays(days + PAGE_DAYS)}>
          Show older
        </button>
      )}
    </>
  )
}

const isCounterTap = (e: Entry, trackers: TrackerDef[]) => {
  const t = e.custom && trackers.find((x) => x.id === e.custom!.trackerId)
  return !!t && !!counterField(t)
}

/** Tap-counter entries (one per cigarette) shown as one row per counter: total and first–last time. */
function counterSummaries(list: Entry[], trackers: TrackerDef[], timeZone: string) {
  const out: { id: string; name: string; total: number; span: string }[] = []
  for (const t of trackers) {
    const f = counterField(t)
    if (!f) continue
    const taps = list.filter((e) => e.custom?.trackerId === t.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    if (!taps.length) continue
    const total = taps.reduce((n, e) => n + (Number(e.custom!.values[f.key]) || 0), 0)
    const first = formatTime(taps[0].occurredAt, timeZone)
    const last = formatTime(taps[taps.length - 1].occurredAt, timeZone)
    out.push({ id: t.id, name: t.name, total, span: first === last ? first : `${first} – ${last}` })
  }
  return out
}

/** The day's habits — done ✓, partly 1/2, not done plain. A permanent record of each day. */
function DayHabits({ day, plan }: { day: string; plan: PlanItem[] }) {
  const rows = habitsForDay(plan, day)
  if (!rows.length) return null
  return (
    <p className="day-habits" aria-label="Habits">
      {rows.map((r) => (
        <span key={r.habit.id} className={`dh ${r.count >= r.times ? 'dh-done' : r.count ? 'dh-partial' : 'dh-open'}`}>
          {r.count >= r.times ? '✓ ' : ''}
          {r.habit.title}
          {r.times > 1 && r.count < r.times ? ` ${r.count}/${r.times}` : r.times > 1 ? ` ×${r.times}` : ''}
        </span>
      ))}
    </p>
  )
}

/** Trends (30 vs previous 30) and Signals (associations over 90 days) share one daily series. */
function Insights({ view }: { view: Exclude<View, 'days'> }) {
  const settings = useSettings()
  const today = useToday(settings)
  const from = addDays(today, -89)
  const data = useLiveQuery(async () => {
    const [entries, checkins, trackers, firstMoney] = await Promise.all([
      db.entries.where('localDate').between(from, today, true, true).toArray(),
      db.checkins.where('localDate').between(from, today, true, true).toArray(),
      db.trackers.toArray(),
      db.entries
        .orderBy('localDate')
        .filter((e) => !!e.money && !e.deletedAt)
        .first(),
    ])
    return { entries, checkins, trackers, moneySince: firstMoney?.localDate ?? null }
  }, [from, today])
  const rows = useMemo(
    () => (data ? dailySeries({ entries: data.entries, sets: [], checkins: data.checkins, trackers: data.trackers, from, to: today, moneySince: data.moneySince }) : null),
    [data, from, today],
  )
  if (!data || !rows) return null

  if (view === 'trends') {
    const list = trends(rows, today, data.trackers)
    return (
      <>
        <p className="muted pad-l">Last 30 days compared with the 30 before. Averages count only days you logged.</p>
        <div className="settings-group">
          {list.map((t) => (
            <TrendRow key={t.key} t={t} currency={settings.currency} />
          ))}
        </div>
      </>
    )
  }

  const signals = correlations(rows)
  const ready = signals.filter((s) => s.ready)
  const pending = signals.filter((s) => !s.ready)
  const splits = weekdayWeekend(rows)
  return (
    <>
      <div className="notice">
        <p>
          How your own numbers move together over the last 90 days. A signal appears once there are at least 14 days with both values.{' '}
          <strong>Association, not cause.</strong>
        </p>
      </div>
      {ready.length > 0 && (
        <section className="stack">
          {ready.map((s) => (
            <SignalCard key={s.id} s={s} />
          ))}
        </section>
      )}
      {pending.length > 0 && (
        <section className="group">
          <h2 className="section-label">Waiting for data</h2>
          <div className="settings-group">
            {pending.map((s) => (
              <div key={s.id} className="setting">
                <span className="truncate">
                  {s.xLabel} ↔ {s.yLabel}
                </span>
                <span className="setting-trail num">{Math.min(s.n, 14)} / 14 days</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="group">
        <h2 className="section-label">Weekdays vs weekends</h2>
        <div className="settings-group">
          {splits.map((w) => (
            <SplitRow key={w.metric} w={w} currency={settings.currency} />
          ))}
        </div>
      </section>
    </>
  )
}

function formatMetric(key: string, v: number, currency: string): string {
  if (key === 'spend') return formatMoney(v, currency)
  if (key === 'sleepMin') return formatDuration(v)
  if (key === 'weightKg') return `${formatNumber(v)} kg`
  if (key === 'workouts' || key === 'km') return formatNumber(v, 1)
  if (key === 'mood') return formatNumber(v, 1)
  return formatNumber(v, key.startsWith('tracker:') ? 2 : 0)
}

function TrendRow({ t, currency }: { t: Trend; currency: string }) {
  let sub = 'not logged'
  if (t.current != null && t.previous == null) sub = 'no earlier data'
  if (t.current != null && t.previous != null) {
    const change = t.current - t.previous
    const pct = t.previous ? Math.round((change / t.previous) * 100) : null
    // From zero a percentage means nothing — show the absolute change instead.
    const delta =
      t.key === 'sleepMin'
        ? Math.abs(change) < 1
          ? 'same'
          : `${change > 0 ? '+' : '−'}${formatDuration(Math.abs(change))}`
        : Math.abs(change) < 0.05
          ? 'same'
          : pct == null
            ? `${change > 0 ? '+' : '−'}${formatMetric(t.key, Math.abs(change), currency)}`
            : pct === 0
              ? 'same'
              : `${pct > 0 ? '+' : ''}${pct}%`
    sub = `was ${formatMetric(t.key, t.previous, currency)} · ${delta}`
  }
  return (
    <div className="setting trend-row">
      <span className="trend-label">
        <span>{t.label}</span>
        <span className="row-sub">{t.unit}</span>
      </span>
      <span className="trend-values num">
        <span className="trend-current">{t.current != null ? formatMetric(t.key, t.current, currency) : '—'}</span>
        <span className="row-sub">{sub}</span>
      </span>
    </div>
  )
}

function SignalCard({ s }: { s: Signal }) {
  const r = s.r ?? 0
  return (
    <article className="signal">
      <p className="signal-text">{describeSignal(s)}</p>
      <div className="signal-bar" aria-hidden="true">
        <span className="signal-mid" />
        <span className="signal-fill" style={r >= 0 ? { left: '50%', width: `${r * 50}%` } : { right: '50%', width: `${-r * 50}%` }} />
      </div>
      <p className="signal-meta num">
        <Icon name="trend" size={14} /> r = {formatNumber(r, 2)} · {s.strength} · n = {s.n}
        {s.ci95 ? ` · 95% CI ${formatNumber(s.ci95[0], 2)} to ${formatNumber(s.ci95[1], 2)}` : ''}
      </p>
    </article>
  )
}

function SplitRow({ w, currency }: { w: WeekSplit; currency: string }) {
  if (!w.ready || w.weekday == null || w.weekend == null) {
    return (
      <div className="setting">
        <span>{w.label}</span>
        <span className="setting-trail num">
          needs more days ({w.nWeekday}/8 weekdays, {w.nWeekend}/4 weekend)
        </span>
      </div>
    )
  }
  return (
    <div className="setting trend-row">
      <span className="trend-label">
        <span>{w.label}</span>
        <span className="row-sub num">
          n = {w.nWeekday} / {w.nWeekend}
        </span>
      </span>
      <span className="trend-values num">
        <span className="trend-current">{formatMetric(w.metric, w.weekend, currency)}</span>
        <span className="row-sub">weekends · weekdays {formatMetric(w.metric, w.weekday, currency)}</span>
      </span>
    </div>
  )
}
