import { normalizeName } from '../core/recents'
import type { Category, EntryKind, ID, Item, LocalDate, Settings, Target, TargetKey } from '../core/types'
import { uid } from '../core/uid'
import { db } from './db'
import { created, dayOf, entryRow, getSettings, now, patch, put, queue, rememberItem, save } from './repo-base'
import { logFoodItem } from './repo-food'

// Settings, money, categories, items and targets. Other domains live in
// repo-<domain>.ts; shared plumbing in repo-base.ts.

export { getSettings }

export async function saveSettings(changes: Partial<Settings>) {
  const current = await getSettings()
  await db.transaction('rw', db.meta, db.outbox, async () => {
    await db.meta.put({ key: 'settings', value: { ...current, ...changes, updatedAt: now() } })
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
    if ((await db.categories.count()) === 0) {
      for (const [i, name] of DEFAULT_CATEGORIES.entries()) {
        await put<Category>('categories', { ...created(t), name, sortOrder: i, archived: false })
      }
    }
    await db.meta.put({ key: 'initialized', value: t })
  })
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => {})
}

export type MoneyKind = Extract<EntryKind, 'expense' | 'income'>

export interface MoneyInput {
  kind: MoneyKind
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
  const localDate = await dayOf(input.occurredAt)
  const money = { amount: input.amount, currency: settings.currency, categoryId: input.categoryId }

  return db.transaction('rw', db.entries, db.items, db.outbox, async () => {
    const key = normalizeName(input.title)
    const item = key
      ? await rememberItem(
          (i) => i.kind === input.kind && normalizeName(i.name) === key,
          { name: input.title.trim(), kind: input.kind, money },
          !editId,
        )
      : undefined
    const entry = await entryRow(
      {
        kind: input.kind,
        occurredAt: input.occurredAt,
        itemId: item?.id ?? null,
        title: input.title.trim() || (input.kind === 'income' ? 'Income' : 'Expense'),
        note: input.note,
        money: { direction: input.kind === 'income' ? 'in' : 'out', ...money },
      },
      localDate,
      editId,
    )
    await put('entries', entry)
    return entry.id
  })
}

/** One-tap repeat of an item with its remembered values, at the current time. */
export async function logItem(item: Item): Promise<ID> {
  if (item.kind === 'food') return logFoodItem(item)
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

export function updateItem(item: Item, changes: Partial<Pick<Item, 'name' | 'favorite' | 'archived'>>) {
  return patch('items', item, changes)
}

export async function addCategory(name: string) {
  const sortOrder = await db.categories.count()
  return save<Category>('categories', { ...created(), name: name.trim(), sortOrder, archived: false })
}

export function updateCategory(c: Category, changes: Partial<Pick<Category, 'name' | 'archived'>>) {
  return patch('categories', c, changes)
}

/**
 * Targets are versioned: a change adds a row effective from `from`; `null`
 * removes the target from that day. Analyst-applied changes carry provenance.
 */
export async function setTarget(
  key: TargetKey,
  value: number | null,
  unit: string,
  from: LocalDate,
  provenance: { source: Target['source']; recommendationId: ID | null } = { source: 'user', recommendationId: null },
) {
  const t = now()
  await db.transaction('rw', db.targets, db.outbox, async () => {
    // Replace a same-day change instead of stacking versions.
    const sameDay = await db.targets
      .where('key')
      .equals(key)
      .filter((x) => x.effectiveFrom === from && !x.deletedAt)
      .first()
    await put<Target>('targets', {
      id: sameDay?.id ?? uid(),
      key,
      value: value ?? 0,
      unit,
      effectiveFrom: from,
      ...provenance,
      createdAt: sameDay?.createdAt ?? t,
      updatedAt: t,
      deletedAt: value == null ? t : null,
    })
  })
}
