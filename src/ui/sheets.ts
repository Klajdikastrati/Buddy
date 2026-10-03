import { useSyncExternalStore } from 'react'
import type { Entry, EntryKind, LocalDate } from '../core/types'

/** Which sheet is open, app-wide. Kept outside React so any screen can open one. */
export type SheetState =
  | { kind: 'none' }
  | { kind: 'quick-add' }
  | { kind: 'money'; entry?: Entry; prefill?: { title?: string; kind?: EntryKind } }
  | { kind: 'sleep'; entry?: Entry }
  | { kind: 'weight'; entry?: Entry }
  | { kind: 'activity'; entry?: Entry }
  | { kind: 'checkin'; date?: LocalDate }

let state: SheetState = { kind: 'none' }
const listeners = new Set<() => void>()

export function openSheet(next: SheetState) {
  state = next
  listeners.forEach((fn) => fn())
}

export const closeSheet = () => openSheet({ kind: 'none' })

export function useSheet(): SheetState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )
}
