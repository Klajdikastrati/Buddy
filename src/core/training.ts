import { addDays } from './dates'
import type { Entry, ID, LocalDate, WorkoutSet, WorkoutTemplate } from './types'

/** Seeded once per account (flag `initialized:exercises`), editable afterwards. [name, muscle] */
export const DEFAULT_EXERCISES: readonly [string, string][] = [
  ['Bench Press', 'Chest'],
  ['Incline Dumbbell Press', 'Chest'],
  ['Chest Fly', 'Chest'],
  ['Push-up', 'Chest'],
  ['Dips', 'Chest'],
  ['Overhead Press', 'Shoulders'],
  ['Lateral Raise', 'Shoulders'],
  ['Rear Delt Fly', 'Shoulders'],
  ['Pull-up', 'Back'],
  ['Lat Pulldown', 'Back'],
  ['Barbell Row', 'Back'],
  ['Seated Cable Row', 'Back'],
  ['Dumbbell Row', 'Back'],
  ['Deadlift', 'Back'],
  ['Face Pull', 'Shoulders'],
  ['Barbell Curl', 'Biceps'],
  ['Dumbbell Curl', 'Biceps'],
  ['Hammer Curl', 'Biceps'],
  ['Triceps Pushdown', 'Triceps'],
  ['Overhead Triceps Extension', 'Triceps'],
  ['Skull Crusher', 'Triceps'],
  ['Squat', 'Legs'],
  ['Leg Press', 'Legs'],
  ['Romanian Deadlift', 'Legs'],
  ['Lunge', 'Legs'],
  ['Leg Extension', 'Legs'],
  ['Leg Curl', 'Legs'],
  ['Hip Thrust', 'Glutes'],
  ['Calf Raise', 'Calves'],
  ['Plank', 'Core'],
  ['Hanging Leg Raise', 'Core'],
  ['Cable Crunch', 'Core'],
]

/* ------------------------------- calculations ------------------------------ */

/** Estimated one-rep max (Epley). A single is its own max. */
export const epley = (weightKg: number, reps: number) => (reps <= 1 ? weightKg : weightKg * (1 + reps / 30))

/** A set that counts: ticked, not a warm-up, with reps. */
export const countsAsWork = (s: WorkoutSet) => !s.deletedAt && !!s.doneAt && !s.isWarmup && (s.reps ?? 0) > 0

export function volumeOf(sets: WorkoutSet[]): number {
  return sets.filter(countsAsWork).reduce((t, s) => t + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
}

export function durationMin(e: Entry, now = Date.now()): number | null {
  if (!e.workout) return null
  const end = e.workout.endedAt ? Date.parse(e.workout.endedAt) : now
  return Math.max(0, Math.round((end - Date.parse(e.workout.startedAt)) / 60_000))
}

/** Finished, non-deleted workouts, newest first. */
export function finishedWorkouts(entries: Entry[]): Entry[] {
  return entries
    .filter((e) => !e.deletedAt && e.workout?.endedAt)
    .sort((a, b) => b.workout!.startedAt.localeCompare(a.workout!.startedAt))
}

function setsByEntry(sets: WorkoutSet[]): Map<ID, WorkoutSet[]> {
  const out = new Map<ID, WorkoutSet[]>()
  for (const s of sets) if (!s.deletedAt) out.set(s.entryId, [...(out.get(s.entryId) ?? []), s])
  return out
}

export interface Best {
  maxWeight: number | null
  maxE1rm: number | null
}

function bestOf(sets: WorkoutSet[]): Best {
  let maxWeight: number | null = null
  let maxE1rm: number | null = null
  for (const s of sets.filter(countsAsWork)) {
    if (s.weightKg == null) continue
    maxWeight = Math.max(maxWeight ?? 0, s.weightKg)
    maxE1rm = Math.max(maxE1rm ?? 0, epley(s.weightKg, s.reps!))
  }
  return { maxWeight, maxE1rm }
}

export interface PreviousPerformance {
  entryId: ID
  localDate: LocalDate
  sets: WorkoutSet[]
}

/** The last finished workout before `before` (ISO start) that included this exercise. */
export function previousPerformance(exerciseId: ID, before: string, entries: Entry[], sets: WorkoutSet[]): PreviousPerformance | null {
  const byEntry = setsByEntry(sets)
  for (const w of finishedWorkouts(entries)) {
    if (w.workout!.startedAt >= before) continue
    const done = (byEntry.get(w.id) ?? []).filter((s) => s.exerciseId === exerciseId && countsAsWork(s))
    if (done.length) return { entryId: w.id, localDate: w.localDate, sets: done.sort((a, b) => a.setIndex - b.setIndex) }
  }
  return null
}

export interface PR {
  exerciseId: ID
  kind: 'weight' | 'e1rm'
  value: number
  previous: number
}

export interface WorkoutSummary {
  durationMin: number | null
  sets: number
  volume: number
  /** Last finished workout from the same template, if any. */
  previous: { entryId: ID; localDate: LocalDate; volume: number } | null
  volumeChange: number | null
  prs: PR[]
}

/**
 * Summary of one workout. PRs compare against every earlier finished workout;
 * an exercise done for the first time sets a baseline, not a PR.
 */
export function summarizeWorkout(entry: Entry, entries: Entry[], sets: WorkoutSet[]): WorkoutSummary {
  const byEntry = setsByEntry(sets)
  const mine = byEntry.get(entry.id) ?? []
  const start = entry.workout!.startedAt
  const earlier = finishedWorkouts(entries).filter((w) => w.id !== entry.id && w.workout!.startedAt < start)

  const sameTemplate = entry.workout!.templateId ? earlier.find((w) => w.workout!.templateId === entry.workout!.templateId) : undefined
  const volume = volumeOf(mine)
  const previous = sameTemplate ? { entryId: sameTemplate.id, localDate: sameTemplate.localDate, volume: volumeOf(byEntry.get(sameTemplate.id) ?? []) } : null

  const priorSets = earlier.flatMap((w) => byEntry.get(w.id) ?? [])
  const prs: PR[] = []
  for (const exerciseId of [...new Set(mine.filter(countsAsWork).map((s) => s.exerciseId))]) {
    const now = bestOf(mine.filter((s) => s.exerciseId === exerciseId))
    const before = bestOf(priorSets.filter((s) => s.exerciseId === exerciseId))
    if (now.maxWeight != null && before.maxWeight != null && now.maxWeight > before.maxWeight) {
      prs.push({ exerciseId, kind: 'weight', value: now.maxWeight, previous: before.maxWeight })
    }
    if (now.maxE1rm != null && before.maxE1rm != null && now.maxE1rm > before.maxE1rm + 0.05) {
      prs.push({ exerciseId, kind: 'e1rm', value: Math.round(now.maxE1rm * 10) / 10, previous: Math.round(before.maxE1rm * 10) / 10 })
    }
  }

  return {
    durationMin: durationMin(entry),
    sets: mine.filter(countsAsWork).length,
    volume,
    previous,
    volumeChange: previous ? volume - previous.volume : null,
    prs,
  }
}

export interface ExerciseSession {
  entryId: ID
  localDate: LocalDate
  best: { weightKg: number; reps: number } | null
  e1rm: number | null
  volume: number
  sets: number
}

/** Every finished session of an exercise, oldest first — for progress over time. */
export function exerciseSessions(exerciseId: ID, entries: Entry[], sets: WorkoutSet[]): ExerciseSession[] {
  const byEntry = setsByEntry(sets)
  return finishedWorkouts(entries)
    .reverse()
    .flatMap((w) => {
      const done = (byEntry.get(w.id) ?? []).filter((s) => s.exerciseId === exerciseId && countsAsWork(s))
      if (!done.length) return []
      let best: ExerciseSession['best'] = null
      let e1rm: number | null = null
      for (const s of done) {
        if (s.weightKg == null) continue
        const est = epley(s.weightKg, s.reps!)
        if (e1rm == null || est > e1rm) {
          e1rm = est
          best = { weightKg: s.weightKg, reps: s.reps! }
        }
      }
      return [{ entryId: w.id, localDate: w.localDate, best, e1rm: e1rm == null ? null : Math.round(e1rm * 10) / 10, volume: volumeOf(done), sets: done.length }]
    })
}

/** Finished workouts in the 7 days starting `weekStart`. */
export function workoutsInWeek(entries: Entry[], weekStart: LocalDate): number {
  const end = addDays(weekStart, 6)
  return finishedWorkouts(entries).filter((w) => w.localDate >= weekStart && w.localDate <= end).length
}

/** Templates planned for a weekday (0 = Sunday). */
export function templatesOn(templates: WorkoutTemplate[], weekday: number): WorkoutTemplate[] {
  return templates.filter((t) => !t.deletedAt && !t.archived && t.weekdays.includes(weekday))
}
