import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ACTIVITY_LABEL } from '../core/body'
import { parseDecimal } from '../core/numbers'
import type { ActivityFacet, Entry } from '../core/types'
import { db } from '../data/db'
import { logActivity } from '../data/repo-body'
import { confirmSaved, deleteEntry } from '../ui/entryActions'
import { NoteField, Segmented, SheetFooter, WhenField } from '../ui/fields'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'

const FORM = 'activity-form'
type ActivityType = ActivityFacet['type']
const TYPES = (Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((value) => ({
  value,
  label: value === 'other' ? 'Other' : ACTIVITY_LABEL[value],
}))

/** Type defaults to the last one logged. */
export function ActivitySheet({ entry }: { entry?: Entry }) {
  const lastType = useLiveQuery(async () => {
    const all = await db.entries.where('kind').equals('activity').filter((e) => !e.deletedAt).toArray()
    return all.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]?.activity?.type ?? 'walk'
  }, [])
  if (!lastType) return null
  return <ActivityForm entry={entry} lastType={lastType} />
}

function ActivityForm({ entry, lastType }: { entry?: Entry; lastType: ActivityType }) {
  const a = entry?.activity
  const [type, setType] = useState<ActivityType>(a?.type ?? lastType)
  const [minutes, setMinutes] = useState(a?.durationMin != null ? String(a.durationMin) : '')
  const [km, setKm] = useState(a?.distanceKm != null ? String(a.distanceKm) : '')
  const [steps, setSteps] = useState(a?.steps != null ? String(a.steps) : '')
  const [when, setWhen] = useState(entry?.occurredAt ?? new Date().toISOString())
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const durationMin = parseDecimal(minutes)
    const distanceKm = parseDecimal(km)
    const stepCount = parseDecimal(steps)
    if (durationMin == null && distanceKm == null && stepCount == null) {
      setError('Enter minutes, distance or steps.')
      return
    }
    const id = await logActivity(
      {
        type,
        durationMin: durationMin == null ? null : Math.round(durationMin),
        distanceKm,
        steps: stepCount == null ? null : Math.round(stepCount),
        occurredAt: when,
        note,
      },
      entry?.id,
    )
    confirmSaved(ACTIVITY_LABEL[type].toLowerCase(), id, !!entry)
  }

  const numberField = (label: string, value: string, set: (v: string) => void, mode: 'numeric' | 'decimal') => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input num"
        inputMode={mode}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          set(e.target.value)
          setError(null)
        }}
      />
    </label>
  )

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={entry ? 'Edit activity' : 'Activity'}
      footer={<SheetFooter form={FORM} onDelete={entry ? () => void deleteEntry(entry) : undefined} />}
    >
      <form
        id={FORM}
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Segmented label="Type" options={TYPES} value={type} onChange={setType} />
        <div className="trio">
          {numberField('Minutes', minutes, setMinutes, 'numeric')}
          {numberField('Km', km, setKm, 'decimal')}
          {numberField('Steps', steps, setSteps, 'numeric')}
        </div>
        {error && <p className="field-error">{error}</p>}
        <WhenField value={when} onChange={setWhen} />
        <NoteField value={note} onChange={setNote} />
      </form>
    </Sheet>
  )
}
