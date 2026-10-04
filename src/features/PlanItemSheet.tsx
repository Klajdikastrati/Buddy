import { useState } from 'react'
import { addDays, WEEKDAY_SHORT, weekdayOf, weekStart } from '../core/dates'
import { consistency, HABIT_IDEAS, PART_LABEL, PARTS, partOf, timesOf } from '../core/habits'
import type { LocalDate, PartOfDay, PlanItem, PlanKind } from '../core/types'
import { addPlanItem, setPlanItemDeleted, updatePlanItem } from '../data/repo-plan'
import { Segmented, SheetFooter } from '../ui/fields'
import { HabitDots } from '../ui/habit'
import { useSettings, useToday } from '../ui/hooks'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

const FORM = 'plan-form'
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const KINDS = [
  { value: 'task', label: 'Task' },
  { value: 'routine', label: 'Habit' },
  { value: 'goal', label: 'Weekly goal' },
] as const

/** Add or edit a task (a day or someday), a habit (weekdays, times a day, cue) or a weekly goal. */
export function PlanItemSheet({ item, planKind }: { item?: PlanItem; planKind?: PlanKind }) {
  const today = useToday(useSettings())
  const [kind, setKind] = useState<PlanKind>(item?.kind ?? planKind ?? 'task')
  const [title, setTitle] = useState(item?.title ?? '')
  const [day, setDay] = useState<LocalDate | null>(item ? item.localDate : today)
  const [weekdays, setWeekdays] = useState<number[]>(item?.kind === 'routine' ? item.weekdays : [0, 1, 2, 3, 4, 5, 6])
  const [times, setTimes] = useState(item ? timesOf(item) : 1)
  const [part, setPart] = useState<PartOfDay>(item ? partOf(item) : 'anytime')
  const [cue, setCue] = useState(item?.cue ?? '')
  const thisWeek = weekStart(today)
  const [week, setWeek] = useState<LocalDate>(item?.kind === 'goal' && item.localDate ? item.localDate : thisWeek)
  const [error, setError] = useState<string | null>(null)
  const habit = kind === 'routine'

  async function save() {
    if (!title.trim()) return setError('Write what it is.')
    if (habit && !weekdays.length) return setError('Pick at least one day.')
    const values = {
      title,
      localDate: kind === 'task' ? day : kind === 'goal' ? week : null,
      weekdays: habit ? weekdays : [],
      ...(habit ? { timesPerDay: times, partOfDay: part, cue: cue.trim() || null } : {}),
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
  const record = item?.kind === 'routine' ? consistency(item, today, 30) : null

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={item ? 'Edit' : habit ? 'New habit' : 'Add to plan'}
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

        {record && (
          <div className="habit-record">
            <span className="field-label">Last 30 days</span>
            <HabitDots c={record} />
            <span className="row-sub num">
              Done on {record.done} of {record.scheduled} scheduled {record.scheduled === 1 ? 'day' : 'days'}
            </span>
          </div>
        )}

        <label className="field">
          <span className="field-label">{kind === 'goal' ? 'Goal' : habit ? 'Habit' : 'Task'}</span>
          <input
            className="input"
            autoComplete="off"
            maxLength={200}
            data-autofocus={item || habit ? undefined : ''}
            placeholder={kind === 'goal' ? 'Train 4 times' : habit ? 'Make bed' : 'Call the bank'}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setError(null)
            }}
          />
        </label>

        {habit && !item && !title.trim() && (
          <fieldset className="field">
            <legend className="field-label">Ideas</legend>
            <div className="chips">
              {HABIT_IDEAS.map((idea) => (
                <button
                  key={idea.title}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setTitle(idea.title)
                    setTimes(idea.timesPerDay)
                    setPart(idea.partOfDay)
                    setCue(idea.cue ?? '')
                  }}
                >
                  {idea.title}
                  {idea.timesPerDay > 1 ? ` ×${idea.timesPerDay}` : ''}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {habit && (
          <>
            <fieldset className="field">
              <legend className="field-label">Times a day</legend>
              <div className="chips">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" className={`chip num ${times === n ? 'on' : ''}`} aria-pressed={times === n} onClick={() => setTimes(n)}>
                    {n}×
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend className="field-label">When</legend>
              <div className="chips">
                {PARTS.map((p) => (
                  <button key={p} type="button" className={`chip ${part === p ? 'on' : ''}`} aria-pressed={part === p} onClick={() => setPart(p)}>
                    {PART_LABEL[p]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="field">
              <span className="field-label">Right after I… (optional)</span>
              <input className="input" autoComplete="off" maxLength={120} placeholder="wake up · brush my teeth · get home" value={cue} onChange={(e) => setCue(e.target.value)} />
              <span className="field-hint">Tying a habit to something you already do every day is what makes it stick.</span>
            </label>
          </>
        )}

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

        {habit && (
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
            <p className="field-hint">Shows on Today on {weekdays.includes(weekdayOf(today)) ? 'today and ' : ''}the days you pick.</p>
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
