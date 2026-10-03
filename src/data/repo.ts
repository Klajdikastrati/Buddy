import { localDateOf } from '../core/dates'
import { normalizeName } from '../core/recents'
import type { Category, Entry, EntryKind, ID, Item, LocalDate, Settings, Target, TargetKey } from '../core/types'
import { uid } from '../core/uid'
import { db, DEFAULT_SETTINGS, type SyncTable } from './db'
import { scheduleSync } from './sync'

// Every write goes through here: local first, then queued for sync. Callers
// never wait on the network.

const now = () => new Date().toISOString()

async function queue(table: SyncTable, rowId: ID) {
  await db.outbox.add({ table, rowId, queuedAt: now() })
  scheduleSync()
}

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings')
  const { updatedAt: _ignored, ...settings } = (row?.value ?? {}) as Partial<Settings> & { updatedAt?: string }
  return { ...DEFAULT_SETTINGS, ...settings }
}

export async function saveSettings(patch: Partial<Settings>) {
  const current = await getSettings()
  await db.transaction('rw', db.meta, db.outbox, async () => {
    await db.meta.put({ key: 'settings', value: { ...current, ...patch, updatedAt: now() } })
    await queue('profiles', 'me')
  })
}

const DEFAULT_CATEGORIES = [
  'Food & Drink',
  'Groceries',
  'Transport',
  'Bills',
  'Shopping',
  'Health',
  'Fun',
  'Other',
]

/**
 * First run: sensible defaults instead of a setup wizard. Call after the first
 * pull, so a second device adopts the synced categories instead of duplicating.
 */
export async function ensureDefaults() {
  await db.transaction('rw', db.categories, db.outbox, db.meta, async () => {
    if (await db.meta.get('initialized')) return
    const t = now()
    if ((await db.categories.count()) > 0) {
      await db.meta.put({ key: 'initialized', value: t })
      return
    }
    for (const [i, name] of DEFAULT_CATEGORIES.entries()) {
      const c: Category = { id: uid(), name, sortOrder: i, archived: false, createdAt: t, updatedAt: t, deletedAt: null }
      await db.categories.add(c)
      await queue('categories', c.id)
    }
    await db.meta.put({ key: 'initialized', value: t })
  })
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => {})
}

export interface MoneyInput {
  kind: EntryKind
  title: string
  amount: number
  categoryId: ID | null
  occurredAt: string
  note: string | null
}

/**
 * Log money. Also creates/updates the matching item (by name), so whatever you
 * log once shows up in Quick Add recents next time — no separate "save as
 * template" step.
 */
export async function logMoney(input: MoneyInput, editId?: ID): Promise<ID> {
  const settings = await getSettings()
  const t = now()
  const localDate = localDateOf(new Date(input.occurredAt), settings.timezone, settings.rolloverHour)
  const money = {
    direction: input.kind === 'income' ? ('in' as const) : ('out' as const),
    amount: input.amount,
    currency: settings.currency,
    categoryId: input.categoryId,
  }

  return db.transaction('rw', db.entries, db.items, db.outbox, async () => {
    const key = normalizeName(input.title)
    let item = key
      ? (await db.items.filter((i) => !i.deletedAt && i.kind === input.kind && normalizeName(i.name) === key).first())
      : undefined
    const isNewUse = !editId
    if (item) {
      item = {
        ...item,
        name: input.title.trim(),
        money: { amount: input.amount, currency: settings.currency, categoryId: input.categoryId },
        useCount: item.useCount + (isNewUse ? 1 : 0),
        lastUsedAt: isNewUse ? t : item.lastUsedAt,
        archived: false,
        updatedAt: t,
      }
      await db.items.put(item)
      await queue('items', item.id)
    } else if (key) {
      item = {
        id: uid(),
        name: input.title.trim(),
        kind: input.kind,
        money: { amount: input.amount, currency: settings.currency, categoryId: input.categoryId },
        useCount: 1,
        lastUsedAt: t,
        favorite: false,
        archived: false,
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
      }
      await db.items.add(item)
      await queue('items', item.id)
    }

    const existing = editId ? await db.entries.get(editId) : undefined
    const entry: Entry = {
      id: existing?.id ?? uid(),
      kind: input.kind,
      occurredAt: input.occurredAt,
      localDate,
      itemId: item?.id ?? null,
      title: input.title.trim() || (input.kind === 'income' ? 'Income' : 'Expense'),
      note: input.note?.trim() || null,
      money,
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
      deletedAt: null,
    }
    await db.entries.put(entry)
    await queue('entries', entry.id)
    return entry.id
  })
}

/** One-tap repeat of an item with its remembered values, at the current time. */
export async function logItem(item: Item): Promise<ID> {
  return logMoney({
    kind: item.kind,
    title: item.name,
    amount: item.money?.amount ?? 0,
    categoryId: item.money?.categoryId ?? null,
    occurredAt: now(),
    note: null,
  })
}

export async function setEntryDeleted(id: ID, deleted: boolean) {
  await db.transaction('rw', db.entries, db.outbox, async () => {
    const t = now()
    await db.entries.update(id, { deletedAt: deleted ? t : null, updatedAt: t })
    await queue('entries', id)
  })
}

async function touch<T extends { id: ID }>(table: Exclude<SyncTable, 'profiles'>, row: T) {
  // Dexie's put is typed per table; the tables share the Synced shape.
  await (db[table] as unknown as { put(r: T): Promise<unknown> }).put(row)
  await queue(table, row.id)
}

export async function updateItem(item: Item, patch: Partial<Pick<Item, 'name' | 'favorite' | 'archived'>>) {
  await db.transaction('rw', db.items, db.outbox, () => touch('items', { ...item, ...patch, updatedAt: now() }))
}

export async function addCategory(name: string) {
  const t = now()
  const count = await db.categories.count()
  const c: Category = { id: uid(), name: name.trim(), sortOrder: count, archived: false, createdAt: t, updatedAt: t, deletedAt: null }
  await db.transaction('rw', db.categories, db.outbox, () => touch('categories', c))
}

export async function updateCategory(c: Category, patch: Partial<Pick<Category, 'name' | 'archived'>>) {
  await db.transaction('rw', db.categories, db.outbox, () => touch('categories', { ...c, ...patch, updatedAt: now() }))
}

/** Targets are versioned: a change adds a row effective from `from`. */
export async function setTarget(key: TargetKey, value: number | null, unit: string, from: LocalDate) {
  const t = now()
  await db.transaction('rw', db.targets, db.outbox, async () => {
    // Replace a same-day change instead of stacking versions.
    const sameDay = await db.targets.where('key').equals(key).filter((x) => x.effectiveFrom === from && !x.deletedAt).first()
    const row: Target = {
      id: sameDay?.id ?? uid(),
      key,
      value: value ?? 0,
      unit,
      effectiveFrom: from,
      source: 'user',
      createdAt: sameDay?.createdAt ?? t,
      updatedAt: t,
      deletedAt: value == null ? t : null,
    }
    await touch('targets', row)
  })
}

/** Current value of a target on a given day, or null. */
export function targetOn(targets: Target[], key: TargetKey, day: LocalDate): number | null {
  const current = targets
    .filter((x) => x.key === key && x.effectiveFrom <= day)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.updatedAt.localeCompare(a.updatedAt))[0]
  return current && !current.deletedAt ? current.value : null
}
