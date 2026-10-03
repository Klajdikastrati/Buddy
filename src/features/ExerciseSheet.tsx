import { useLiveQuery } from 'dexie-react-hooks'
import { formatShortDate } from '../core/dates'
import { formatKg, formatNumber } from '../core/numbers'
import { exerciseSessions } from '../core/training'
import type { ID } from '../core/types'
import { db } from '../data/db'
import { DOMAIN } from '../ui/domains'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { Sparkline } from '../ui/Sparkline'

/** One exercise over time: best estimated 1RM per session, newest first. */
export function ExerciseSheet({ exerciseId }: { exerciseId: ID }) {
  const data = useLiveQuery(async () => {
    const [exercise, entries, sets] = await Promise.all([
      db.exercises.get(exerciseId),
      db.entries.where('kind').equals('workout').toArray(),
      db.sets.where('exerciseId').equals(exerciseId).toArray(),
    ])
    return { exercise, sessions: exerciseSessions(exerciseId, entries, sets) }
  }, [exerciseId])
  if (!data) return null
  const { exercise, sessions } = data
  const e1rms = sessions.flatMap((s) => (s.e1rm == null ? [] : [s.e1rm]))
  const best = e1rms.length ? Math.max(...e1rms) : null

  return (
    <Sheet open onClose={closeSheet} title={exercise?.name ?? 'Exercise'}>
      <div className="stats3">
        <div>
          <span className="summary-value num">{best != null ? formatKg(best) : '—'}</span>
          <span className="summary-label">Best est. 1RM</span>
        </div>
        <div>
          <span className="summary-value num">{sessions.length}</span>
          <span className="summary-label">Sessions</span>
        </div>
        <div>
          <span className="summary-value num">{sessions.length ? formatShortDate(sessions[sessions.length - 1].localDate).replace(/^\w+ /, '') : '—'}</span>
          <span className="summary-label">Last done</span>
        </div>
      </div>
      {e1rms.length >= 2 && (
        <div className="spark-card">
          <span className="summary-label">Estimated 1RM per session</span>
          <Sparkline values={e1rms} tint={DOMAIN.workout.tint} label="Estimated 1RM trend" />
        </div>
      )}
      {sessions.length ? (
        <ul className="list">
          {[...sessions].reverse().map((s) => (
            <li key={s.entryId} className="list-row">
              <span className="row-main static">
                <span className="row-title num">{s.best ? `${formatNumber(s.best.weightKg)} kg × ${s.best.reps}` : `${s.sets} sets`}</span>
                <span className="row-sub num">
                  {formatShortDate(s.localDate)} · {s.sets} {s.sets === 1 ? 'set' : 'sets'} · {formatKg(s.volume, 0)}
                </span>
              </span>
              {s.e1rm != null && <span className="row-side num">{formatKg(s.e1rm)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Not done yet.</p>
      )}
    </Sheet>
  )
}
