import { useState } from 'react'
import { addDays, WEEKDAY_SHORT, weekdayOf, weekStart } from '../core/dates'
import type { LocalDate, PlanItem, PlanKind } from '../core/types'
import { addPlanItem, setPlanItemDeleted, updatePlanItem } from '../data/repo-plan'
import { Segmented, SheetFooter } from '../ui/fields'
import { useSettings, useToday } from '../ui/hooks'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

const FORM = 'plan-form'
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const KINDS = [
  { value: 'task', label: 'Task' },
  { value: 'routine', label: 'Routine' },
  { value: 'goal', label: 'Weekly goal' },
] as const

/** Add or edit a task (a day or someday), a routine (weekdays) or a weekly goal. */
export function PlanItemSheet({ item, planKind }: { item?: PlanItem; planKind?: PlanKind }) {
  const today = useToday(useSettings())
  const [kind, setKind] = useState<PlanKind>(item?.kind ?? planKind ?? 'task')
  const [title, setTitle] = useState(item?.title ?? '')
  const [day, setDay] = useState<LocalDate | null>(item ? item.localDate : today)
  const [weekdays, setWeekdays] = useState<number[]>(item?.kind === 'routine' ? item.weekdays : [0, 1, 2, 3, 4, 5, 6])
  const thisWeek = weekStart(today)
  const [week, setWeek] = useState<LocalDate>(item?.kind === 'goal' && item.localDate ? item.localDate : thisWeek)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!title.trim()) return setError('Write what it is.')
    if (kind === 'routine' && !weekdays.length) return setError('Pick at least one day.')
    const values = {
      title,
      localDate: kind === 'task' ? day : kind === 'goal' ? week : null,
      weekdays: kind === 'routine' ? weekdays : [],
    }
    if (item) await updatePlanItem(item, values)
    else await addPlanItem({ kind, ...values })
    closeSheet()
    toast(item ? 'Updated' : `Added “${title.trim()}”`)
  }

  async function remove() {
    if (!item) return
    await setPlanItemDeleted(item, true)
    closeSheet()
    toast(`Deleted “${item.title}”`, { label: 'Undo', run: () => void setPlanItemDeleted({ ...item, deletedAt: 'x' }, false) })
  }

  const dayChip = (label: string, value: LocalDate | null) => (
    <button type="button" className={`chip ${day === value ? 'on' : ''}`} aria-pressed={day === value} onClick={() => setDay(value)}>
      {label}
    </button>
  )

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={item ? 'Edit' : 'Add to plan'}
      footer={<SheetFooter form={FORM} onDelete={item ? () => void remove() : undefined} />}
    >
      <form
        id={FORM}
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {!item && <Segmented label="Kind" options={KINDS} value={kind} onChange={setKind} />}
        <label className="field">
          <span className="field-label">{kind === 'goal' ? 'Goal' : kind === 'routine' ? 'Routine' : 'Task'}</span>
          <input
            className="input"
            autoComplete="off"
            data-autofocus={item ? undefined : ''}
            placeholder={kind === 'goal' ? 'Train 4 times' : kind === 'routine' ? 'Stretch 10 min' : 'Call the bank'}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setError(null)
            }}
          />
        </label>

        {kind === 'task' && (
          <fieldset className="field">
            <legend className="field-label">When</legend>
            <div className="chips">
              {dayChip('Today', today)}
              {dayChip('Tomorrow', addDays(today, 1))}
              {dayChip('Someday', null)}
              <input
                className="input input-date"
                type="date"
                aria-label="Pick a day"
                value={day && day !== today && day !== addDays(today, 1) ? day : ''}
                onChange={(e) => e.target.value && setDay(e.target.value)}
              />
            </div>
          </fieldset>
        )}

        {kind === 'routine' && (
          <fieldset className="field">
            <legend className="field-label">On</legend>
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
            <p className="field-hint">
              Shows on Plan on {weekdays.includes(weekdayOf(today)) ? 'today and ' : ''}the days you pick.
            </p>
          </fieldset>
        )}

        {kind === 'goal' && (
          <fieldset className="field">
            <legend className="field-label">Week</legend>
            <div className="chips">
              {[
                ['This week', thisWeek],
                ['Next week', addDays(thisWeek, 7)],
              ].map(([label, value]) => (
                <button key={value} type="button" className={`chip ${week === value ? 'on' : ''}`} aria-pressed={week === value} onClick={() => setWeek(value)}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {error && <p className="field-error">{error}</p>}
      </form>
    </Sheet>
  )
}
