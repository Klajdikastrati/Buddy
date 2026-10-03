import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { formatShortDate } from '../core/dates'
import { formatNumber, parseDecimal } from '../core/numbers'
import { previousPerformance, type PreviousPerformance } from '../core/training'
import type { Entry, Exercise, ID, WorkoutSet, WorkoutTemplate } from '../core/types'
import { db } from '../data/db'
import {
  addSet,
  addWorkoutExercise,
  discardWorkout,
  finishWorkout,
  removeSet,
  removeWorkoutExercise,
  restoreWorkout,
  updateSet,
} from '../data/repo-training'
import { ExercisePicker } from '../features/ExercisePicker'
import { useWorkoutData, WorkoutSummaryView } from '../features/WorkoutSummary'
import { DOMAIN } from '../ui/domains'
import { navigate } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { openSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

// Survives re-renders while the summary is shown after Finish.
let justFinished: ID | null = null

/** Workout Mode: full screen, no tab bar. The active workout id lives in `meta.activeWorkout`, so a reload resumes it. */
export function Workout() {
  const activeId = useLiveQuery(async () => ((await db.meta.get('activeWorkout'))?.value as ID | undefined) ?? null, [])
  const [summaryId, setSummaryId] = useState<ID | null>(justFinished)
  if (activeId === undefined) return null
  if (summaryId && !activeId) {
    return (
      <Finished
        entryId={summaryId}
        onDone={() => {
          justFinished = null
          navigate('/')
        }}
      />
    )
  }
  if (!activeId) return <NoWorkout />
  return (
    <ActiveWorkout
      entryId={activeId}
      onFinish={async (id) => {
        justFinished = id
        setSummaryId(id)
        await finishWorkout(id)
      }}
    />
  )
}

function NoWorkout() {
  return (
    <div className="screen workout-empty">
      <IconChip name="workout" tint={DOMAIN.workout.tint} size="lg" />
      <h1 className="section-title">No workout in progress</h1>
      <button type="button" className="btn btn-primary" onClick={() => openSheet({ kind: 'workout-start' })}>
        Start a workout
      </button>
      <button type="button" className="btn btn-quiet" onClick={() => navigate('/')}>
        Back to Today
      </button>
    </div>
  )
}

function useSecondTick() {
  const [, set] = useState(0)
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
}

function Elapsed({ since }: { since: string }) {
  useSecondTick()
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return <span className="num">{h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`}</span>
}

interface Group {
  exerciseId: ID
  order: number
  sets: WorkoutSet[]
}

function ActiveWorkout({ entryId, onFinish }: { entryId: ID; onFinish: (id: ID) => Promise<void> }) {
  const entry = useLiveQuery(() => db.entries.get(entryId), [entryId])
  const sets = useLiveQuery(
    () => db.sets.where('entryId').equals(entryId).filter((s) => !s.deletedAt).toArray(),
    [entryId],
  )
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const templateId = entry?.workout?.templateId ?? null
  const template = useLiveQuery(async () => (templateId ? ((await db.templates.get(templateId)) ?? null) : null), [templateId])
  const ids = [...new Set((sets ?? []).map((s) => s.exerciseId))].sort().join(',')
  const history = useLiveQuery(async () => {
    const list = ids ? ids.split(',') : []
    const [workouts, hsets] = await Promise.all([
      db.entries.where('kind').equals('workout').toArray(),
      list.length ? db.sets.where('exerciseId').anyOf(list).toArray() : Promise.resolve([] as WorkoutSet[]),
    ])
    return { workouts, sets: hsets }
  }, [ids])
  const [picking, setPicking] = useState(false)

  if (!entry?.workout || !sets || !exercises || template === undefined || !history) return null
  const exerciseById = new Map(exercises.map((e) => [e.id, e]))

  const groups: Group[] = []
  for (const s of [...sets].sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex)) {
    const g = groups.find((x) => x.exerciseId === s.exerciseId)
    if (g) g.sets.push(s)
    else groups.push({ exerciseId: s.exerciseId, order: s.exerciseOrder, sets: [s] })
  }
  const done = sets.filter((s) => s.doneAt).length

  async function finish() {
    if (!done) return toast('Tick at least one set — or discard the workout.')
    await onFinish(entryId)
  }

  async function discard() {
    const undo = await discardWorkout(entryId)
    navigate('/')
    toast(`Discarded ${entry!.title}`, {
      label: 'Undo',
      run: async () => {
        await restoreWorkout(entryId, undo)
        navigate('/workout')
      },
    })
  }

  return (
    <div className="workout">
      <header className="wk-head">
        <div className="grow">
          <h1 className="wk-title">{entry.title}</h1>
          <p className="wk-meta num">
            <Elapsed since={entry.workout.startedAt} /> · {done} of {sets.length} sets
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={() => void finish()}>
          Finish
        </button>
      </header>

      {groups.map((g) => (
        <ExerciseCard
          key={g.exerciseId}
          entry={entry}
          exercise={exerciseById.get(g.exerciseId)}
          group={g}
          prev={previousPerformance(g.exerciseId, entry.workout!.startedAt, history.workouts, history.sets)}
          template={template}
        />
      ))}

      {groups.length === 0 && <p className="muted center">Add the first exercise.</p>}

      <button type="button" className="btn btn-quiet full" onClick={() => setPicking(true)}>
        <Icon name="plus" size={18} strokeWidth={2.2} />
        Add exercise
      </button>
      <button type="button" className="btn-text danger center-self" onClick={() => void discard()}>
        Discard workout
      </button>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Add exercise">
        {picking && (
          <ExercisePicker
            exclude={groups.map((g) => g.exerciseId)}
            onPick={async (ex) => {
              setPicking(false)
              const last = previousPerformance(ex.id, entry.workout!.startedAt, history.workouts, history.sets)
              await addWorkoutExercise(entryId, ex.id, last?.sets.length ?? 3)
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

function ExerciseCard({
  entry,
  exercise,
  group,
  prev,
  template,
}: {
  entry: Entry
  exercise?: Exercise
  group: Group
  prev: PreviousPerformance | null
  template: WorkoutTemplate | null
}) {
  const templateReps = template?.exercises.find((x) => x.exerciseId === group.exerciseId)?.reps ?? null
  const last = group.sets[group.sets.length - 1]
  return (
    <section className="wk-ex" aria-label={exercise?.name}>
      <div className="wk-ex-head">
        <IconChip name="workout" tint={DOMAIN.workout.tint} size="sm" />
        <div className="grow">
          <h2 className="wk-ex-name">{exercise?.name ?? 'Exercise'}</h2>
          <p className="row-sub num">
            {prev
              ? `Last ${formatShortDate(prev.localDate)}: ${prev.sets.map((s) => (s.weightKg != null ? `${formatNumber(s.weightKg)}×${s.reps}` : `${s.reps}`)).join(' · ')}`
              : 'First time — no previous numbers'}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Remove ${exercise?.name ?? 'exercise'}`}
          onClick={() => void removeWorkoutExercise(entry.id, group.exerciseId)}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>

      <div className="wk-grid wk-grid-head" aria-hidden="true">
        <span>Set</span>
        <span>Previous</span>
        <span>kg</span>
        <span>Reps</span>
        <span />
      </div>
      {group.sets.map((s, i) => (
        <SetRow
          key={s.id}
          set={s}
          index={i}
          prevSet={prev?.sets[i] ?? null}
          above={i > 0 ? group.sets[i - 1] : null}
          templateReps={templateReps}
          name={exercise?.name ?? 'exercise'}
        />
      ))}

      <div className="wk-ex-foot">
        <button type="button" className="btn-text" onClick={() => void addSet(entry.id, group.exerciseId)}>
          <Icon name="plus" size={16} strokeWidth={2.2} />
          Add set
        </button>
        {group.sets.length > 1 && !last.doneAt && (
          <button type="button" className="btn-text" onClick={() => void removeSet(last)}>
            Remove set
          </button>
        )}
      </div>
    </section>
  )
}

const fmt = (v: number | null | undefined) => (v == null ? '' : String(v))

function SetRow({
  set,
  index,
  prevSet,
  above,
  templateReps,
  name,
}: {
  set: WorkoutSet
  index: number
  prevSet: WorkoutSet | null
  above: WorkoutSet | null
  templateReps: number | null
  name: string
}) {
  const [w, setW] = useState(fmt(set.weightKg))
  const [r, setR] = useState(fmt(set.reps))
  const repsRef = useRef<HTMLInputElement>(null)
  // Placeholders: last time's same set, else the set above, else the template's reps.
  const phW = prevSet?.weightKg ?? above?.weightKg ?? null
  const phR = prevSet?.reps ?? above?.reps ?? templateReps ?? null

  // Server bounds: reps 0–1000, weight ≥ 0. A rejected row would block sync, so clamp here.
  const parsed = () => {
    const n = Math.round(Number(r))
    const weightKg = parseDecimal(w)
    return { weightKg: weightKg == null ? null : Math.min(weightKg, 9999), reps: r.trim() && Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : null }
  }

  function commit() {
    const v = parsed()
    if (v.weightKg !== set.weightKg || v.reps !== set.reps) void updateSet(set, v)
  }

  function toggle() {
    if (set.doneAt) return void updateSet(set, { doneAt: null })
    const v = parsed()
    const weightKg = v.weightKg ?? phW
    const reps = v.reps ?? phR
    if (!reps) return repsRef.current?.focus()
    setW(fmt(weightKg))
    setR(fmt(reps))
    void updateSet(set, { weightKg, reps, doneAt: new Date().toISOString() })
  }

  function copyPrevious() {
    if (!prevSet) return
    setW(fmt(prevSet.weightKg))
    setR(fmt(prevSet.reps))
    void updateSet(set, { weightKg: prevSet.weightKg, reps: prevSet.reps })
  }

  return (
    <div className={`wk-grid wk-row ${set.doneAt ? 'done' : ''}`}>
      <span className="wk-set num">{index + 1}</span>
      <button type="button" className="wk-prev num" onClick={copyPrevious} disabled={!prevSet} aria-label={prevSet ? `Copy previous set ${index + 1}` : 'No previous set'}>
        {prevSet ? (prevSet.weightKg != null ? `${formatNumber(prevSet.weightKg)} × ${prevSet.reps}` : `${prevSet.reps} reps`) : '—'}
      </button>
      <input
        className="wk-input num"
        inputMode="decimal"
        autoComplete="off"
        aria-label={`${name} set ${index + 1} weight in kg`}
        placeholder={phW != null ? formatNumber(phW) : '–'}
        value={w}
        onChange={(e) => setW(e.target.value)}
        onBlur={commit}
      />
      <input
        ref={repsRef}
        className="wk-input num"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${name} set ${index + 1} reps`}
        placeholder={phR != null ? String(phR) : '–'}
        value={r}
        onChange={(e) => setR(e.target.value)}
        onBlur={commit}
      />
      <button type="button" className="wk-check" aria-pressed={!!set.doneAt} aria-label={`Set ${index + 1} done`} onClick={toggle}>
        <Icon name="check" size={18} strokeWidth={2.6} />
      </button>
    </div>
  )
}

function Finished({ entryId, onDone }: { entryId: ID; onDone: () => void }) {
  const data = useWorkoutData(entryId)
  if (!data) return null
  return (
    <div className="screen workout-done">
      <header className="center-col">
        <IconChip name="check" tint={DOMAIN.workout.tint} size="lg" />
        <span className="eyebrow">Workout finished</span>
        <h1 className="section-title">{data.entry.title}</h1>
      </header>
      <WorkoutSummaryView {...data} />
      <button type="button" className="btn btn-primary full" onClick={onDone}>
        Done
      </button>
    </div>
  )
}
