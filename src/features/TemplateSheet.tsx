import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { WEEKDAY_SHORT } from '../core/dates'
import type { TemplateExercise, WorkoutTemplate } from '../core/types'
import { db } from '../data/db'
import { archiveTemplate, saveTemplate } from '../data/repo-training'
import { DOMAIN } from '../ui/domains'
import { SheetFooter } from '../ui/fields'
import { Icon, IconChip } from '../ui/icons'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'
import { ExercisePicker } from './ExercisePicker'

const FORM = 'template-form'
/** Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]

/** A workout template: exercises with target sets × reps, and the weekdays it's planned for. */
export function TemplateSheet({ template }: { template?: WorkoutTemplate }) {
  const [name, setName] = useState(template?.name ?? '')
  const [weekdays, setWeekdays] = useState<number[]>(template?.weekdays ?? [])
  const [rows, setRows] = useState<TemplateExercise[]>(template?.exercises ?? [])
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const byId = new Map(exercises?.map((e) => [e.id, e]))

  const update = (i: number, change: Partial<TemplateExercise>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setRows(next)
  }

  async function save() {
    if (!name.trim()) return setError('Give the template a name.')
    if (!rows.length) return setError('Add at least one exercise.')
    await saveTemplate({ name, exercises: rows, weekdays }, template)
    closeSheet()
    toast(template ? `Updated ${name.trim()}` : `Saved ${name.trim()}`)
  }

  if (picking) {
    return (
      <Sheet open onClose={() => setPicking(false)} title="Add exercise">
        <ExercisePicker
          exclude={rows.map((r) => r.exerciseId)}
          onPick={(e) => {
            setRows([...rows, { exerciseId: e.id, sets: 3, reps: 10 }])
            setPicking(false)
            setError(null)
          }}
        />
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={template ? 'Edit template' : 'New template'}
      footer={
        <div className="row-gap">
          {template && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={async () => {
                await archiveTemplate(template)
                closeSheet()
                toast(`Hid ${template.name}`, { label: 'Undo', run: () => void archiveTemplate({ ...template, archived: true }, false) })
              }}
            >
              Hide
            </button>
          )}
          <div className="grow">
            <SheetFooter form={FORM} />
          </div>
        </div>
      }
    >
      <form
        id={FORM}
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" autoComplete="off" placeholder="Pull Day" data-autofocus={template ? undefined : ''} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <fieldset className="field">
          <legend className="field-label">Planned on</legend>
          <div className="weekdays">
            {WEEK.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip ${weekdays.includes(d) ? 'on' : ''}`}
                aria-pressed={weekdays.includes(d)}
                onClick={() => setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend className="field-label">Exercises</legend>
          {rows.length > 0 && (
            <ul className="list with-icons">
              {rows.map((r, i) => (
                <li key={r.exerciseId} className="list-row tpl-row">
                  <span className="row-icon">
                    <IconChip name="workout" tint={DOMAIN.workout.tint} />
                  </span>
                  <span className="row-main static">
                    <span className="row-title">{byId.get(r.exerciseId)?.name ?? 'Exercise'}</span>
                    <span className="tpl-controls">
                      <label className="tpl-num">
                        <input
                          className="input input-inline num"
                          inputMode="numeric"
                          aria-label="Sets"
                          value={r.sets}
                          onChange={(e) => update(i, { sets: Math.max(1, Math.min(20, Number(e.target.value.replace(/\D/g, '')) || 1)) })}
                        />
                        sets
                      </label>
                      <span className="muted">×</span>
                      <label className="tpl-num">
                        <input
                          className="input input-inline num"
                          inputMode="numeric"
                          aria-label="Reps"
                          placeholder="–"
                          value={r.reps ?? ''}
                          onChange={(e) => update(i, { reps: Number(e.target.value.replace(/\D/g, '')) || null })}
                        />
                        reps
                      </label>
                    </span>
                  </span>
                  <span className="tpl-actions">
                    {i > 0 && (
                      <button type="button" className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)}>
                        <Icon name="chevronDown" size={15} strokeWidth={2.4} style={{ transform: 'rotate(180deg)' }} />
                      </button>
                    )}
                    <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      <Icon name="close" size={14} strokeWidth={2.4} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-quiet full" onClick={() => setPicking(true)}>
            <Icon name="plus" size={18} strokeWidth={2.2} />
            Add exercise
          </button>
        </fieldset>
        {error && <p className="field-error">{error}</p>}
      </form>
    </Sheet>
  )
}
