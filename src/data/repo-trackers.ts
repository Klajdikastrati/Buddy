import type { CustomFacet, ID, Instant, TrackerDef } from '../core/types'
import { created, patch, save, saveEntry } from './repo-base'

export type TrackerInput = Pick<TrackerDef, 'name' | 'fields'>

export function saveTracker(input: TrackerInput, existing?: TrackerDef): Promise<TrackerDef> {
  const values = { name: input.name.trim(), fields: input.fields }
  return existing ? patch('trackers', existing, values) : save<TrackerDef>('trackers', { ...created(), ...values, archived: false })
}

export function archiveTracker(def: TrackerDef, archived = true) {
  return patch('trackers', def, { archived })
}

/** A custom-tracker log is an entry with a `custom` facet holding one value per field. */
export async function logTracker(
  def: TrackerDef,
  values: CustomFacet['values'],
  occurredAt: Instant,
  note: string | null,
  editId?: ID,
): Promise<ID> {
  const entry = await saveEntry(
    { kind: 'custom', title: def.name, occurredAt, note, custom: { trackerId: def.id, values } },
    editId,
  )
  return entry.id
}
