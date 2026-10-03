import { useLiveQuery } from '../ui/live'
import { formatDuration, formatShortDate, formatTime } from '../core/dates'
import { formatKg as kg, formatNumber } from '../core/numbers'
import { countsAsWork, summarizeWorkout } from '../core/training'
import type { Entry, Exercise, ID, WorkoutSet } from '../core/types'
import { db } from '../data/db'
import { discardWorkout, restoreWorkout } from '../data/repo-training'
import { DOMAIN } from '../ui/domains'
import { navigate, useSettings } from '../ui/hooks'
import { IconChip } from '../ui/icons'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

const setText = (s: WorkoutSet) => (s.weightKg != null ? `${formatNumber(s.weightKg)} × ${s.reps}` : `${s.reps} reps`)

/** Everything a workout summary needs: the workout, earlier workouts, and the sets of its exercises. */
export function useWorkoutData(entryId: ID) {
  return useLiveQuery(async () => {
    const entry = await db.entries.get(entryId)
    if (!entry?.workout) return null
    const own = await db.sets.where('entryId').equals(entryId).toArray()
    const ids = [...new Set(own.map((s) => s.exerciseId))]
    const [entries, sets, exercises] = await Promise.all([
      db.entries.where('kind').equals('workout').toArray(),
      ids.length ? db.sets.where('exerciseId').anyOf(ids).toArray() : Promise.resolve([] as WorkoutSet[]),
      db.exercises.toArray(),
    ])
    return { entry, entries, sets, exercises: new Map(exercises.map((e) => [e.id, e])) }
  }, [entryId])
}

/** Duration, sets, volume, change vs the last same-template workout, PRs, and what was done. */
export function WorkoutSummaryView({ entry, entries, sets, exercises }: { entry: Entry; entries: Entry[]; sets: WorkoutSet[]; exercises: Map<ID, Exercise> }) {
  const s = summarizeWorkout(entry, entries, sets)
  const name = (id: ID) => exercises.get(id)?.name ?? 'Exercise'
  const pct = s.previous && s.previous.volume > 0 && s.volumeChange != null ? Math.round((s.volumeChange / s.previous.volume) * 100) : null
  const own = sets.filter((x) => x.entryId === entry.id && countsAsWork(x))
  const byExercise = [...new Set(own.sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex).map((x) => x.exerciseId))]

  return (
    <>
      <div className="stats3">
        <div>
          <span className="summary-value num">{s.durationMin != null ? formatDuration(s.durationMin) : '—'}</span>
          <span className="summary-label">Duration</span>
        </div>
        <div>
          <span className="summary-value num">{s.sets}</span>
          <span className="summary-label">Sets</span>
        </div>
        <div>
          <span className="summary-value num">{kg(s.volume, 0)}</span>
          <span className="summary-label">Volume</span>
        </div>
      </div>
      {s.previous && s.volumeChange != null && (
        <p className="stat-note num">
          {s.volumeChange === 0
            ? 'Same volume as'
            : `${s.volumeChange > 0 ? '+' : '−'}${kg(Math.abs(s.volumeChange), 0)}${pct ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''} volume vs`}{' '}
          {entry.title} on {formatShortDate(s.previous.localDate)}
        </p>
      )}

      {s.prs.length > 0 && (
        <section>
          <h3 className="section-label">Personal records</h3>
          <ul className="list with-icons">
            {s.prs.map((pr) => (
              <li key={pr.exerciseId + pr.kind} className="list-row">
                <span className="row-icon">
                  <IconChip name="trend" tint={DOMAIN.workout.tint} />
                </span>
                <span className="row-main static">
                  <span className="row-title">{name(pr.exerciseId)}</span>
                  <span className="row-sub num">
                    {pr.kind === 'weight' ? 'Heaviest weight' : 'Estimated 1RM'} · was {kg(pr.previous)}
                  </span>
                </span>
                <span className="row-side num">{kg(pr.value)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {byExercise.length > 0 && (
        <section>
          <h3 className="section-label">Exercises</h3>
          <ul className="list">
            {byExercise.map((id) => (
              <li key={id} className="list-row">
                <span className="row-main static">
                  <span className="row-title">{name(id)}</span>
                  <span className="row-sub num">
                    {own
                      .filter((x) => x.exerciseId === id)
                      .map(setText)
                      .join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** A past workout, opened from History / Training / Today's list. */
export function WorkoutSummarySheet({ entryId }: { entryId: ID }) {
  const settings = useSettings()
  const data = useWorkoutData(entryId)
  if (data === undefined) return null
  if (data === null) {
    return (
      <Sheet open onClose={closeSheet} title="Workout">
        <p className="muted">This workout no longer exists.</p>
      </Sheet>
    )
  }
  const { entry } = data
  const active = !entry.workout!.endedAt

  async function remove() {
    const undo = await discardWorkout(entryId)
    closeSheet()
    toast(`Deleted ${entry.title}`, { label: 'Undo', run: () => void restoreWorkout(entryId, undo) })
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={entry.title}
      footer={
        <div className="row-gap">
          <button type="button" className="btn btn-quiet danger" onClick={() => void remove()}>
            Delete
          </button>
          {active && (
            <button
              type="button"
              className="btn btn-primary grow"
              onClick={() => {
                closeSheet()
                navigate('/workout')
              }}
            >
              Resume
            </button>
          )}
        </div>
      }
    >
      <p className="muted num">
        {formatShortDate(entry.localDate)} · {formatTime(entry.workout!.startedAt, settings.timezone)}
        {active ? ' · in progress' : ''}
      </p>
      <WorkoutSummaryView {...data} />
    </Sheet>
  )
}
