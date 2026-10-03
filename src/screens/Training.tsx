import { useLiveQuery } from '../ui/live'
import { useMemo, useState } from 'react'
import { formatDuration, formatShortDate, weekStart } from '../core/dates'
import { formatKg } from '../core/numbers'
import { targetOn } from '../core/targets'
import { countsAsWork, durationMin, epley, finishedWorkouts, volumeOf, workoutsInWeek } from '../core/training'
import type { ID, WorkoutSet } from '../core/types'
import { db } from '../data/db'
import { DOMAIN } from '../ui/domains'
import { Segmented, SubHead } from '../ui/fields'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { openSheet } from '../ui/sheets'

/** Training history and per-exercise progress. */
export function Training() {
  const settings = useSettings()
  const today = useToday(settings)
  const entries = useLiveQuery(() => db.entries.where('kind').equals('workout').toArray(), [])
  const sets = useLiveQuery(() => db.sets.filter((s) => !s.deletedAt && !!s.doneAt).toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const targets = useLiveQuery(() => db.targets.toArray(), [])
  const [tab, setTab] = useState<'workouts' | 'exercises'>('workouts')

  const workouts = useMemo(() => (entries ? finishedWorkouts(entries) : []), [entries])
  const live = useMemo(() => new Set(workouts.map((w) => w.id)), [workouts])
  const setsByEntry = useMemo(() => {
    const m = new Map<ID, WorkoutSet[]>()
    for (const s of sets ?? []) if (live.has(s.entryId)) m.set(s.entryId, [...(m.get(s.entryId) ?? []), s])
    return m
  }, [sets, live])
  const perExercise = useMemo(() => {
    const m = new Map<ID, { best: number | null; last: string; sessions: Set<ID> }>()
    const dateOf = new Map(workouts.map((w) => [w.id, w.localDate]))
    for (const [entryId, list] of setsByEntry) {
      for (const s of list.filter(countsAsWork)) {
        const cur = m.get(s.exerciseId) ?? { best: null, last: '', sessions: new Set<ID>() }
        if (s.weightKg != null) cur.best = Math.max(cur.best ?? 0, epley(s.weightKg, s.reps!))
        const d = dateOf.get(entryId)!
        if (d > cur.last) cur.last = d
        cur.sessions.add(entryId)
        m.set(s.exerciseId, cur)
      }
    }
    return [...m.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last))
  }, [setsByEntry, workouts])

  if (!entries || !sets || !exercises || !targets) return null
  const names = new Map(exercises.map((e) => [e.id, e.name]))
  const week = workoutsInWeek(entries, weekStart(today))
  const target = targetOn(targets, 'workouts_week', today)

  return (
    <div className="screen">
      <SubHead title="Training" back={() => navigate('/')} />

      <section className="block" style={{ '--tint': DOMAIN.workout.tint } as React.CSSProperties}>
        <div className="card-head">
          <IconChip name="workout" tint={DOMAIN.workout.tint} size="sm" />
          <h2 className="block-label">This week</h2>
        </div>
        <p className="stat">
          <span className="stat-value num">{week}</span>
          <span className="stat-unit">{target != null ? `of ${target} workouts` : week === 1 ? 'workout' : 'workouts'}</span>
        </p>
        <button type="button" className="btn btn-primary full mt-8" onClick={() => openSheet({ kind: 'workout-start' })}>
          <Icon name="play" size={18} />
          Start workout
        </button>
      </section>

      <Segmented
        label="View"
        options={[
          { value: 'workouts', label: 'Workouts' },
          { value: 'exercises', label: 'Exercises' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'workouts' ? (
        workouts.length ? (
          <ul className="list with-icons">
            {workouts.map((w) => {
              const own = setsByEntry.get(w.id) ?? []
              const mins = durationMin(w)
              const n = own.filter(countsAsWork).length
              return (
                <li key={w.id} className="list-row">
                  <span className="row-icon">
                    <IconChip name="workout" tint={DOMAIN.workout.tint} />
                  </span>
                  <button type="button" className="row-main" onClick={() => openSheet({ kind: 'workout-summary', entryId: w.id })}>
                    <span className="row-title">{w.title}</span>
                    <span className="row-sub num">
                      {formatShortDate(w.localDate)} · {n} {n === 1 ? 'set' : 'sets'} · {formatKg(volumeOf(own), 0)}
                    </span>
                  </button>
                  {mins != null && <span className="row-side num">{formatDuration(mins)}</span>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted pad-l">Finished workouts appear here.</p>
        )
      ) : perExercise.length ? (
        <ul className="list">
          {perExercise.map(([id, x]) => (
            <li key={id} className="list-row">
              <button type="button" className="row-main" onClick={() => openSheet({ kind: 'exercise', exerciseId: id })}>
                <span className="row-title">{names.get(id) ?? 'Exercise'}</span>
                <span className="row-sub num">
                  {formatShortDate(x.last)} · {x.sessions.size} {x.sessions.size === 1 ? 'session' : 'sessions'}
                </span>
              </button>
              {x.best != null && (
                <span className="row-side num" title="Best estimated 1RM">
                  {formatKg(Math.round(x.best * 10) / 10)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted pad-l">Exercises you train appear here with their best estimated 1RM.</p>
      )}

      <button type="button" className="btn-text center-self" onClick={() => navigate('/me/training')}>
        Templates & exercises
        <Icon name="chevronRight" size={16} strokeWidth={2.2} />
      </button>
    </div>
  )
}
