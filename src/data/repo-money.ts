import type { LocalDate, MoneyPlan } from '../core/types'
import { created, now, patch, save } from './repo-base'

export type MoneyPlanInput = Pick<MoneyPlan, 'kind' | 'name' | 'amount' | 'dayOfMonth' | 'date' | 'categoryId'>

export function addMoneyPlan(input: MoneyPlanInput): Promise<MoneyPlan> {
  return save<MoneyPlan>('moneyPlans', { ...created(), ...input, name: input.name.trim(), archived: false })
}

export function updateMoneyPlan(plan: MoneyPlan, changes: Partial<MoneyPlanInput & Pick<MoneyPlan, 'archived'>>) {
  return patch('moneyPlans', plan, changes.name ? { ...changes, name: changes.name.trim() } : changes)
}

export function setMoneyPlanDeleted(plan: MoneyPlan, deleted: boolean) {
  return patch('moneyPlans', plan, { deletedAt: deleted ? now() : null })
}

/**
 * "I have X right now." A new anchor row each time, so the history stays;
 * forecasts start from the newest and add everything logged after it.
 */
export function setBalance(amount: number, today: LocalDate): Promise<MoneyPlan> {
  return addMoneyPlan({ kind: 'balance', name: 'Balance', amount, dayOfMonth: null, date: today, categoryId: null })
}
