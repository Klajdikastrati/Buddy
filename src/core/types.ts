// Domain types shared by every client. Pure data — no React, no storage.
// Locally an entry embeds its facets; on the server each facet is its own table
// (see docs/DATA_MODEL.md). The sync layer maps between the two shapes.

export type ID = string
/** Calendar day in the user's day (rollover-aware), `YYYY-MM-DD`. */
export type LocalDate = string
/** ISO-8601 instant. */
export type Instant = string

interface Synced {
  id: ID
  createdAt: Instant
  updatedAt: Instant
  /** Soft delete — keeps undo trivial and lets deletions sync. */
  deletedAt: Instant | null
}

export type EntryKind = 'expense' | 'income'

export interface MoneyFacet {
  direction: 'out' | 'in'
  amount: number
  currency: string
  categoryId: ID | null
}

/** One real-world event. Domain data hangs off it as facets. */
export interface Entry extends Synced {
  kind: EntryKind
  occurredAt: Instant
  localDate: LocalDate
  itemId: ID | null
  title: string
  note: string | null
  money?: MoneyFacet
}

/** A reusable real-world thing ("Red Bull 250ml", "Coffee"). Logging it copies
 *  its defaults into a new entry; editing it never rewrites history. */
export interface Item extends Synced {
  name: string
  kind: EntryKind
  money?: { amount: number; currency: string; categoryId: ID | null }
  useCount: number
  lastUsedAt: Instant | null
  favorite: boolean
  archived: boolean
}

export interface Category extends Synced {
  name: string
  sortOrder: number
  archived: boolean
}

export type TargetKey = 'budget_month'

/** Versioned: the current value is the latest row with effectiveFrom <= day. */
export interface Target extends Synced {
  key: TargetKey
  value: number
  unit: string
  effectiveFrom: LocalDate
  source: 'user' | 'default' | 'analyst'
}

export interface Settings {
  currency: string
  timezone: string
  /** Hours after midnight that still count as the previous day. */
  rolloverHour: number
}
