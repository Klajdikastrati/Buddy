import type { LocalDate, PlanItem } from '../core/types'
import { created, now, patch, save } from './repo-base'

export type PlanInput = Pick<PlanItem, 'kind' | 'title' | 'localDate' | 'weekdays'>

export function addPlanItem(input: PlanInput): Promise<PlanItem> {
  return save<PlanItem>('plan', {
    ...created(),
    ...input,
    title: input.title.trim(),
    weekdays: [...input.weekdays].sort(),
    doneDates: [],
    doneAt: null,
    archived: false,
  })
}

export function updatePlanItem(item: PlanItem, changes: Partial<Pick<PlanItem, 'title' | 'localDate' | 'weekdays' | 'archived'>>) {
  return patch('plan', item, changes)
}

/** Tasks and goals: done ⇄ not done. */
export function toggleDone(item: PlanItem) {
  return patch('plan', item, { doneAt: item.doneAt ? null : now() })
}

/** Routines: tick or untick one day. */
export function toggleRoutine(item: PlanItem, day: LocalDate) {
  const doneDates = item.doneDates.includes(day)
    ? item.doneDates.filter((d) => d !== day)
    : [...item.doneDates, day].sort()
  return patch('plan', item, { doneDates })
}

export function setPlanItemDeleted(item: PlanItem, deleted: boolean) {
  return patch('plan', item, { deletedAt: deleted ? now() : null })
}
