import { localDateOf } from '../core/dates'
import type { Entry, ID, Item, LocalDate, Settings, Synced } from '../core/types'
import { uid } from '../core/uid'
import { db, DEFAULT_SETTINGS, type SyncTable } from './db'
import { scheduleSync } from './sync'

// Shared plumbing for every repo-*.ts: write locally, queue for sync. Callers
// never wait on the network.

export const now = () => new Date().toISOString()

export async function queue(table: SyncTable, rowId: ID) {
  await db.outbox.add({ table, rowId, queuedAt: now() })
  scheduleSync()
}

/** Tables holding rows (everything but the settings row). */
export type RowTable = Exclude<SyncTable, 'profiles'>

/**
 * Write a whole row and queue it. Run inside a transaction that covers
 * `table` and `outbox`, or on its own. Check-ins are keyed by date.
 */
export async function put<T extends object>(table: RowTable, row: T): Promise<T> {
  await db.table(table).put(row)
  const key = (row as { id?: ID; localDate?: LocalDate })[table === 'checkins' ? 'localDate' : 'id']
  await queue(table, key!)
  return row
}

/** `put` in its own transaction. */
export function save<T extends object>(table: RowTable, row: T): Promise<T> {
  return db.transaction('rw', db.table(table), db.outbox, () => put(table, row))
}

/** Merge changes into a row, bump `updatedAt`, save. */
export function patch<T extends { updatedAt: string }>(table: RowTable, row: T, changes: Partial<NoInfer<T>>): Promise<T> {
  return save(table, { ...row, ...changes, updatedAt: now() })
}

/** Sync columns for a brand-new row. */
export function created(t = now()): Synced {
  return { id: uid(), createdAt: t, updatedAt: t, deletedAt: null }
}

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings')
  const { updatedAt: _ignored, ...settings } = (row?.value ?? {}) as Partial<Settings> & { updatedAt?: string }
  return { ...DEFAULT_SETTINGS, ...settings }
}

/** The user's day for an instant. Read before opening a transaction (it reads `meta`). */
export async function dayOf(instant: string): Promise<LocalDate> {
  const s = await getSettings()
  return localDateOf(new Date(instant), s.timezone, s.rolloverHour)
}

/** Entry fields a caller provides; ids, timestamps and `localDate` are filled in. */
export type EntryFields = Omit<Entry, keyof Synced | 'localDate' | 'itemId' | 'note'> &
  Partial<Pick<Entry, 'itemId' | 'note'>>

/**
 * Build the entry row for a new log or an edit. Facets are replaced wholesale:
 * whatever isn't in `fields` is removed. Run inside a transaction with `entries`.
 */
export async function entryRow(fields: EntryFields, localDate: LocalDate, editId?: ID): Promise<Entry> {
  const existing = editId ? await db.entries.get(editId) : undefined
  const t = now()
  return {
    itemId: null,
    ...fields,
    note: fields.note?.trim() || null,
    id: existing?.id ?? uid(),
    localDate,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
    deletedAt: null,
  }
}

/** Log or edit an entry that touches no other table. */
export async function saveEntry(fields: EntryFields, editId?: ID): Promise<Entry> {
  const localDate = await dayOf(fields.occurredAt)
  return db.transaction('rw', db.entries, db.outbox, async () => put('entries', await entryRow(fields, localDate, editId)))
}

/**
 * Find-or-create the item a log came from and remember the values just used,
 * so it shows up in Quick Add recents. Run inside a transaction with `items`.
 */
export async function rememberItem(
  find: (i: Item) => boolean,
  values: Pick<Item, 'name' | 'kind' | 'money' | 'food'>,
  newUse: boolean,
): Promise<Item> {
  const t = now()
  const existing = await db.items.filter((i) => !i.deletedAt && find(i)).first()
  const item: Item = existing
    ? {
        ...existing,
        ...values,
        useCount: existing.useCount + (newUse ? 1 : 0),
        lastUsedAt: newUse ? t : existing.lastUsedAt,
        archived: false,
        updatedAt: t,
      }
    : { ...created(t), ...values, useCount: 1, lastUsedAt: t, favorite: false, archived: false }
  return put('items', item)
}
