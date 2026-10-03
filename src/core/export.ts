// buddy-export v1 — the read-only hand-off to Buddy Analyst (docs/history §13).
// Pure: the caller loads rows; this shapes them. snake_case because it's an
// external contract. null always means "not logged / unknown", never zero.
import { daysBetween } from './dates'
import { dailySeries, type DayRow } from './series'
import { correlations, MIN_N, weekdayWeekend } from './signals'
import { TARGET_DEFS, targetHistory, targetOn } from './targets'
import { durationMin, finishedWorkouts, volumeOf } from './training'
import {
  NUTRIENT_KEYS,
  type DayCheckin,
  type Entry,
  type Exercise,
  type Food,
  type LocalDate,
  type Nutrients,
  type Recommendation,
  type Settings,
  type Target,
  type TrackerDef,
  type WorkoutSet,
  type WorkoutTemplate,
} from './types'

export const EXPORT_VERSION = '1'

export interface ExportInput {
  exportId: string
  generatedAt: string
  from: LocalDate
  to: LocalDate
  settings: Settings
  targets: Target[]
  entries: Entry[]
  sets: WorkoutSet[]
  foods: Food[]
  exercises: Exercise[]
  templates: WorkoutTemplate[]
  checkins: DayCheckin[]
  trackers: TrackerDef[]
  recommendations: Recommendation[]
  /** First day money was ever logged (spend is 0, not unknown, from then). */
  moneySince: LocalDate | null
}

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
function snakeKeys<T extends object>(o: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [snake(k), v]))
}

const nutrients = (n: Nutrients) => Object.fromEntries(NUTRIENT_KEYS.map((k) => [snake(k), n[k]]))

/** Spelled out field by field: this is the contract the Analyst reads. */
function dailyRow(r: DayRow) {
  return {
    date: r.date,
    spend: r.spend,
    income: r.income,
    kcal: r.kcal,
    protein_g: r.proteinG,
    caffeine_mg: r.caffeineMg,
    food_entries: r.foodEntries,
    food_incomplete: r.foodIncomplete,
    sleep_min: r.sleepMin,
    sleep_quality: r.sleepQuality,
    weight_kg: r.weightKg,
    activity_min: r.activityMin,
    km: r.km,
    steps: r.steps,
    workouts: r.workouts,
    volume_kg: r.volumeKg,
    mood: r.mood,
    energy: r.energy,
    stress: r.stress,
    productivity: r.productivity,
    logged: r.logged,
    trackers: r.trackers,
  }
}

export function buildExport(input: ExportInput) {
  const { from, to, settings } = input
  const inPeriod = (d: LocalDate) => d >= from && d <= to
  const entries = input.entries.filter((e) => !e.deletedAt && inPeriod(e.localDate))
  const entryIds = new Set(entries.map((e) => e.id))
  const sets = input.sets.filter((s) => !s.deletedAt && entryIds.has(s.entryId))
  const checkins = input.checkins.filter((c) => inPeriod(c.localDate))
  const rows = dailySeries({ entries, sets, checkins, trackers: input.trackers, from, to, moneySince: input.moneySince })

  const exerciseName = new Map(input.exercises.map((e) => [e.id, e.name]))
  const templateName = new Map(input.templates.map((t) => [t.id, t.name]))
  const foodIds = new Set(entries.flatMap((e) => (e.nutrition?.foodId ? [e.nutrition.foodId] : [])))
  const usedExerciseIds = new Set(sets.map((s) => s.exerciseId))

  /* targets */
  const current: Record<string, unknown> = {}
  for (const def of TARGET_DEFS) {
    const value = targetOn(input.targets, def.key, to)
    if (value == null) continue
    const row = targetHistory(input.targets, def.key).find((t) => t.effectiveFrom <= to && !t.deletedAt)!
    current[def.key] = { value, unit: row.unit, effective_from: row.effectiveFrom, source: row.source }
  }
  const bounds = Object.fromEntries(TARGET_DEFS.map((d) => [d.key, { min: d.min, max: d.max, unit: d.unit ?? settings.currency }]))

  /* data quality */
  const unknownByNutrient: Record<string, number> = Object.fromEntries(NUTRIENT_KEYS.map((k) => [snake(k), 0]))
  const food = entries.filter((e) => e.nutrition)
  for (const e of food) for (const k of NUTRIENT_KEYS) if (e.nutrition![k] == null) unknownByNutrient[snake(k)]++
  const missing = (pick: (r: DayRow) => unknown) => rows.filter((r) => pick(r) == null).length

  const recById = new Map(input.recommendations.map((r) => [r.id, r]))
  const interventions = input.targets
    .filter((t) => t.source === 'analyst' && t.recommendationId && !t.deletedAt)
    .map((t) => {
      const rec = recById.get(t.recommendationId!)
      return {
        recommendation_id: t.recommendationId,
        target_key: t.key,
        from_value: rec?.currentValue ?? null,
        to_value: t.value,
        unit: t.unit,
        effective_from: t.effectiveFrom,
        decided_at: rec?.decidedAt ?? null,
        reason: rec?.reason ?? null,
      }
    })

  const signals = correlations(rows)

  return {
    export_version: EXPORT_VERSION,
    export_id: input.exportId,
    generated_at: input.generatedAt,
    app: 'buddy',
    period: { from, to, days: daysBetween(from, to) + 1 },
    conventions: {
      null: 'not logged or unknown — never zero',
      dates: `local days in ${settings.timezone}; a day starts at ${String(settings.rolloverHour).padStart(2, '0')}:00`,
      spend: input.moneySince ? `0 on days without spending from ${input.moneySince} (when money tracking started); null before` : 'no money logged',
      sleep: 'a night belongs to the day you woke up',
      nutrition: 'per entry snapshot at log time; totals count known values only (see data_quality.nutrition)',
    },
    profile: { currency: settings.currency, timezone: settings.timezone, rollover_hour: settings.rolloverHour },
    targets: {
      current,
      history: targetHistory(input.targets)
        .filter((t) => t.effectiveFrom <= to)
        .map((t) => ({
          key: t.key,
          value: t.deletedAt ? null : t.value,
          unit: t.unit,
          effective_from: t.effectiveFrom,
          source: t.source,
          recommendation_id: t.recommendationId,
          removed: !!t.deletedAt,
        })),
      proposal_bounds: bounds,
    },
    interventions,
    daily: rows.map(dailyRow),
    entries: [...entries]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map((e) => ({
        id: e.id,
        date: e.localDate,
        occurred_at: e.occurredAt,
        kind: e.kind,
        title: e.title,
        note: e.note,
        ...(e.money && { money: snakeKeys(e.money) }),
        ...(e.nutrition && { nutrition: { food_id: e.nutrition.foodId, grams: e.nutrition.grams, serving: e.nutrition.servingLabel, ...nutrients(e.nutrition) } }),
        ...(e.sleep && { sleep: snakeKeys(e.sleep) }),
        ...(e.measurement && { measurement: snakeKeys(e.measurement) }),
        ...(e.activity && { activity: snakeKeys(e.activity) }),
        ...(e.workout && { workout: { template: e.workout.templateId ? (templateName.get(e.workout.templateId) ?? null) : null, started_at: e.workout.startedAt, ended_at: e.workout.endedAt } }),
        ...(e.custom && { custom: { tracker_id: e.custom.trackerId, values: e.custom.values } }),
      })),
    foods_used: input.foods
      .filter((f) => foodIds.has(f.id))
      .map((f) => ({ id: f.id, name: f.name, brand: f.brand, basis: f.basis, source: f.source, per_100: nutrients(f), servings: f.servings, recipe: !!f.ingredients })),
    workouts: finishedWorkouts(entries)
      .reverse()
      .map((w) => {
        const own = sets.filter((s) => s.entryId === w.id).sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex)
        return {
          id: w.id,
          date: w.localDate,
          title: w.title,
          template: w.workout!.templateId ? (templateName.get(w.workout!.templateId) ?? null) : null,
          started_at: w.workout!.startedAt,
          ended_at: w.workout!.endedAt,
          duration_min: durationMin(w),
          volume_kg: volumeOf(own),
          sets: own
            .filter((s) => s.doneAt)
            .map((s) => ({ exercise: exerciseName.get(s.exerciseId) ?? s.exerciseId, set_index: s.setIndex, reps: s.reps, weight_kg: s.weightKg, warmup: s.isWarmup })),
        }
      }),
    exercises: input.exercises.filter((e) => usedExerciseIds.has(e.id)).map((e) => ({ id: e.id, name: e.name, muscle: e.muscle })),
    checkins: checkins.map((c) => ({ date: c.localDate, mood: c.mood, energy: c.energy, stress: c.stress, productivity: c.productivity, note: c.note })),
    trackers: input.trackers.filter((t) => !t.deletedAt).map((t) => ({ id: t.id, name: t.name, fields: t.fields })),
    data_quality: {
      days_in_period: rows.length,
      days_with_any_log: rows.filter((r) => r.logged).length,
      days_missing: {
        sleep: missing((r) => r.sleepMin),
        food: rows.filter((r) => r.foodEntries === 0).length,
        checkin: missing((r) => r.mood ?? r.energy ?? r.stress ?? r.productivity),
        weight: missing((r) => r.weightKg),
        money: input.moneySince ? rows.filter((r) => r.date < input.moneySince!).length : rows.length,
      },
      nutrition: {
        entries: food.length,
        entries_missing_kcal_or_macros: rows.reduce((t, r) => t + r.foodIncomplete, 0),
        unknown_by_nutrient: unknownByNutrient,
      },
    },
    signals: {
      method: 'Pearson r on daily values over the export period; 95% CI via Fisher z; association, not cause',
      min_n: MIN_N,
      correlations: signals.map((s) => ({ id: s.id, x: snake(s.x), y: snake(s.y), lag_days: s.lag, n: s.n, r: s.r, ci95: s.ci95, strength: s.strength, ready: s.ready })),
      weekday_weekend: weekdayWeekend(rows).map((w) => snakeKeys(w)),
    },
    analysis_contract: {
      file: 'buddy-analysis.json',
      schema_version: '1',
      proposed_change_types: ['target'],
      target_keys: bounds,
      rule: 'current_value must equal targets.current[key].value (or null if unset); proposals outside bounds are rejected',
    },
  }
}

export type BuddyExport = ReturnType<typeof buildExport>

export const exportFileName = (to: LocalDate) => `buddy-export-v1-${to}.json`
