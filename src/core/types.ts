// Domain types shared by every client. Pure data — no React, no storage.
// Locally an entry embeds its facets; on the server each facet is its own table
// (see docs/DATA_MODEL.md). The sync layer maps between the two shapes.

export type ID = string
/** Calendar day in the user's day (rollover-aware), `YYYY-MM-DD`. */
export type LocalDate = string
/** ISO-8601 instant. */
export type Instant = string

export interface Synced {
  id: ID
  createdAt: Instant
  updatedAt: Instant
  /** Soft delete — keeps undo trivial and lets deletions sync. */
  deletedAt: Instant | null
}

/** The primary nature of an entry. Facets carry the data; one entry may have several (a bought Red Bull = food + money). */
export type EntryKind =
  | 'expense'
  | 'income'
  | 'food'
  | 'sleep'
  | 'weight'
  | 'activity'
  | 'workout'
  | 'custom'
  | 'note'

export interface MoneyFacet {
  direction: 'out' | 'in'
  amount: number
  currency: string
  categoryId: ID | null
}

/** Nutrient amounts. `null` = unknown — never treated as zero. */
export interface Nutrients {
  kcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  sugarG: number | null
  satFatG: number | null
  sodiumMg: number | null
  caffeineMg: number | null
}

export const NUTRIENT_KEYS = [
  'kcal',
  'proteinG',
  'carbsG',
  'fatG',
  'fiberG',
  'sugarG',
  'satFatG',
  'sodiumMg',
  'caffeineMg',
] as const satisfies readonly (keyof Nutrients)[]

/** Snapshot at log time: editing the food later never rewrites history. */
export interface NutritionFacet extends Nutrients {
  foodId: ID | null
  /** Amount eaten in grams (or ml for liquids). */
  grams: number | null
  servingLabel: string | null
}

export interface SleepFacet {
  bedAt: Instant | null
  wakeAt: Instant | null
  durationMin: number
  quality: number | null // 1–5
}

export interface MeasurementFacet {
  metric: 'bodyweight' | 'waist'
  value: number
  unit: string
}

export interface ActivityFacet {
  type: 'walk' | 'run' | 'cycle' | 'other'
  durationMin: number | null
  distanceKm: number | null
  steps: number | null
}

export interface WorkoutFacet {
  templateId: ID | null
  startedAt: Instant
  endedAt: Instant | null
}

export interface CustomFacet {
  trackerId: ID
  values: Record<string, string | number | boolean | null>
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
  nutrition?: NutritionFacet
  sleep?: SleepFacet
  measurement?: MeasurementFacet
  activity?: ActivityFacet
  workout?: WorkoutFacet
  custom?: CustomFacet
}

export type ItemKind = 'expense' | 'income' | 'food'

/** A reusable real-world thing ("Red Bull 250ml", "Coffee"). Logging it copies
 *  its defaults into a new entry; editing it never rewrites history. */
export interface Item extends Synced {
  name: string
  kind: ItemKind
  money?: { amount: number; currency: string; categoryId: ID | null }
  food?: { foodId: ID; grams: number; servingLabel: string | null }
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

export interface Serving {
  label: string
  grams: number
}

/** Nutrition per 100 g (or 100 ml). Recipes keep their ingredients. */
export interface Food extends Synced, Nutrients {
  name: string
  brand: string | null
  barcode: string | null
  basis: '100g' | '100ml'
  servings: Serving[]
  ingredients: { foodId: ID; grams: number }[] | null
  source: 'custom' | 'off' | 'recipe'
  sourceId: string | null
  favorite: boolean
  useCount: number
  lastUsedAt: Instant | null
  archived: boolean
}

/** One per day — what Buddy can't infer from other logs. */
export interface DayCheckin {
  localDate: LocalDate
  mood: number | null // 1–5
  energy: number | null
  stress: number | null
  productivity: number | null
  note: string | null
  createdAt: Instant
  updatedAt: Instant
}

export interface Exercise extends Synced {
  name: string
  muscle: string | null
  archived: boolean
}

export interface TemplateExercise {
  exerciseId: ID
  sets: number
  reps: number | null
}

export interface WorkoutTemplate extends Synced {
  name: string
  exercises: TemplateExercise[]
  /** 0 = Sunday … 6 = Saturday — drives "Today: Pull Day". */
  weekdays: number[]
  archived: boolean
}

export interface WorkoutSet extends Synced {
  entryId: ID
  exerciseId: ID
  exerciseOrder: number
  setIndex: number
  reps: number | null
  weightKg: number | null
  isWarmup: boolean
  doneAt: Instant | null
}

export type PlanKind = 'task' | 'routine' | 'goal'

export interface PlanItem extends Synced {
  kind: PlanKind
  title: string
  /** task: the day it's for (null = someday). goal: the week's Monday. */
  localDate: LocalDate | null
  /** routine: days it applies (0 = Sunday). */
  weekdays: number[]
  /** routine: days it was done. */
  doneDates: LocalDate[]
  /** task / goal: when completed. */
  doneAt: Instant | null
  archived: boolean
}

export type TrackerFieldType = 'number' | 'text' | 'bool'

export interface TrackerField {
  key: string
  label: string
  type: TrackerFieldType
  unit: string | null
}

export interface TrackerDef extends Synced {
  name: string
  fields: TrackerField[]
  archived: boolean
}

export type TargetKey =
  | 'budget_month'
  | 'kcal_daily'
  | 'protein_daily'
  | 'carbs_daily'
  | 'fat_daily'
  | 'sleep_min'
  | 'steps_daily'
  | 'workouts_week'
  | 'weight_goal'

/** Versioned: the current value is the latest row with effectiveFrom <= day. */
export interface Target extends Synced {
  key: TargetKey
  value: number
  unit: string
  effectiveFrom: LocalDate
  source: 'user' | 'default' | 'analyst'
  recommendationId: ID | null
}

export interface AnalystRun extends Synced {
  importedAt: Instant
  periodFrom: LocalDate | null
  periodTo: LocalDate | null
  analystVersion: string | null
  model: string | null
  /** The validated analysis document as imported. */
  payload: unknown
}

export interface Recommendation extends Synced {
  runId: ID
  type: string
  targetKey: TargetKey
  currentValue: number | null
  suggestedValue: number
  unit: string
  reason: string
  confidence: 'low' | 'medium' | 'high'
  status: 'pending' | 'accepted' | 'rejected' | 'stale'
  decidedAt: Instant | null
}

export interface Settings {
  currency: string
  timezone: string
  /** Hours after midnight that still count as the previous day. */
  rolloverHour: number
}
