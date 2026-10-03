import { useSyncExternalStore } from 'react'
import type { FoodDraft } from '../core/nutrition'
import type { Entry, EntryKind, Food, ID, LocalDate, PlanItem, PlanKind, TrackerDef, WorkoutTemplate } from '../core/types'

/** Which sheet is open, app-wide. Kept outside React so any screen can open one. */
export type SheetState =
  | { kind: 'none' }
  | { kind: 'quick-add' }
  | { kind: 'money'; entry?: Entry; prefill?: { title?: string; kind?: EntryKind } }
  | { kind: 'sleep'; entry?: Entry }
  | { kind: 'weight'; entry?: Entry }
  | { kind: 'activity'; entry?: Entry }
  | { kind: 'checkin'; date?: LocalDate }
  /** Log food: pick (search · scan · create) → amount. `food` skips straight to the amount. */
  | { kind: 'food'; entry?: Entry; food?: Food; query?: string }
  /** Create/edit a food; `logAfter` continues into logging it. */
  | { kind: 'food-edit'; food?: Food; draft?: Partial<FoodDraft>; logAfter?: boolean }
  | { kind: 'recipe'; food?: Food }
  | { kind: 'workout-start' }
  | { kind: 'template'; template?: WorkoutTemplate }
  | { kind: 'workout-summary'; entryId: ID }
  | { kind: 'exercise'; exerciseId: ID }
  | { kind: 'plan-item'; item?: PlanItem; planKind?: PlanKind }
  | { kind: 'tracker-def'; def?: TrackerDef }
  | { kind: 'tracker-log'; trackerId: ID; entry?: Entry }
  | { kind: 'analyst-export' }

let state: SheetState = { kind: 'none' }
/** The open sheet is animating out; it unmounts when `finishClose` runs. */
let closing = false
let fallback: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function openSheet(next: SheetState) {
  clearTimeout(fallback)
  closing = false
  state = next
  emit()
}

/** Slide the open sheet away (the Sheet calls `finishClose` when its exit animation ends). */
export function closeSheet() {
  if (state.kind === 'none' || closing) return
  closing = true
  emit()
  fallback = setTimeout(finishClose, 450)
}

export function finishClose() {
  clearTimeout(fallback)
  if (!closing) return
  closing = false
  state = { kind: 'none' }
  emit()
}

export function useSheet(): SheetState {
  return useSyncExternalStore(subscribe, () => state)
}

export function useSheetClosing(): boolean {
  return useSyncExternalStore(subscribe, () => closing)
}
