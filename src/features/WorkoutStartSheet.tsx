import { useLiveQuery } from 'dexie-react-hooks'
import { formatWeekdays, weekdayOf } from '../core/dates'
import type { ID, WorkoutTemplate } from '../core/types'
import { db } from '../data/db'
import { startWorkout } from '../data/repo-training'
import { DOMAIN } from '../ui/domains'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { closeSheet, openSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'

/** Pick what to train: today's planned templates first, then the rest, or an empty workout. */
export function WorkoutStartSheet() {
  const today = useToday(useSettings())
  const templates = useLiveQuery(() => db.templates.filter((t) => !t.deletedAt && !t.archived).toArray(), [])
  const active = useLiveQuery(async () => {
    const id = (await db.meta.get('activeWorkout'))?.value as ID | undefined
    return id ? ((await db.entries.get(id)) ?? null) : null
  }, [])
  if (!templates || active === undefined) return null
  const wd = weekdayOf(today)
  const sorted = [...templates].sort((a, b) => Number(b.weekdays.includes(wd)) - Number(a.weekdays.includes(wd)) || a.name.localeCompare(b.name))

  async function start(t: WorkoutTemplate | null) {
    await startWorkout(t)
    closeSheet()
    navigate('/workout')
  }

  return (
    <Sheet open onClose={closeSheet} title="Workout">
      {active ? (
        <button
          type="button"
          className="btn btn-primary full"
          onClick={() => {
            closeSheet()
            navigate('/workout')
          }}
        >
          <Icon name="play" size={18} />
          Resume {active.title}
        </button>
      ) : (
        <>
          {sorted.length > 0 && (
            <ul className="list with-icons">
              {sorted.map((t) => (
                <li key={t.id} className="list-row">
                  <span className="row-icon">
                    <IconChip name="workout" tint={DOMAIN.workout.tint} />
                  </span>
                  <button type="button" className="row-main" onClick={() => void start(t)}>
                    <span className="row-title">{t.name}</span>
                    <span className="row-sub">
                      {t.weekdays.includes(wd) ? 'Planned today' : t.weekdays.length ? formatWeekdays(t.weekdays) : 'Any day'} · {t.exercises.length}{' '}
                      {t.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </span>
                  </button>
                  <span className="row-side">
                    <Icon name="play" size={18} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-quiet full" onClick={() => void start(null)}>
            Empty workout
          </button>
          <button type="button" className="btn-text center-self" onClick={() => openSheet({ kind: 'template' })}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            New template
          </button>
        </>
      )}
    </Sheet>
  )
}
