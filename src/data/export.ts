import { addDays, localDateOf } from '../core/dates'
import { buildExport, exportFileName, type BuddyExport } from '../core/export'
import { uid } from '../core/uid'
import { db } from './db'
import { getSettings } from './repo-base'

/** Load everything the export needs for the last `days` days and build buddy-export v1. */
export async function collectExport(days: number): Promise<{ data: BuddyExport; file: File }> {
  const settings = await getSettings()
  const to = localDateOf(new Date(), settings.timezone, settings.rolloverHour)
  const from = addDays(to, -(days - 1))
  const entries = await db.entries.where('localDate').between(from, to, true, true).toArray()
  const [sets, foods, exercises, templates, checkins, trackers, recommendations, targets, firstMoney] = await Promise.all([
    db.sets.where('entryId').anyOf(entries.map((e) => e.id)).toArray(),
    db.foods.toArray(),
    db.exercises.toArray(),
    db.templates.toArray(),
    db.checkins.where('localDate').between(from, to, true, true).toArray(),
    db.trackers.toArray(),
    db.recommendations.toArray(),
    db.targets.toArray(),
    db.entries
      .orderBy('localDate')
      .filter((e) => !!e.money && !e.deletedAt)
      .first(),
  ])
  const data = buildExport({
    exportId: uid(),
    generatedAt: new Date().toISOString(),
    from,
    to,
    settings,
    targets,
    entries,
    sets,
    foods,
    exercises,
    templates,
    checkins,
    trackers,
    recommendations,
    moneySince: firstMoney?.localDate ?? null,
  })
  const file = new File([JSON.stringify(data, null, 2)], exportFileName(to), { type: 'application/json' })
  return { data, file }
}
