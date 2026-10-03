import Dexie, { type EntityTable } from 'dexie'
import type { Category, Entry, Item, Settings, Target } from '../core/types'

export type SyncTable = 'profiles' | 'entries' | 'items' | 'categories' | 'targets'

/** A pending upload. Rows are upserted whole by id, so replaying is safe. */
export interface OutboxOp {
  seq?: number
  table: SyncTable
  rowId: string
  queuedAt: string
}

export interface Meta {
  key: string
  value: unknown
}

/**
 * The phone's copy of the user's data. Screens read from here (instant); every
 * write also lands in `outbox` for background sync to Supabase.
 */
export const db = new Dexie('buddy') as Dexie & {
  entries: EntityTable<Entry, 'id'>
  items: EntityTable<Item, 'id'>
  categories: EntityTable<Category, 'id'>
  targets: EntityTable<Target, 'id'>
  outbox: EntityTable<OutboxOp, 'seq'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  entries: 'id, localDate, itemId, updatedAt',
  items: 'id, lastUsedAt, updatedAt',
  categories: 'id, sortOrder, updatedAt',
  targets: 'id, key, effectiveFrom, updatedAt',
  outbox: '++seq, table',
  meta: 'key',
})

export const DEFAULT_SETTINGS: Settings = {
  currency: 'ALL',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Tirane',
  rolloverHour: 4,
}
