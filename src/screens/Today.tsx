import { useLiveQuery } from '../ui/live'
import { useEffect, useMemo, useState } from 'react'
import { ACTIVITY_LABEL, activityOn, sleepSummary, weightSummary } from '../core/body'
import { counterField, counterStats, formatGap } from '../core/counter'
import { addDays, formatDuration, formatShortDate, hourIn, monthStart, weekdayOf, weekStart } from '../core/dates'
import { formatMoney, moneySummary } from '../core/money'
import { nutritionOn } from '../core/nutrition'
import { priorities } from '../core/plan'
import { formatNumber } from '../core/numbers'
import { targetOn } from '../core/targets'
import { durationMin, finishedWorkouts, templatesOn, workoutsInWeek } from '../core/training'
import type { DayCheckin, Entry, ID, LocalDate, Target, TrackerDef, WorkoutTemplate } from '../core/types'
import { db } from '../data/db'
import { setEntryDeleted } from '../data/repo'
import { logTracker } from '../data/repo-trackers'
import { Bar } from '../ui/Bar'
import { DOMAIN, type DomainKey } from '../ui/domains'
import { EntryRow } from '../ui/EntryRow'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { PlanRow } from '../ui/PlanRow'
import { openSheet } from '../ui/sheets'
import { toast } from '../ui/toast'

/** After this hour (local) Today asks for the day's check-in if it's missing. */
const EVENING_HOUR = 19

export function Today() {
  const settings = useSettings()
  const today = useToday(settings)
  const from = [monthStart(today), addDays(today, -30)].sort()[0]

  const entries = useLiveQuery(() => db.entries.where('localDate').aboveOrEqual(from).toArray(), [from])
  const firstDay = useLiveQuery(async () => {
    const first = await db.entries.orderBy('localDate').filter((e) => !e.deletedAt).first()
    return first?.localDate ?? null
  }, [])
  const targets = useLiveQuery(() => db.targets.toArray(), [])
  const weights = useLiveQuery(() => db.entries.where('kind').equals('weight').toArray(), [])
  const checkin = useLiveQuery(async () => (await db.checkins.get(today)) ?? null, [today])
  const templates = useLiveQuery(() => db.templates.filter((t) => !t.deletedAt && !t.archived).toArray(), [])
  const activeWorkout = useLiveQuery(async () => ((await db.meta.get('activeWorkout'))?.value as ID | undefined) ?? null, [])
  const plan = useLiveQuery(() => db.plan.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const catName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories])
  const trackers = useLiveQuery(() => db.trackers.toArray(), [])
  const trackerById = useMemo(() => new Map(trackers?.map((t) => [t.id, t])), [trackers])

  if (!entries || firstDay === undefined || !targets || !weights || checkin === undefined || !templates || activeWorkout === undefined || !plan)
    return null
  const top = priorities(plan, today)

  const counters = (trackers ?? []).filter((t) => !t.deletedAt && !t.archived && counterField(t))
  const todays = entries
    .filter((e) => e.localDate === today && !e.deletedAt && !(e.custom && counters.some((c) => c.id === e.custom!.trackerId)))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const evening = hourIn(new Date(), settings.timezone) >= EVENING_HOUR

  return (
    <div className="screen today">
      <header className="today-head">
        <h1>Today</h1>
        <span className="today-date">{formatShortDate(today)}</span>
      </header>

      <div className="tiles">
        <CaloriesTile entries={entries} today={today} targets={targets} />
        <MoneyTile entries={entries} today={today} targets={targets} firstDay={firstDay} currency={settings.currency} />
        <BodyTiles entries={entries} weights={weights} today={today} targets={targets} />
        <WorkoutTile entries={entries} today={today} targets={targets} templates={templates} active={activeWorkout} />
      </div>

      {counters.map((c) => (
        <CounterCard key={c.id} def={c} today={today} />
      ))}

      {top.shown.length > 0 && (
        <section aria-labelledby="prio-h">
          <div className="label-row">
            <h2 id="prio-h" className="section-label">
              Priorities
            </h2>
            <button type="button" className="btn-text small" onClick={() => navigate('/plan')}>
              {top.more ? `+${top.more} more` : 'Plan'}
              <Icon name="chevronRight" size={14} strokeWidth={2.4} />
            </button>
          </div>
          <ul className="list plan-list dense">
            {top.shown.map((t) => (
              <PlanRow key={t.id} item={t} today={today} sub={t.localDate && t.localDate < today ? `From ${formatShortDate(t.localDate)}` : undefined} />
            ))}
          </ul>
        </section>
      )}

      <CheckinRow checkin={checkin} evening={evening} />

      <section aria-labelledby="entries-h">
        <h2 id="entries-h" className="section-label">
          Logged today
        </h2>
        {todays.length ? (
          <ul className="list with-icons dense">
            {todays.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                timeZone={settings.timezone}
                tracker={e.custom ? trackerById.get(e.custom.trackerId) : undefined}
                categoryName={e.money && !e.nutrition && e.money.categoryId ? catName.get(e.money.categoryId) : undefined}
              />
            ))}
          </ul>
        ) : (
          <div className="empty empty-card">
            <p>Nothing logged today.</p>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => openSheet({ kind: 'quick-add' })}>
              <Icon name="plus" size={18} strokeWidth={2.2} />
              Add
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

const tintStyle = (d: DomainKey) => ({ '--tint': DOMAIN[d].tint }) as React.CSSProperties

/** Compact tile: label, one number (+ small unit), optional progress bar, a short note (at most 2 lines). */
function Tile({
  domain,
  label,
  value,
  unit,
  note,
  bar,
  onClick,
}: {
  domain: DomainKey
  label?: string
  value: string
  unit?: string
  note: string
  bar?: { value: number; max: number; label: string }
  onClick: () => void
}) {
  const d = DOMAIN[domain]
  return (
    <button type="button" className="tile" onClick={onClick} style={tintStyle(domain)}>
      <span className="tile-head">
        <IconChip name={d.icon} tint={d.tint} size="sm" />
        <span className="tile-label">{label ?? d.label}</span>
      </span>
      <span className={`tile-value num ${value === '—' ? 'empty-value' : ''}`}>
        {value}
        {unit && <span className="tile-unit"> {unit}</span>}
      </span>
      {bar && <Bar value={bar.value} max={bar.max} label={bar.label} />}
      <span className="tile-note num">{note}</span>
    </button>
  )
}

/** Calories vs target (bar) and protein. Taps through to the day's nutrition. */
function CaloriesTile({ entries, today, targets }: { entries: Entry[]; today: LocalDate; targets: Target[] }) {
  const d = nutritionOn(entries, today)
  const kcal = d.totals.kcal ?? 0
  const target = targetOn(targets, 'kcal_daily', today)
  const protein = d.totals.proteinG
  const proteinTarget = targetOn(targets, 'protein_daily', today)
  const parts = [
    d.count === 0 ? 'Nothing logged' : target == null ? null : kcal <= target ? `${formatNumber(target - kcal, 0)} left` : `${formatNumber(kcal - target, 0)} over`,
    d.count ? `P ${formatNumber(protein ?? 0, 0)}${proteinTarget != null ? `/${formatNumber(proteinTarget, 0)}` : ''} · C ${formatNumber(d.totals.carbsG ?? 0, 0)} · F ${formatNumber(d.totals.fatG ?? 0, 0)} g` : null,
  ]
  return (
    <Tile
      domain="food"
      label="Calories"
      value={`${d.unknown.kcal ? '≥' : ''}${formatNumber(kcal, 0)}`}
      unit={target != null ? `/ ${formatNumber(target, 0)}` : 'kcal'}
      bar={target != null ? { value: kcal, max: target, label: 'Calories vs target' } : undefined}
      note={parts.filter(Boolean).join(' · ') || `${d.count} ${d.count === 1 ? 'item' : 'items'}`}
      onClick={() => navigate('/nutrition')}
    />
  )
}

/** Spent today; with a budget, how much is left this month and per day. */
function MoneyTile({
  entries,
  today,
  targets,
  firstDay,
  currency: cur,
}: {
  entries: Entry[]
  today: LocalDate
  targets: Target[]
  firstDay: LocalDate | null
  currency: string
}) {
  const s = moneySummary(entries, today, targetOn(targets, 'budget_month', today), firstDay)
  // The big number already says "Lek"; the note stays short enough for one line.
  const amt = (n: number) => (cur === 'ALL' ? formatNumber(n, 0) : formatMoney(n, cur))
  let note = `${amt(s.spentMonth)} this month`
  if (s.budget != null && s.remainingMonth != null) {
    note =
      s.remainingMonth < 0
        ? `${amt(-s.remainingMonth)} over budget`
        : `${amt(s.remainingMonth)} left${s.perDayLeft != null && s.perDayLeft > 0 ? ` · ${amt(s.perDayLeft)}/day` : ''}`
  }
  return (
    <Tile
      domain="money"
      value={formatMoney(s.spentToday, cur)}
      bar={s.budget != null ? { value: s.spentMonth, max: s.budget, label: 'Monthly budget used' } : undefined}
      note={note}
      onClick={() => navigate('/money')}
    />
  )
}

const signed = (n: number, digits = 1) => `${n < 0 ? '−' : '+'}${formatNumber(Math.abs(n), digits)}`

function BodyTiles({
  entries,
  weights,
  today,
  targets,
}: {
  entries: Entry[]
  weights: Entry[]
  today: LocalDate
  targets: Target[]
}) {
  const sleep = sleepSummary(entries, today)
  let sleepNote = 'Not logged'
  if (sleep.today != null) {
    const diff = sleep.average == null ? null : sleep.today - sleep.average
    sleepNote =
      diff == null ? 'No average yet' : Math.abs(diff) < 5 ? 'Same as 30-day avg' : `${diff < 0 ? '−' : '+'}${formatDuration(diff)} vs 30-day avg`
  }

  const weight = weightSummary(weights)
  let weightNote = 'Not logged'
  if (weight) {
    weightNote =
      weight.change == null
        ? weight.latest.localDate === today
          ? 'Today'
          : formatShortDate(weight.latest.localDate)
        : weight.change === 0
          ? `Same as ${weight.changeDays} days ago`
          : `${signed(weight.change)} kg in ${weight.changeDays} days`
  }

  const act = activityOn(entries, today)
  const stepsTarget = targetOn(targets, 'steps_daily', today)
  const actValue =
    act.minutes != null
      ? formatDuration(act.minutes)
      : act.km != null
        ? `${formatNumber(act.km, 2)} km`
        : act.steps != null
          ? formatNumber(act.steps, 0)
          : '—'
  const actNote = act.count
    ? [
        act.minutes != null && act.km != null ? `${formatNumber(act.km, 2)} km` : null,
        act.steps != null && (act.minutes != null || act.km != null)
          ? `${formatNumber(act.steps, 0)} steps`
          : act.steps != null && stepsTarget != null
            ? `of ${formatNumber(stepsTarget, 0)} steps`
            : act.steps != null
              ? 'steps'
              : null,
        act.types.map((t) => ACTIVITY_LABEL[t]).join(', '),
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Nothing yet'

  return (
    <>
      <Tile
        domain="sleep"
        value={sleep.today != null ? formatDuration(sleep.today) : '—'}
        note={sleepNote}
        onClick={() => navigate('/sleep')}
      />
      <Tile
        domain="weight"
        value={weight ? `${formatNumber(weight.latest.value)} kg` : '—'}
        note={weightNote}
        onClick={() => navigate('/weight')}
      />
      <Tile domain="activity" value={actValue} note={actNote} onClick={() => navigate('/activity')} />
    </>
  )
}

/** In progress → resume; planned today → start; otherwise workouts this week. */
function WorkoutTile({
  entries,
  today,
  targets,
  templates,
  active,
}: {
  entries: Entry[]
  today: LocalDate
  targets: Target[]
  templates: WorkoutTemplate[]
  active: ID | null
}) {
  const week = workoutsInWeek(entries, weekStart(today))
  const target = targetOn(targets, 'workouts_week', today)
  const finished = finishedWorkouts(entries)
  const doneToday = finished.find((w) => w.localDate === today)
  const doneTemplates = new Set(finished.flatMap((w) => (w.localDate === today && w.workout!.templateId ? [w.workout!.templateId] : [])))
  const planned = templatesOn(templates, weekdayOf(today)).filter((t) => !doneTemplates.has(t.id))

  if (active) return <Tile domain="workout" value="In progress" note="Tap to resume" onClick={() => navigate('/workout')} />
  if (planned.length) {
    return (
      <Tile
        domain="workout"
        value={planned[0].name}
        note={`Planned today${planned.length > 1 ? ` · +${planned.length - 1}` : ''}`}
        onClick={() => navigate('/training')}
      />
    )
  }
  const mins = doneToday ? durationMin(doneToday) : null
  return (
    <Tile
      domain="workout"
      value={target != null ? `${week} / ${target}` : String(week)}
      note={doneToday ? `${doneToday.title}${mins != null ? ` · ${formatDuration(mins)}` : ''}` : 'this week'}
      onClick={() => navigate('/training')}
    />
  )
}

function CheckinRow({ checkin, evening }: { checkin: DayCheckin | null; evening: boolean }) {
  const parts = checkin
    ? (
        [
          ['Mood', checkin.mood],
          ['Energy', checkin.energy],
          ['Stress', checkin.stress],
          ['Productivity', checkin.productivity],
        ] as const
      ).flatMap(([label, v]) => (v == null ? [] : [`${label} ${v}`]))
    : []
  if (checkin && (parts.length || checkin.note)) {
    return (
      <button type="button" className="setting setting-button" onClick={() => openSheet({ kind: 'checkin' })}>
        <span className="setting-lead">
          <IconChip name="checkin" tint={DOMAIN.checkin.tint} size="sm" />
          Check-in
        </span>
        <span className="setting-trail num">
          <span className="truncate">{parts.join(' · ') || 'Note'}</span>
        </span>
      </button>
    )
  }
  if (!evening) return null
  return (
    <div className="empty prompt">
      <p>
        <IconChip name="checkin" tint={DOMAIN.checkin.tint} size="sm" />
        How was today?
      </p>
      <button type="button" className="btn btn-primary btn-small" onClick={() => openSheet({ kind: 'checkin' })}>
        Check in
      </button>
    </div>
  )
}

/**
 * One tap = one more (e.g. a cigarette). Shows today's count, time since the
 * last one (live) and the longest gap since counting started.
 */
function CounterCard({ def, today }: { def: TrackerDef; today: LocalDate }) {
  const taps = useLiveQuery(() => db.entries.where('kind').equals('custom').filter((e) => e.custom?.trackerId === def.id).toArray(), [def.id])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  if (!taps) return null
  const field = counterField(def)!
  const s = counterStats(taps, def, today, addDays(today, -1), now)
  const tint = { '--tint': DOMAIN.tracker.tint } as React.CSSProperties

  async function add() {
    const t = new Date().toISOString()
    setNow(Date.parse(t))
    const id = await logTracker(def, { [field.key]: 1 }, t, null)
    toast(`${def.name}: ${s.today + 1} today`, { label: 'Undo', run: () => setEntryDeleted(id, true) })
  }

  return (
    <section className="counter" style={tint} aria-label={def.name}>
      <button type="button" className="counter-main" onClick={() => openSheet({ kind: 'tracker-log', trackerId: def.id })} aria-label={`${def.name}: log with a different number or time`}>
        <span className="counter-head">
          <span className="block-label">{def.name}</span>
          <span className="counter-count num">
            {s.today}
            <span className="muted"> today{s.yesterday ? ` · ${s.yesterday} yesterday` : ''}</span>
          </span>
        </span>
        <span className="counter-stats num">
          <span>
            <span className="muted">Last </span>
            {s.sinceLastMin == null ? '—' : s.sinceLastMin < 1 ? 'just now' : `${formatGap(s.sinceLastMin)} ago`}
          </span>
          <span>
            <span className="muted">Longest gap </span>
            {s.longestMin == null || s.longestMin < 1 ? '—' : formatGap(s.longestMin)}
          </span>
        </span>
      </button>
      <button type="button" className="counter-add" aria-label={`Add one ${def.name.toLowerCase()}`} onClick={() => void add()}>
        <Icon name="plus" size={26} strokeWidth={2.6} />
      </button>
    </section>
  )
}
