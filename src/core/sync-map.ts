// Mapping between the local shape (facets embedded, camelCase) and the server
// tables (facet tables, snake_case). Pure — shared by any client.
import type {
  AnalystRun,
  Category,
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
} from './types'

export type Row = Record<string, unknown>

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** Postgres returns `+00:00` offsets and microseconds; normalise to JS ISO. */
function iso(v: unknown): string {
  return new Date(v as string).toISOString()
}

/** camelCase object → snake_case row. */
export function toRow(obj: object, omit: string[] = []): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(obj)) {
    if (omit.includes(k) || v === undefined) continue
    out[snake(k)] = v
  }
  return out
}

/** snake_case row → camelCase object. Timestamps (`…At`) normalised, listed numerics coerced. */
export function fromRow<T>(row: Row, numeric: readonly string[] = []): T {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id' || k === 'server_updated_at') continue
    const key = camel(k)
    if (v != null && key.endsWith('At') && typeof v === 'string') out[key] = iso(v)
    else if (v != null && numeric.includes(key)) out[key] = Number(v)
    else out[key] = v
  }
  return out as T
}

const NUTRIENTS = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'satFatG', 'sodiumMg', 'caffeineMg']

/* ---------------------------------- entries --------------------------------- */

/** Facet table → local property. Order matters only for readability. */
export const FACETS = {
  entry_money: 'money',
  entry_nutrition: 'nutrition',
  entry_sleep: 'sleep',
  entry_measurement: 'measurement',
  entry_activity: 'activity',
  entry_workout: 'workout',
  entry_custom: 'custom',
} as const satisfies Record<string, keyof Entry>

export type FacetTable = keyof typeof FACETS

const FACET_NUMERIC: Record<FacetTable, string[]> = {
  entry_money: ['amount'],
  entry_nutrition: ['grams', ...NUTRIENTS],
  entry_sleep: ['durationMin', 'quality'],
  entry_measurement: ['value'],
  entry_activity: ['durationMin', 'distanceKm', 'steps'],
  entry_workout: [],
  entry_custom: [],
}

export function entryToServer(e: Entry): { entry: Row; facets: Record<FacetTable, Row | null> } {
  const facetKeys = Object.values(FACETS) as string[]
  const facets = {} as Record<FacetTable, Row | null>
  for (const [table, prop] of Object.entries(FACETS) as [FacetTable, keyof Entry][]) {
    const f = e[prop] as object | undefined
    facets[table] = f ? { entry_id: e.id, ...toRow(f), updated_at: e.updatedAt } : null
  }
  return { entry: toRow(e, facetKeys), facets }
}

export function entryFromServer(r: Row): Entry {
  const base: Row = {}
  for (const [k, v] of Object.entries(r)) if (!(k in FACETS)) base[k] = v
  const entry = fromRow<Entry>(base)
  for (const [table, prop] of Object.entries(FACETS) as [FacetTable, keyof Entry][]) {
    const raw = r[table]
    const f = (Array.isArray(raw) ? raw[0] : raw) as Row | null | undefined
    if (!f) continue
    const { entryId: _e, updatedAt: _u, ...facet } = fromRow<Row>(f, FACET_NUMERIC[table])
    if (table === 'entry_money') facet.currency = String(facet.currency).trim()
    ;(entry as unknown as Row)[prop] = facet
  }
  return entry
}

/** PostgREST select that embeds every facet. */
export const ENTRY_SELECT = `*, ${Object.keys(FACETS)
  .map((t) => `${t}(*)`)
  .join(', ')}`

/* ----------------------------------- items ---------------------------------- */

export function itemToServer(i: Item): Row {
  return {
    ...toRow(i, ['money', 'food']),
    default_amount: i.money?.amount ?? null,
    currency: i.money?.currency ?? null,
    category_id: i.money?.categoryId ?? null,
    food_id: i.food?.foodId ?? null,
    food_grams: i.food?.grams ?? null,
    food_serving_label: i.food?.servingLabel ?? null,
  }
}

export function itemFromServer(r: Row): Item {
  const { defaultAmount, currency, categoryId, foodId, foodGrams, foodServingLabel, ...rest } = fromRow<Row>(r, [
    'defaultAmount',
    'foodGrams',
    'useCount',
  ])
  const item = rest as unknown as Item
  if (defaultAmount != null) {
    item.money = {
      amount: defaultAmount as number,
      currency: String(currency ?? 'ALL').trim(),
      categoryId: (categoryId as string | null) ?? null,
    }
  }
  if (foodId) {
    item.food = {
      foodId: foodId as string,
      grams: (foodGrams as number | null) ?? 100,
      servingLabel: (foodServingLabel as string | null) ?? null,
    }
  }
  return item
}

/* --------------------------- simple tables (flat) --------------------------- */

export interface TableSpec<T> {
  server: string
  onConflict: string
  toServer: (row: T) => Row
  fromServer: (row: Row) => T
}

const flat = <T extends object>(server: string, numeric: string[] = [], onConflict = 'id'): TableSpec<T> => ({
  server,
  onConflict,
  toServer: (row) => toRow(row),
  fromServer: (row) => fromRow<T>(row, numeric),
})

export const SPECS = {
  categories: flat<Category>('categories', ['sortOrder']),
  foods: flat<Food>('foods', [...NUTRIENTS, 'useCount']),
  exercises: flat<Exercise>('exercises'),
  templates: flat<WorkoutTemplate>('workout_templates'),
  trackers: flat<TrackerDef>('tracker_defs'),
  sets: flat<WorkoutSet>('workout_sets', ['reps', 'weightKg', 'exerciseOrder', 'setIndex']),
  checkins: flat<DayCheckin>('day_checkins', [], 'user_id,local_date'),
  plan: flat<PlanItem>('plan_items'),
  analystRuns: flat<AnalystRun>('analyst_runs'),
  recommendations: flat<Recommendation>('recommendations', ['currentValue', 'suggestedValue']),
  targets: flat<Target>('targets', ['value']),
  items: { server: 'items', onConflict: 'id', toServer: itemToServer, fromServer: itemFromServer } as TableSpec<Item>,
}

/* --------------------------------- settings --------------------------------- */

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

/** True when the remote copy should replace the local one (last write wins). */
export function remoteWins(localUpdatedAt: string | undefined, remoteUpdatedAt: string): boolean {
  return !localUpdatedAt || Date.parse(remoteUpdatedAt) >= Date.parse(localUpdatedAt)
}
