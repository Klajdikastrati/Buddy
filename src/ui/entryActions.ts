import type { Entry, ID } from '../core/types'
import { setEntryDeleted } from '../data/repo'
import { closeSheet, openSheet } from './sheets'
import { toast } from './toast'

/** Open the editor that owns an entry's facets. */
export function openEntry(entry: Entry) {
  if (entry.nutrition) openSheet({ kind: 'food', entry })
  else if (entry.sleep) openSheet({ kind: 'sleep', entry })
  else if (entry.measurement) openSheet({ kind: 'weight', entry })
  else if (entry.activity) openSheet({ kind: 'activity', entry })
  else if (entry.money) openSheet({ kind: 'money', entry })
}

/** Close the sheet and confirm; a new log gets Undo. */
export function confirmSaved(label: string, id: ID, editing: boolean) {
  closeSheet()
  if (editing) toast(`Updated ${label}`)
  else toast(`Logged ${label}`, { label: 'Undo', run: () => setEntryDeleted(id, true) })
}

export async function deleteEntry(entry: Entry) {
  await setEntryDeleted(entry.id, true)
  closeSheet()
  toast(`Deleted ${entry.title}`, { label: 'Undo', run: () => setEntryDeleted(entry.id, false) })
}
