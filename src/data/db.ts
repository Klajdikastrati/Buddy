import Dexie, { type EntityTable } from 'dexie'
import type {
  AnalystRun,
  Category,
  MoneyPlan,
  DayCheckin,
  Entry,
  Exercise,
  Food,
  Item,
  PlanItem,
  Recommendation,
  Settings,
  Target,
  TrackerDef,
  WorkoutSet,
  WorkoutTemplate,
} from '../core/types'

/** Local tables that sync. `profiles` is the settings row kept in `meta`. */
export type SyncTable =
  | 'profiles'
  | 'categories'
  | 'foods'
  | 'exercises'
  | 'templates'
  | 'trackers'
  | 'items'
  | 'entries'
  | 'sets'
  | 'checkins'
  | 'plan'
  | 'analystRuns'
  | 'recommendations'
  | 'targets'
  | 'moneyPlans'

/** A pending upload. Rows are upserted whole by key, so replaying is safe. */
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
  foods: EntityTable<Food, 'id'>
  exercises: EntityTable<Exercise, 'id'>
  templates: EntityTable<WorkoutTemplate, 'id'>
  sets: EntityTable<WorkoutSet, 'id'>
  checkins: EntityTable<DayCheckin, 'localDate'>
  plan: EntityTable<PlanItem, 'id'>
  trackers: EntityTable<TrackerDef, 'id'>
  analystRuns: EntityTable<AnalystRun, 'id'>
  recommendations: EntityTable<Recommendation, 'id'>
  moneyPlans: EntityTable<MoneyPlan, 'id'>
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

db.version(2).stores({
  entries: 'id, localDate, itemId, kind, updatedAt',
  foods: 'id, barcode, lastUsedAt, updatedAt',
  exercises: 'id, updatedAt',
  templates: 'id, updatedAt',
  sets: 'id, entryId, exerciseId, updatedAt',
  checkins: 'localDate, updatedAt',
  plan: 'id, kind, localDate, updatedAt',
  trackers: 'id, updatedAt',
  analystRuns: 'id, updatedAt',
  recommendations: 'id, runId, status, updatedAt',
})

db.version(3).stores({
  moneyPlans: 'id, kind, updatedAt',
})

// Habits: routines gained times per day, part of day and a cue.
db.version(4)
  .stores({})
  .upgrade((tx) =>
    tx
      .table('plan')
      .toCollection()
      .modify((p: Partial<PlanItem>) => {
        p.timesPerDay ??= 1
        p.partOfDay ??= 'anytime'
        p.cue ??= null
      }),
  )

export const DEFAULT_SETTINGS: Settings = {
  currency: 'ALL',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Tirane',
  rolloverHour: 4,
}
