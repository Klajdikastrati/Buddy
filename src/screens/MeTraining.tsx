import { useLiveQuery } from '../ui/live'
import { useState } from 'react'
import { formatWeekdays } from '../core/dates'
import { db } from '../data/db'
import { addExercise, archiveTemplate, updateExercise } from '../data/repo-training'
import { DOMAIN } from '../ui/domains'
import { SubHead } from '../ui/fields'
import { navigate } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { openSheet } from '../ui/sheets'

/** Workout templates and the exercise library. */
export function MeTraining() {
  const templates = useLiveQuery(() => db.templates.filter((t) => !t.deletedAt).toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deletedAt).toArray(), [])
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState('')
  if (!templates || !exercises) return null

  const active = templates.filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name))
  const hidden = templates.filter((t) => t.archived)
  const byMuscle = [...exercises].sort((a, b) => Number(a.archived) - Number(b.archived) || (a.muscle ?? '~').localeCompare(b.muscle ?? '~') || a.name.localeCompare(b.name))

  return (
    <div className="screen">
      <SubHead title="Training" back={() => navigate('/me')} />

      <section className="group" aria-labelledby="tpl-h">
        <h2 id="tpl-h" className="section-label">
          Templates
        </h2>
        {active.length > 0 && (
          <ul className="list with-icons">
            {active.map((t) => (
              <li key={t.id} className="list-row">
                <span className="row-icon">
                  <IconChip name="workout" tint={DOMAIN.workout.tint} />
                </span>
                <button type="button" className="row-main" onClick={() => openSheet({ kind: 'template', template: t })}>
                  <span className="row-title">{t.name}</span>
                  <span className="row-sub">
                    {t.weekdays.length ? formatWeekdays(t.weekdays) : 'Any day'} · {t.exercises.length} {t.exercises.length === 1 ? 'exercise' : 'exercises'}
                  </span>
                </button>
                <Icon name="chevronRight" size={16} strokeWidth={2.2} className="row-chev" />
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-quiet full" onClick={() => openSheet({ kind: 'template' })}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          New template
        </button>
        {hidden.map((t) => (
          <div key={t.id} className="setting">
            <span className="muted">{t.name}</span>
            <button type="button" className="btn-text" onClick={() => void archiveTemplate(t, false)}>
              Restore
            </button>
          </div>
        ))}
      </section>

      <section className="group" aria-labelledby="ex-h">
        <h2 id="ex-h" className="section-label">
          Exercises
        </h2>
        <form
          className="row-gap"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            void addExercise(name, muscle)
            setName('')
            setMuscle('')
          }}
        >
          <input className="input grow" autoComplete="off" maxLength={80} placeholder="New exercise…" aria-label="Exercise name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input w-110" autoComplete="off" maxLength={40} placeholder="Muscle" aria-label="Muscle group" value={muscle} onChange={(e) => setMuscle(e.target.value)} />
          <button type="submit" className="btn btn-quiet">
            Add
          </button>
        </form>
        <ul className="list">
          {byMuscle.map((e) => (
            <li key={e.id} className="list-row">
              <button type="button" className={`row-main ${e.archived ? 'muted' : ''}`} onClick={() => openSheet({ kind: 'exercise', exerciseId: e.id })}>
                <span className="row-title">{e.name}</span>
                {e.muscle && <span className="row-sub">{e.muscle}</span>}
              </button>
              <button type="button" className="btn-text" onClick={() => void updateExercise(e, { archived: !e.archived })}>
                {e.archived ? 'Restore' : 'Hide'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
