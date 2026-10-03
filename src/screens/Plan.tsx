import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { formatDayLabel, formatLongDate, formatShortDate } from '../core/dates'
import { planFor } from '../core/plan'
import { db } from '../data/db'
import { addPlanItem } from '../data/repo-plan'
import { useSettings, useToday } from '../ui/hooks'
import { Icon } from '../ui/icons'
import { PlanRow } from '../ui/PlanRow'
import { openSheet } from '../ui/sheets'

/** Light structure: today's tasks, routines, the week's goals, what's coming. */
export function Plan() {
  const today = useToday(useSettings())
  const items = useLiveQuery(() => db.plan.toArray(), [])
  const [draft, setDraft] = useState('')
  if (!items) return null
  const p = planFor(items, today)
  const empty = !p.today.length && !p.overdue.length && !p.routines.length && !p.goals.length && !p.upcoming.length && !p.someday.length

  return (
    <div className="screen">
      <header className="screen-head row-between">
        <div>
          <span className="eyebrow">{formatLongDate(today)}</span>
          <h1>Plan</h1>
        </div>
        <button type="button" className="icon-btn big" aria-label="Add to plan" onClick={() => openSheet({ kind: 'plan-item' })}>
          <Icon name="plus" size={20} strokeWidth={2.4} />
        </button>
      </header>

      <section aria-labelledby="plan-today">
        <h2 id="plan-today" className="section-title">
          Today
        </h2>
        <ul className="list plan-list">
          {p.overdue.map((t) => (
            <PlanRow key={t.id} item={t} today={today} sub={`From ${formatDayLabel(t.localDate!, today)}`} />
          ))}
          {p.today.map((t) => (
            <PlanRow key={t.id} item={t} today={today} />
          ))}
        </ul>
        <form
          className="row-gap quick-task"
          onSubmit={(e) => {
            e.preventDefault()
            if (!draft.trim()) return
            void addPlanItem({ kind: 'task', title: draft, localDate: today, weekdays: [] })
            setDraft('')
          }}
        >
          <input className="input grow" autoComplete="off" placeholder="Add a task for today…" aria-label="New task for today" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="btn btn-quiet" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      </section>

      {p.routines.length > 0 && (
        <section aria-labelledby="plan-routines">
          <h2 id="plan-routines" className="section-title">
            Routines
          </h2>
          <ul className="list plan-list">
            {p.routines.map((r) => (
              <PlanRow key={r.id} item={r} today={today} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="plan-goals">
        <div className="row-between">
          <h2 id="plan-goals" className="section-title">
            This week
          </h2>
          <button type="button" className="btn-text" onClick={() => openSheet({ kind: 'plan-item', planKind: 'goal' })}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            Goal
          </button>
        </div>
        {p.goals.length ? (
          <ul className="list plan-list">
            {p.goals.map((g) => (
              <PlanRow key={g.id} item={g} today={today} />
            ))}
          </ul>
        ) : (
          <p className="muted pad-l">No goals for this week.</p>
        )}
      </section>

      {(p.upcoming.length > 0 || p.someday.length > 0) && (
        <section aria-labelledby="plan-later">
          <h2 id="plan-later" className="section-title">
            Later
          </h2>
          <ul className="list plan-list">
            {p.upcoming.map((t) => (
              <PlanRow key={t.id} item={t} today={today} sub={formatShortDate(t.localDate!)} />
            ))}
            {p.someday.map((t) => (
              <PlanRow key={t.id} item={t} today={today} sub="Someday" />
            ))}
          </ul>
        </section>
      )}

      {empty && <p className="muted pad-l">Tasks, routines and weekly goals live here. Today shows your top three.</p>}

      <button type="button" className="btn-text center-self" onClick={() => openSheet({ kind: 'plan-item', planKind: 'routine' })}>
        <Icon name="repeat" size={16} />
        New routine
      </button>
    </div>
  )
}
