import type { ActivityFacet, Instant } from './types'

export const ACTIVITY_LABEL: Record<ActivityFacet['type'], string> = {
  walk: 'Walk',
  run: 'Run',
  cycle: 'Cycle',
  other: 'Activity',
}

/** Minutes between going to bed and waking, or null if the range is impossible (≤ 0 or > 24 h). */
export function sleepMinutes(bedAt: Instant, wakeAt: Instant): number | null {
  const min = Math.round((Date.parse(wakeAt) - Date.parse(bedAt)) / 60_000)
  return min > 0 && min <= 1440 ? min : null
}
