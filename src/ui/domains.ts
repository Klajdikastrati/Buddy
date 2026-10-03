import type { Entry } from '../core/types'
import type { IconName } from './icons'

/** Each domain's identity: icon + tint (CSS colour token). Colour marks *what*, never good/bad. */
export const DOMAIN = {
  money: { icon: 'money', tint: 'var(--c-money)', label: 'Money' },
  expense: { icon: 'expense', tint: 'var(--c-money)', label: 'Expense' },
  income: { icon: 'income', tint: 'var(--c-money)', label: 'Income' },
  food: { icon: 'food', tint: 'var(--c-food)', label: 'Food' },
  sleep: { icon: 'sleep', tint: 'var(--c-sleep)', label: 'Sleep' },
  weight: { icon: 'weight', tint: 'var(--c-weight)', label: 'Weight' },
  activity: { icon: 'activity', tint: 'var(--c-activity)', label: 'Activity' },
  workout: { icon: 'workout', tint: 'var(--c-workout)', label: 'Workout' },
  checkin: { icon: 'checkin', tint: 'var(--c-checkin)', label: 'Check-in' },
  plan: { icon: 'plan', tint: 'var(--c-plan)', label: 'Plan' },
  tracker: { icon: 'tracker', tint: 'var(--c-tracker)', label: 'Tracker' },
  note: { icon: 'note', tint: 'var(--c-tracker)', label: 'Note' },
  analyst: { icon: 'sparkle', tint: 'var(--c-analyst)', label: 'Analyst' },
} as const satisfies Record<string, { icon: IconName; tint: string; label: string }>

export type DomainKey = keyof typeof DOMAIN

/** The domain an entry is shown under (by its main facet). */
export function entryDomain(e: Entry): DomainKey {
  if (e.nutrition) return 'food'
  if (e.sleep) return 'sleep'
  if (e.measurement) return 'weight'
  if (e.activity) return 'activity'
  if (e.workout) return 'workout'
  if (e.custom) return 'tracker'
  if (e.money) return e.money.direction === 'in' ? 'income' : 'expense'
  return 'note'
}
