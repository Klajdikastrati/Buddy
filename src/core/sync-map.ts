// Mapping between the local shape (facets embedded, camelCase) and the server
// tables (facet tables, snake_case). Pure — shared by any client.
import type { Category, Entry, Item, Settings, Target } from './types'

type Row = Record<string, unknown>

export function entryToServer(e: Entry): { entry: Row; money: Row | null } {
  return {
    entry: {
      id: e.id,
      kind: e.kind,
      occurred_at: e.occurredAt,
      local_date: e.localDate,
      item_id: e.itemId,
      title: e.title,
      note: e.note,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
      deleted_at: e.deletedAt,
    },
    money: e.money
      ? {
          entry_id: e.id,
          direction: e.money.direction,
          amount: e.money.amount,
          currency: e.money.currency,
          category_id: e.money.categoryId,
          updated_at: e.updatedAt,
        }
      : null,
  }
}

export function entryFromServer(r: Row): Entry {
  const m = r.entry_money as Row | null | undefined
  return {
    id: r.id as string,
    kind: r.kind as Entry['kind'],
    occurredAt: iso(r.occurred_at),
    localDate: r.local_date as string,
    itemId: (r.item_id as string | null) ?? null,
    title: r.title as string,
    note: (r.note as string | null) ?? null,
    money: m
      ? {
          direction: m.direction as 'in' | 'out',
          amount: Number(m.amount),
          currency: (m.currency as string).trim(),
          categoryId: (m.category_id as string | null) ?? null,
        }
      : undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    deletedAt: r.deleted_at ? iso(r.deleted_at) : null,
  }
}

export function itemToServer(i: Item): Row {
  return {
    id: i.id,
    name: i.name,
    kind: i.kind,
    default_amount: i.money?.amount ?? null,
    currency: i.money?.currency ?? null,
    category_id: i.money?.categoryId ?? null,
    use_count: i.useCount,
    last_used_at: i.lastUsedAt,
    favorite: i.favorite,
    archived: i.archived,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
    deleted_at: i.deletedAt,
  }
}

export function itemFromServer(r: Row): Item {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as Item['kind'],
    money:
      r.default_amount == null
        ? undefined
        : {
            amount: Number(r.default_amount),
            currency: String(r.currency ?? 'ALL').trim(),
            categoryId: (r.category_id as string | null) ?? null,
          },
    useCount: Number(r.use_count),
    lastUsedAt: r.last_used_at ? iso(r.last_used_at) : null,
    favorite: Boolean(r.favorite),
    archived: Boolean(r.archived),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    deletedAt: r.deleted_at ? iso(r.deleted_at) : null,
  }
}

export function categoryToServer(c: Category): Row {
  return {
    id: c.id,
    name: c.name,
    sort_order: c.sortOrder,
    archived: c.archived,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
  }
}

export function categoryFromServer(r: Row): Category {
  return {
    id: r.id as string,
    name: r.name as string,
    sortOrder: Number(r.sort_order),
    archived: Boolean(r.archived),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    deletedAt: r.deleted_at ? iso(r.deleted_at) : null,
  }
}

export function targetToServer(t: Target): Row {
  return {
    id: t.id,
    key: t.key,
    value: t.value,
    unit: t.unit,
    effective_from: t.effectiveFrom,
    source: t.source,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    deleted_at: t.deletedAt,
  }
}

export function targetFromServer(r: Row): Target {
  return {
    id: r.id as string,
    key: r.key as Target['key'],
    value: Number(r.value),
    unit: r.unit as string,
    effectiveFrom: r.effective_from as string,
    source: r.source as Target['source'],
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    deletedAt: r.deleted_at ? iso(r.deleted_at) : null,
  }
}

export function settingsToServer(s: Settings, updatedAt: string): Row {
  return { currency: s.currency, timezone: s.timezone, rollover_hour: s.rolloverHour, updated_at: updatedAt }
}

export function settingsFromServer(r: Row): Settings {
  return {
    currency: String(r.currency).trim(),
    timezone: r.timezone as string,
    rolloverHour: Number(r.rollover_hour),
  }
}

/** Postgres returns `+00:00` offsets and microseconds; normalise to JS ISO. */
function iso(v: unknown): string {
  return new Date(v as string).toISOString()
}

/** True when the remote copy should replace the local one (last write wins). */
export function remoteWins(localUpdatedAt: string | undefined, remoteUpdatedAt: string): boolean {
  return !localUpdatedAt || Date.parse(remoteUpdatedAt) >= Date.parse(localUpdatedAt)
}
