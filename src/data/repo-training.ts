import { DEFAULT_EXERCISES } from '../core/training'
import type { Exercise, ID, WorkoutSet, WorkoutTemplate } from '../core/types'
import { db } from './db'
import { created, dayOf, entryRow, now, patch, put, save } from './repo-base'

/** Seed the exercise library once per account — after the first pull, so a second device adopts it. */
export async function ensureExerciseLibrary() {
  await db.transaction('rw', db.exercises, db.outbox, db.meta, async () => {
    if (await db.meta.get('initialized:exercises')) return
    const t = now()
    if ((await db.exercises.count()) === 0) {
      for (const [name, muscle] of DEFAULT_EXERCISES) {
        await put<Exercise>('exercises', { ...created(t), name, muscle, archived: false })
      }
    }
    await db.meta.put({ key: 'initialized:exercises', value: t })
  })
}

export function addExercise(name: string, muscle: string | null): Promise<Exercise> {
  return save<Exercise>('exercises', { ...created(), name: name.trim().slice(0, 80), muscle: muscle?.trim().slice(0, 40) || null, archived: false })
}

export function updateExercise(e: Exercise, changes: Partial<Pick<Exercise, 'name' | 'muscle' | 'archived'>>) {
  return patch('exercises', e, changes)
}

export type TemplateInput = Pick<WorkoutTemplate, 'name' | 'exercises' | 'weekdays'>

export function saveTemplate(input: TemplateInput, existing?: WorkoutTemplate): Promise<WorkoutTemplate> {
  const values = { ...input, name: input.name.trim(), weekdays: [...input.weekdays].sort() }
  return existing
    ? patch('templates', existing, values)
    : save<WorkoutTemplate>('templates', { ...created(), ...values, archived: false })
}

export function archiveTemplate(t: WorkoutTemplate, archived = true) {
  return patch('templates', t, { archived })
}

/** The workout in progress on this device (local only — Workout Mode survives reloads). */
export async function activeWorkoutId(): Promise<ID | null> {
  return ((await db.meta.get('activeWorkout'))?.value as ID | undefined) ?? null
}

function plannedSet(entryId: ID, exerciseId: ID, exerciseOrder: number, setIndex: number): WorkoutSet {
  return { ...created(), entryId, exerciseId, exerciseOrder, setIndex, reps: null, weightKg: null, isWarmup: false, doneAt: null }
}

/**
 * Start a workout: a `workout` entry plus one empty planned set per template
 * set. Values are filled when a set is ticked; unticked sets are dropped at finish.
 */
export async function startWorkout(template: WorkoutTemplate | null): Promise<ID> {
  const t = now()
  const localDate = await dayOf(t)
  return db.transaction('rw', [db.entries, db.sets, db.outbox, db.meta], async () => {
    const entry = await entryRow(
      {
        kind: 'workout',
        occurredAt: t,
        title: template?.name ?? 'Workout',
        workout: { templateId: template?.id ?? null, startedAt: t, endedAt: null },
      },
      localDate,
    )
    await put('entries', entry)
    for (const [order, ex] of (template?.exercises ?? []).entries()) {
      for (let i = 0; i < Math.max(1, ex.sets); i++) await put('sets', plannedSet(entry.id, ex.exerciseId, order, i))
    }
    await db.meta.put({ key: 'activeWorkout', value: entry.id })
    return entry.id
  })
}

export function updateSet(set: WorkoutSet, changes: Partial<Pick<WorkoutSet, 'reps' | 'weightKg' | 'isWarmup' | 'doneAt'>>) {
  return patch('sets', set, changes)
}

export function removeSet(set: WorkoutSet) {
  return patch('sets', set, { deletedAt: now() })
}

async function liveSets(entryId: ID) {
  return (await db.sets.where('entryId').equals(entryId).toArray()).filter((s) => !s.deletedAt)
}

export async function addSet(entryId: ID, exerciseId: ID): Promise<WorkoutSet> {
  const sets = await liveSets(entryId)
  const same = sets.filter((s) => s.exerciseId === exerciseId)
  const order = same[0]?.exerciseOrder ?? Math.max(-1, ...sets.map((s) => s.exerciseOrder)) + 1
  const index = Math.max(-1, ...same.map((s) => s.setIndex)) + 1
  return save('sets', plannedSet(entryId, exerciseId, order, index))
}

export async function addWorkoutExercise(entryId: ID, exerciseId: ID, sets = 3) {
  const order = Math.max(-1, ...(await liveSets(entryId)).map((s) => s.exerciseOrder)) + 1
  await db.transaction('rw', db.sets, db.outbox, async () => {
    for (let i = 0; i < sets; i++) await put('sets', plannedSet(entryId, exerciseId, order, i))
  })
}

/** Drop every set of one exercise from a workout. */
export async function removeWorkoutExercise(entryId: ID, exerciseId: ID) {
  const t = now()
  await db.transaction('rw', db.sets, db.outbox, async () => {
    for (const s of await liveSets(entryId)) {
      if (s.exerciseId === exerciseId) await put('sets', { ...s, deletedAt: t, updatedAt: t })
    }
  })
}

/** End the workout: stamp the end, drop sets never ticked, leave Workout Mode. */
export async function finishWorkout(entryId: ID) {
  const t = now()
  await db.transaction('rw', [db.entries, db.sets, db.outbox, db.meta], async () => {
    const entry = await db.entries.get(entryId)
    if (entry?.workout) await put('entries', { ...entry, workout: { ...entry.workout, endedAt: t }, updatedAt: t })
    for (const s of await liveSets(entryId)) {
      if (!s.doneAt) await put('sets', { ...s, deletedAt: t, updatedAt: t })
    }
    await db.meta.delete('activeWorkout')
  })
}

/** Throw the workout away (entry and sets soft-deleted). Returns what `restoreWorkout` needs for Undo. */
export async function discardWorkout(entryId: ID): Promise<{ setIds: ID[]; wasActive: boolean }> {
  const t = now()
  return db.transaction('rw', [db.entries, db.sets, db.outbox, db.meta], async () => {
    const entry = await db.entries.get(entryId)
    if (entry) await put('entries', { ...entry, deletedAt: t, updatedAt: t })
    const sets = await liveSets(entryId)
    for (const s of sets) await put('sets', { ...s, deletedAt: t, updatedAt: t })
    const wasActive = (await db.meta.get('activeWorkout'))?.value === entryId
    if (wasActive) await db.meta.delete('activeWorkout')
    return { setIds: sets.map((s) => s.id), wasActive }
  })
}

export async function restoreWorkout(entryId: ID, undo: { setIds: ID[]; wasActive: boolean }) {
  const t = now()
  await db.transaction('rw', [db.entries, db.sets, db.outbox, db.meta], async () => {
    const entry = await db.entries.get(entryId)
    if (entry) await put('entries', { ...entry, deletedAt: null, updatedAt: t })
    for (const s of await db.sets.bulkGet(undo.setIds)) if (s) await put('sets', { ...s, deletedAt: null, updatedAt: t })
    if (undo.wasActive) await db.meta.put({ key: 'activeWorkout', value: entryId })
  })
}
