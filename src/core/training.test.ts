import { describe, expect, it } from 'vitest'
import { epley, exerciseSessions, previousPerformance, summarizeWorkout, templatesOn, volumeOf, workoutsInWeek } from './training'
import type { Entry, WorkoutSet, WorkoutTemplate } from './types'

const workout = (id: string, day: string, templateId: string | null, minutes = 60, deleted = false): Entry => ({
  id,
  kind: 'workout',
  occurredAt: `${day}T08:00:00.000Z`,
  localDate: day,
  itemId: null,
  title: 'Pull Day',
  note: null,
  workout: { templateId, startedAt: `${day}T08:00:00.000Z`, endedAt: new Date(Date.parse(`${day}T08:00:00.000Z`) + minutes * 60_000).toISOString() },
  createdAt: '',
  updatedAt: '',
  deletedAt: deleted ? 'x' : null,
})

let n = 0
const set = (entryId: string, exerciseId: string, setIndex: number, weightKg: number | null, reps: number | null, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${n++}`,
  entryId,
  exerciseId,
  exerciseOrder: 0,
  setIndex,
  weightKg,
  reps,
  isWarmup: false,
  doneAt: '2026-10-01T08:10:00.000Z',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...extra,
})

describe('training math', () => {
  it('estimates 1RM with Epley; a single is its own max', () => {
    expect(epley(100, 1)).toBe(100)
    expect(epley(100, 5)).toBeCloseTo(116.67, 2)
  })

  it('counts volume of ticked work sets only', () => {
    const sets = [set('w', 'row', 0, 60, 8), set('w', 'row', 1, 60, 8, { isWarmup: true }), set('w', 'row', 2, 60, 8, { doneAt: null }), set('w', 'pull', 0, null, 10)]
    expect(volumeOf(sets)).toBe(480) // bodyweight set counts as a set but adds no kg
  })

  const entries = [workout('w1', '2026-09-24', 'pull'), workout('w2', '2026-09-28', 'legs'), workout('w3', '2026-10-01', 'pull', 52), workout('wx', '2026-09-30', 'pull', 60, true)]
  const sets = [
    set('w1', 'row', 0, 60, 8),
    set('w1', 'row', 1, 60, 6),
    set('w1', 'curl', 0, 14, 10),
    set('wx', 'row', 0, 200, 1), // deleted workout — ignored
    set('w2', 'squat', 0, 100, 5),
    set('w3', 'row', 0, 62.5, 8),
    set('w3', 'row', 1, 60, 8),
    set('w3', 'curl', 0, 14, 9),
    set('w3', 'deadlift', 0, 140, 3), // first time — a baseline, not a PR
  ]

  it('finds previous performance for an exercise, skipping deleted workouts', () => {
    const prev = previousPerformance('row', '2026-10-01T08:00:00.000Z', entries, sets)!
    expect(prev.entryId).toBe('w1')
    expect(prev.sets.map((s) => `${s.weightKg}×${s.reps}`)).toEqual(['60×8', '60×6'])
    expect(previousPerformance('deadlift', '2026-10-01T08:00:00.000Z', entries, sets)).toBeNull()
  })

  it('summarises a workout vs the last one from the same template, with PRs', () => {
    const s = summarizeWorkout(entries[2], entries, sets)
    expect(s).toMatchObject({ durationMin: 52, sets: 4, previous: { entryId: 'w1', volume: 980 } })
    expect(s.volume).toBe(62.5 * 8 + 480 + 126 + 420)
    expect(s.volumeChange).toBe(s.volume - 980)
    expect(s.prs).toEqual([
      { exerciseId: 'row', kind: 'weight', value: 62.5, previous: 60 },
      { exerciseId: 'row', kind: 'e1rm', value: 79.2, previous: 76 },
    ])
  })

  it('lists an exercise’s sessions oldest first with the best set', () => {
    expect(exerciseSessions('row', entries, sets).map((x) => [x.localDate, x.best, x.e1rm])).toEqual([
      ['2026-09-24', { weightKg: 60, reps: 8 }, 76],
      ['2026-10-01', { weightKg: 62.5, reps: 8 }, 79.2],
    ])
  })

  it('counts workouts in a week and finds today’s templates', () => {
    expect(workoutsInWeek(entries, '2026-09-28')).toBe(2)
    const t = (id: string, weekdays: number[], archived = false) => ({ id, weekdays, archived, deletedAt: null }) as unknown as WorkoutTemplate
    expect(templatesOn([t('pull', [1, 4]), t('legs', [2]), t('old', [1], true)], 1).map((x) => x.id)).toEqual(['pull'])
  })
})
