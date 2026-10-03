import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { ACTIVITY_LABEL, activityOn, sleepSummary, weightSummary } from '../core/body'
import { addDays, formatDuration, formatLongDate, formatShortDate, hourIn, monthStart, weekdayOf, weekStart } from '../core/dates'
import { formatMoney, moneySummary } from '../core/money'
import { nutritionOn } from '../core/nutrition'
import { formatNumber } from '../core/numbers'
import { targetOn } from '../core/targets'
import { durationMin, finishedWorkouts, templatesOn, workoutsInWeek } from '../core/training'
import type { DayCheckin, Entry, ID, LocalDate, Target, WorkoutTemplate } from '../core/types'
import { db } from '../data/db'
import { startWorkout } from '../data/repo-training'
import { Bar } from '../ui/Bar'
import { DOMAIN, type DomainKey } from '../ui/domains'
import { openEntry } from '../ui/entryActions'
import { EntryRow } from '../ui/EntryRow'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { Ring } from '../ui/Ring'
import { openSheet } from '../ui/sheets'

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
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const catName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories])

  if (!entries || firstDay === undefined || !targets || !weights || checkin === undefined || !templates || activeWorkout === undefined) return null

  const todays = entries
    .filter((e) => e.localDate === today && !e.deletedAt)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const evening = hourIn(new Date(), settings.timezone) >= EVENING_HOUR

  return (
    <div className="screen">
      <header className="screen-head">
        <span className="eyebrow">{formatLongDate(today)}</span>
        <h1>Today</h1>
      </header>

      {!activeWorkout && <PlannedWorkout entries={entries} templates={templates} today={today} />}

      <CaloriesCard entries={entries} today={today} targets={targets} />

      <MoneyBlock entries={entries} today={today} targets={targets} firstDay={firstDay} currency={settings.currency} />

      <BodyTiles entries={entries} weights={weights} today={today} targets={targets} todays={todays} />

      <CheckinRow checkin={checkin} evening={evening} />

      <section aria-labelledby="entries-h">
        <h2 id="entries-h" className="section-title">
          Logged today
        </h2>
        {todays.length ? (
          <ul className="list with-icons">
            {todays.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                timeZone={settings.timezone}
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

function MoneyBlock({
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
  const diff = s.dailyAverage == null ? null : s.spentToday - s.dailyAverage
  return (
    <section className="block" aria-labelledby="money-h" style={tintStyle('money')}>
      <CardHead id="money-h" domain="money" />
      <p className="stat">
        <span className="stat-value num">{formatMoney(s.spentToday, cur)}</span>
        <span className="stat-unit">today</span>
      </p>
      {diff != null && Math.round(diff) !== 0 && (
        <p className="stat-note num">
          {formatMoney(Math.abs(diff), cur)} {diff < 0 ? 'below' : 'above'} your daily average
        </p>
      )}

      <div className="month">
        {s.budget != null && s.remainingMonth != null ? (
          <>
            <div className="month-line">
              <span className="num">{formatMoney(s.spentMonth, cur)} spent this month</span>
              <span className={`num ${s.remainingMonth < 0 ? 'over' : ''}`}>
                {s.remainingMonth < 0
                  ? `${formatMoney(-s.remainingMonth, cur)} over`
                  : `${formatMoney(s.remainingMonth, cur)} left`}
              </span>
            </div>
            <Bar value={s.spentMonth} max={s.budget} label="Monthly budget used" />
            {s.perDayLeft != null && s.perDayLeft > 0 && (
              <p className="stat-note num">{formatMoney(s.perDayLeft, cur)} a day for the rest of the month</p>
            )}
          </>
        ) : (
          <div className="month-line">
            <span className="num">{formatMoney(s.spentMonth, cur)} spent this month</span>
            <button type="button" className="btn-text" onClick={() => navigate('/me/targets')}>
              Set budget
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

const tintStyle = (d: DomainKey) => ({ '--tint': DOMAIN[d].tint }) as React.CSSProperties

/** Calories vs target as a ring, protein as a bar. Taps through to the day's nutrition. */
function CaloriesCard({ entries, today, targets }: { entries: Entry[]; today: LocalDate; targets: Target[] }) {
  const d = nutritionOn(entries, today)
  const kcal = d.totals.kcal ?? 0
  const target = targetOn(targets, 'kcal_daily', today)
  const protein = d.totals.proteinG
  const proteinTarget = targetOn(targets, 'protein_daily', today)
  const gap = (n: number) => `${d.unknown.kcal ? '≥' : ''}${formatNumber(n, 0)}`
  return (
    <button type="button" className="block" onClick={() => navigate('/nutrition')} style={tintStyle('food')}>
      <CardHead domain="food" label="Calories" chevron />
      <div className="cal-row">
        {target != null && (
          <Ring value={kcal} max={target} size={76} stroke={10} tint={DOMAIN.food.tint} label={`${formatNumber(kcal, 0)} of ${formatNumber(target, 0)} kcal`}>
            <span className="ring-pct num">{Math.round((kcal / target) * 100)}%</span>
          </Ring>
        )}
        <div className="grow">
          <p className="stat">
            <span className="stat-value num">{gap(kcal)}</span>
            <span className="stat-unit">{target != null ? `/ ${formatNumber(target, 0)} kcal` : 'kcal'}</span>
          </p>
          <p className="stat-note num">
            {d.count === 0
              ? 'Nothing logged yet'
              : target == null
                ? `${d.count} ${d.count === 1 ? 'item' : 'items'} today`
                : kcal <= target
                  ? `${formatNumber(target - kcal, 0)} left`
                  : `${formatNumber(kcal - target, 0)} over`}
            {d.unknown.kcal > 0 && ` · ${d.unknown.kcal} without kcal`}
          </p>
        </div>
      </div>
      {(protein != null || proteinTarget != null) && (
        <div className="month">
          <div className="month-line">
            <span>Protein</span>
            <span className="num">
              {protein == null ? '—' : `${d.unknown.proteinG ? '≥' : ''}${formatNumber(protein, 0)} g`}
              {proteinTarget != null && <span className="muted"> / {formatNumber(proteinTarget, 0)} g</span>}
            </span>
          </div>
          {proteinTarget != null && <Bar value={protein ?? 0} max={proteinTarget} label="Protein vs target" />}
        </div>
      )}
    </button>
  )
}

/** Domain icon + name heading a Today card. */
export function CardHead({ id, domain, label, chevron }: { id?: string; domain: DomainKey; label?: string; chevron?: boolean }) {
  return (
    <div className="card-head">
      <IconChip name={DOMAIN[domain].icon} tint={DOMAIN[domain].tint} size="sm" />
      <h2 id={id} className="block-label">
        {label ?? DOMAIN[domain].label}
      </h2>
      {chevron && <Icon name="chevronRight" size={18} className="chev" />}
    </div>
  )
}

function Tile({ domain, value, note, onClick }: { domain: DomainKey; value: string; note: string; onClick: () => void }) {
  const d = DOMAIN[domain]
  return (
    <button type="button" className="tile" onClick={onClick} style={tintStyle(domain)}>
      <span className="tile-head">
        <IconChip name={d.icon} tint={d.tint} size="sm" />
        <span className="tile-label">{d.label}</span>
      </span>
      <span className={`tile-value num ${value === '—' ? 'empty-value' : ''}`}>{value}</span>
      <span className="tile-note num">{note}</span>
    </button>
  )
}

const signed = (n: number, digits = 1) => `${n < 0 ? '−' : '+'}${formatNumber(Math.abs(n), digits)}`

function BodyTiles({
  entries,
  weights,
  today,
  targets,
  todays,
}: {
  entries: Entry[]
  weights: Entry[]
  today: LocalDate
  targets: Target[]
  todays: Entry[]
}) {
  const sleep = sleepSummary(entries, today)
  const lastNight = todays.find((e) => e.sleep)
  let sleepNote = 'Not logged'
  if (sleep.today != null) {
    const diff = sleep.average == null ? null : sleep.today - sleep.average
    sleepNote =
      diff == null
        ? 'No 30-day average yet'
        : Math.abs(diff) < 5
          ? 'Same as 30-day avg'
          : `${formatDuration(diff)} ${diff < 0 ? 'below' : 'above'} 30-day avg`
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
          : `${signed(weight.change)} kg vs ${weight.changeDays} days ago`
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
    <div className="tiles">
      <Tile
        domain="sleep"
        value={sleep.today != null ? formatDuration(sleep.today) : '—'}
        note={sleepNote}
        onClick={() => (lastNight ? openEntry(lastNight) : openSheet({ kind: 'sleep' }))}
      />
      <Tile
        domain="weight"
        value={weight ? `${formatNumber(weight.latest.value)} kg` : '—'}
        note={weightNote}
        onClick={() => openSheet({ kind: 'weight' })}
      />
      <Tile domain="activity" value={actValue} note={actNote} onClick={() => openSheet({ kind: 'activity' })} />
      <WorkoutTile entries={entries} today={today} targets={targets} />
    </div>
  )
}

function WorkoutTile({ entries, today, targets }: { entries: Entry[]; today: LocalDate; targets: Target[] }) {
  const week = workoutsInWeek(entries, weekStart(today))
  const target = targetOn(targets, 'workouts_week', today)
  const doneToday = finishedWorkouts(entries).find((w) => w.localDate === today)
  const mins = doneToday ? durationMin(doneToday) : null
  return (
    <Tile
      domain="workout"
      value={target != null ? `${week} / ${target}` : String(week)}
      note={doneToday ? `${doneToday.title}${mins != null ? ` · ${formatDuration(mins)}` : ''}` : week === 1 && target == null ? 'workout this week' : 'this week'}
      onClick={() => navigate('/training')}
    />
  )
}

/** "Pull Day · Start" for templates planned today that haven't been done today. */
function PlannedWorkout({ entries, templates, today }: { entries: Entry[]; templates: WorkoutTemplate[]; today: LocalDate }) {
  const doneToday = new Set(finishedWorkouts(entries).flatMap((w) => (w.localDate === today && w.workout!.templateId ? [w.workout!.templateId] : [])))
  const planned = templatesOn(templates, weekdayOf(today)).filter((t) => !doneToday.has(t.id))
  if (!planned.length) return null
  const t = planned[0]
  return (
    <div className="block planned" style={tintStyle('workout')}>
      <div className="planned-row">
        <IconChip name="workout" tint={DOMAIN.workout.tint} size="md" />
        <div className="grow">
          <p className="planned-name">{t.name}</p>
          <p className="row-sub">
            Planned today · {t.exercises.length} {t.exercises.length === 1 ? 'exercise' : 'exercises'}
            {planned.length > 1 ? ` · +${planned.length - 1} more` : ''}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={async () => {
            await startWorkout(t)
            navigate('/workout')
          }}
        >
          <Icon name="play" size={16} />
          Start
        </button>
      </div>
    </div>
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
