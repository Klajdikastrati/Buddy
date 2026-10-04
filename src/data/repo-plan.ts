import { nextCount, withCount } from '../core/habits'
import type { LocalDate, PlanItem } from '../core/types'
import { created, now, patch, save } from './repo-base'

export type PlanInput = Pick<PlanItem, 'kind' | 'title' | 'localDate' | 'weekdays'> &
  Partial<Pick<PlanItem, 'timesPerDay' | 'partOfDay' | 'cue'>>

export function addPlanItem(input: PlanInput): Promise<PlanItem> {
  return save<PlanItem>('plan', {
    ...created(),
    ...input,
    title: input.title.trim(),
    weekdays: [...input.weekdays].sort(),
    timesPerDay: input.timesPerDay ?? 1,
    partOfDay: input.partOfDay ?? 'anytime',
    cue: input.cue?.trim() || null,
    doneDates: [],
    doneAt: null,
    archived: false,
  })
}

export function updatePlanItem(
  item: PlanItem,
  changes: Partial<Pick<PlanItem, 'title' | 'localDate' | 'weekdays' | 'archived' | 'timesPerDay' | 'partOfDay' | 'cue'>>,
) {
  return patch('plan', item, changes)
}

/** Tasks and goals: done ⇄ not done. */
export function toggleDone(item: PlanItem) {
  return patch('plan', item, { doneAt: item.doneAt ? null : now() })
}

/**
 * Habits: one tap = one completion (up to times per day); a tap on a done day
 * clears it. Returns the day's previous state so the caller can offer Undo.
 */
export async function tickHabit(item: PlanItem, day: LocalDate): Promise<{ count: number; undo: () => Promise<PlanItem> }> {
  const count = nextCount(item, day)
  const saved = await patch('plan', item, { doneDates: withCount(item, day, count) })
  return { count, undo: () => patch('plan', saved, { doneDates: item.doneDates }) }
}

export function setPlanItemDeleted(item: PlanItem, deleted: boolean) {
  return patch('plan', item, { deletedAt: deleted ? now() : null })
}
