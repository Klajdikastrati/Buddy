import { ACTIVITY_LABEL, sleepMinutes } from '../core/body'
import type { ActivityFacet, DayCheckin, ID, Instant, LocalDate } from '../core/types'
import { db } from './db'
import { now, save, saveEntry } from './repo-base'

export interface SleepInput {
  bedAt: Instant
  wakeAt: Instant
  quality: number | null
  note: string | null
}

/** A night's sleep belongs to the day you woke up. */
export async function logSleep(input: SleepInput, editId?: ID): Promise<ID> {
  const durationMin = sleepMinutes(input.bedAt, input.wakeAt)
  if (durationMin == null) throw new Error('Wake time must be after bedtime')
  const entry = await saveEntry(
    {
      kind: 'sleep',
      title: 'Sleep',
      occurredAt: input.wakeAt,
      note: input.note,
      sleep: { bedAt: input.bedAt, wakeAt: input.wakeAt, durationMin, quality: input.quality },
    },
    editId,
  )
  return entry.id
}

export async function logWeight(input: { kg: number; occurredAt: Instant; note: string | null }, editId?: ID): Promise<ID> {
  const entry = await saveEntry(
    {
      kind: 'weight',
      title: 'Weight',
      occurredAt: input.occurredAt,
      note: input.note,
      measurement: { metric: 'bodyweight', value: input.kg, unit: 'kg' },
    },
    editId,
  )
  return entry.id
}

export async function logActivity(
  input: ActivityFacet & { occurredAt: Instant; note: string | null },
  editId?: ID,
): Promise<ID> {
  const { occurredAt, note, ...activity } = input
  const entry = await saveEntry(
    { kind: 'activity', title: ACTIVITY_LABEL[activity.type], occurredAt, note, activity },
    editId,
  )
  return entry.id
}

export type CheckinValues = Pick<DayCheckin, 'mood' | 'energy' | 'stress' | 'productivity' | 'note'>

/** One check-in per day: saving again replaces that day's values. */
export async function saveCheckin(localDate: LocalDate, values: CheckinValues): Promise<DayCheckin> {
  const existing = await db.checkins.get(localDate)
  const t = now()
  return save<DayCheckin>('checkins', {
    localDate,
    ...values,
    note: values.note?.trim() || null,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  })
}
