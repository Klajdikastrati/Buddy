import { formatDuration } from './dates'
import { formatMoney } from './money'
import { formatNumber } from './numbers'
import type { LocalDate, Target, TargetKey } from './types'

export interface TargetDef {
  key: TargetKey
  label: string
  /** Unit stored with the target; `null` = the user's currency. */
  unit: string | null
  /** Bounds an Analyst proposal must stay within. The user may set anything. */
  min: number
  max: number
}

/** Every configurable target. Order = display order in Me → Targets. */
export const TARGET_DEFS: readonly TargetDef[] = [
  { key: 'kcal_daily', label: 'Calories', unit: 'kcal', min: 1200, max: 5000 },
  { key: 'protein_daily', label: 'Protein', unit: 'g', min: 40, max: 300 },
  { key: 'carbs_daily', label: 'Carbs', unit: 'g', min: 50, max: 700 },
  { key: 'fat_daily', label: 'Fat', unit: 'g', min: 20, max: 250 },
  { key: 'sleep_min', label: 'Sleep', unit: 'min', min: 300, max: 600 },
  { key: 'steps_daily', label: 'Steps', unit: 'steps', min: 1000, max: 30000 },
  { key: 'workouts_week', label: 'Workouts / week', unit: 'workouts', min: 1, max: 14 },
  { key: 'weight_goal', label: 'Goal weight', unit: 'kg', min: 35, max: 250 },
  { key: 'budget_month', label: 'Monthly budget', unit: null, min: 1000, max: 5_000_000 },
]

export const targetDef = (key: TargetKey): TargetDef => TARGET_DEFS.find((d) => d.key === key)!

export const isTargetKey = (k: unknown): k is TargetKey => TARGET_DEFS.some((d) => d.key === k)

/** "7h 30m", "150 g", "60,000 Lek". */
export function formatTarget(key: TargetKey, value: number, currency: string): string {
  const def = targetDef(key)
  if (key === 'sleep_min') return formatDuration(value)
  if (def.unit == null) return formatMoney(value, currency)
  return `${formatNumber(value)} ${def.unit === 'workouts' ? (value === 1 ? 'workout' : 'workouts') : def.unit}`
}

export const SOURCE_LABEL: Record<Target['source'], string> = { user: 'You', default: 'Default', analyst: 'Buddy Analyst' }

/** The row in effect on `day` for `key` (latest effectiveFrom ≤ day), if any. */
function currentRow(targets: Target[], key: TargetKey, day: LocalDate): Target | undefined {
  return targets
    .filter((x) => x.key === key && x.effectiveFrom <= day)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.updatedAt.localeCompare(a.updatedAt))[0]
}

/** Current value of a target on a given day, or null. A deleted latest row means "removed". */
export function targetOn(targets: Target[], key: TargetKey, day: LocalDate): number | null {
  const row = currentRow(targets, key, day)
  return row && !row.deletedAt ? row.value : null
}

/** Changes for one key, newest first; removals included (value shown as none). */
export function targetHistory(targets: Target[], key?: TargetKey): Target[] {
  return targets
    .filter((x) => !key || x.key === key)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.updatedAt.localeCompare(a.updatedAt))
}
