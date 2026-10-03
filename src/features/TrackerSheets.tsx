import { useLiveQuery } from '../ui/live'
import { useState } from 'react'
import { parseDecimal, slugKey } from '../core/numbers'
import type { CustomFacet, Entry, ID, TrackerDef, TrackerField, TrackerFieldType } from '../core/types'
import { db } from '../data/db'
import { archiveTracker, logTracker, saveTracker } from '../data/repo-trackers'
import { confirmSaved, deleteEntry } from '../ui/entryActions'
import { NoteField, Segmented, SheetFooter, WhenField } from '../ui/fields'
import { Icon } from '../ui/icons'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

const TYPES = [
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' },
  { value: 'bool', label: 'Yes / no' },
] as const

interface FieldDraft {
  key: string | null // existing fields keep their key so old values still map
  label: string
  type: TrackerFieldType
  unit: string
}

/** Define what a tracker records: fields of type number (with unit), text, or yes/no. */
export function TrackerDefSheet({ def }: { def?: TrackerDef }) {
  const [name, setName] = useState(def?.name ?? '')
  const [fields, setFields] = useState<FieldDraft[]>(
    def?.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, unit: f.unit ?? '' })) ?? [{ key: null, label: '', type: 'number', unit: '' }],
  )
  const [error, setError] = useState<string | null>(null)
  const set = (i: number, change: Partial<FieldDraft>) => setFields(fields.map((f, j) => (j === i ? { ...f, ...change } : f)))

  async function save() {
    if (!name.trim()) return setError('Give the tracker a name.')
    const named = fields.map((f) => ({ ...f, label: f.label.trim() || (fields.length === 1 ? name.trim() : '') }))
    if (named.some((f) => !f.label)) return setError('Every field needs a label.')
    const taken: string[] = named.flatMap((f) => (f.key ? [f.key] : []))
    const out: TrackerField[] = named.map((f) => {
      const key = f.key ?? slugKey(f.label, taken)
      if (!f.key) taken.push(key)
      return { key, label: f.label, type: f.type, unit: f.type === 'number' ? f.unit.trim() || null : null }
    })
    await saveTracker({ name, fields: out }, def)
    closeSheet()
    toast(def ? `Updated ${name.trim()}` : `${name.trim()} added to Quick Add`)
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={def ? 'Edit tracker' : 'New tracker'}
      footer={
        <div className="row-gap">
          {def && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={async () => {
                await archiveTracker(def)
                closeSheet()
                toast(`Hid ${def.name}`, { label: 'Undo', run: () => void archiveTracker({ ...def, archived: true }, false) })
              }}
            >
              Hide
            </button>
          )}
          <div className="grow">
            <SheetFooter form="tracker-def-form" />
          </div>
        </div>
      }
    >
      <form
        id="tracker-def-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" autoComplete="off" maxLength={60} placeholder="Water, Reading, Meditation…" data-autofocus={def ? undefined : ''} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {fields.map((f, i) => (
          <div key={i} className="field tracker-field">
            <div className="row-between">
              <span className="field-label">Field {fields.length > 1 ? i + 1 : ''}</span>
              {fields.length > 1 && (
                <button type="button" className="icon-btn" aria-label={`Remove field ${i + 1}`} onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                  <Icon name="close" size={14} strokeWidth={2.4} />
                </button>
              )}
            </div>
            <input className="input" autoComplete="off" placeholder={fields.length === 1 ? 'Same as the name' : 'Label'} aria-label={`Field ${i + 1} label`} value={f.label} onChange={(e) => set(i, { label: e.target.value })} />
            <Segmented label={`Field ${i + 1} type`} options={TYPES} value={f.type} onChange={(type) => set(i, { type })} />
            {f.type === 'number' && (
              <input className="input" autoComplete="off" placeholder="Unit (L, pages, min…) · optional" aria-label={`Field ${i + 1} unit`} value={f.unit} onChange={(e) => set(i, { unit: e.target.value })} />
            )}
          </div>
        ))}
        <button type="button" className="btn btn-quiet full" onClick={() => setFields([...fields, { key: null, label: '', type: 'number', unit: '' }])}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          Add field
        </button>
        {error && <p className="field-error">{error}</p>}
      </form>
    </Sheet>
  )
}

/** Log a tracker: one input per field. Empty = not recorded. */
export function TrackerLogSheet({ trackerId, entry }: { trackerId: ID; entry?: Entry }) {
  const def = useLiveQuery(async () => (await db.trackers.get(trackerId)) ?? null, [trackerId])
  if (def === undefined) return null
  if (def === null) {
    return (
      <Sheet open onClose={closeSheet} title="Tracker">
        <p className="muted">This tracker no longer exists.</p>
      </Sheet>
    )
  }
  return <TrackerLogForm def={def} entry={entry} />
}

function TrackerLogForm({ def, entry }: { def: TrackerDef; entry?: Entry }) {
  const initial = entry?.custom?.values ?? {}
  const [values, setValues] = useState<Record<string, string | boolean | null>>(() =>
    Object.fromEntries(def.fields.map((f) => [f.key, f.type === 'bool' ? ((initial[f.key] as boolean | null | undefined) ?? null) : initial[f.key] != null ? String(initial[f.key]) : ''])),
  )
  const [when, setWhen] = useState(entry?.occurredAt ?? new Date().toISOString())
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const out: CustomFacet['values'] = {}
    for (const f of def.fields) {
      const v = values[f.key]
      if (f.type === 'number') {
        const n = typeof v === 'string' && v.trim() ? parseDecimal(v) : null
        if (typeof v === 'string' && v.trim() && n == null) return setError(`${f.label} must be a number.`)
        out[f.key] = n
      } else if (f.type === 'text') out[f.key] = typeof v === 'string' && v.trim() ? v.trim() : null
      else out[f.key] = typeof v === 'boolean' ? v : null
    }
    if (Object.values(out).every((v) => v == null)) return setError('Fill in at least one field.')
    const id = await logTracker(def, out, when, note, entry?.id)
    confirmSaved(def.name.toLowerCase(), id, !!entry)
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={def.name}
      footer={<SheetFooter form="tracker-log-form" onDelete={entry ? () => void deleteEntry(entry) : undefined} />}
    >
      <form
        id="tracker-log-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {def.fields.map((f, i) =>
          f.type === 'bool' ? (
            <fieldset key={f.key} className="field">
              <legend className="field-label">{f.label}</legend>
              <div className="chips">
                {[true, false].map((b) => (
                  <button
                    key={String(b)}
                    type="button"
                    className={`chip ${values[f.key] === b ? 'on' : ''}`}
                    aria-pressed={values[f.key] === b}
                    onClick={() => setValues({ ...values, [f.key]: values[f.key] === b ? null : b })}
                  >
                    {b ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <label key={f.key} className="field">
              <span className="field-label">{f.label}</span>
              <div className="input-unit">
                <input
                  className={`input ${f.type === 'number' && i === 0 ? 'input-big' : ''} ${f.type === 'number' ? 'num' : ''}`}
                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                  autoComplete="off"
                  data-autofocus={i === 0 && !entry ? '' : undefined}
                  value={(values[f.key] as string) ?? ''}
                  onChange={(e) => {
                    setValues({ ...values, [f.key]: e.target.value })
                    setError(null)
                  }}
                />
                {f.unit && <span className="input-suffix">{f.unit}</span>}
              </div>
            </label>
          ),
        )}
        {error && <p className="field-error">{error}</p>}
        <WhenField value={when} onChange={setWhen} />
        <NoteField value={note} onChange={setNote} />
      </form>
    </Sheet>
  )
}
