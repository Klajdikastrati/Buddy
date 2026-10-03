import { useLiveQuery } from '../ui/live'
import { useRef, useState } from 'react'
import { weightSummary } from '../core/body'
import { formatShortDate } from '../core/dates'
import { formatNumber, parseDecimal } from '../core/numbers'
import type { Entry } from '../core/types'
import { db } from '../data/db'
import { logWeight } from '../data/repo-body'
import { confirmSaved, deleteEntry } from '../ui/entryActions'
import { NoteField, SheetFooter, WhenField } from '../ui/fields'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'

const FORM = 'weight-form'

export function WeightSheet({ entry }: { entry?: Entry }) {
  const [kg, setKg] = useState(entry?.measurement ? String(entry.measurement.value) : '')
  const [when, setWhen] = useState(entry?.occurredAt ?? new Date().toISOString())
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const last = useLiveQuery(async () => weightSummary(await db.entries.where('kind').equals('weight').toArray()), [])

  async function save() {
    const value = parseDecimal(kg)
    if (value == null || value < 20 || value > 400) {
      setError('Enter your weight in kg.')
      inputRef.current?.focus()
      return
    }
    const id = await logWeight({ kg: value, occurredAt: when, note }, entry?.id)
    confirmSaved(`weight · ${formatNumber(value)} kg`, id, !!entry)
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={entry ? 'Edit weight' : 'Weight'}
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
        <label className="field">
          <span className="field-label">Weight (kg)</span>
          <input
            ref={inputRef}
            className="input input-big num"
            inputMode="decimal"
            autoComplete="off"
            placeholder={last ? formatNumber(last.latest.value) : '0.0'}
            data-autofocus={entry ? undefined : ''}
            value={kg}
            onChange={(e) => {
              setKg(e.target.value)
              setError(null)
            }}
            aria-invalid={!!error}
          />
          {error && <span className="field-error">{error}</span>}
          {last && !entry && (
            <span className="field-hint num">
              Last: {formatNumber(last.latest.value)} kg · {formatShortDate(last.latest.localDate)}
            </span>
          )}
        </label>
        <WhenField value={when} onChange={setWhen} />
        <NoteField value={note} onChange={setNote} />
      </form>
    </Sheet>
  )
}
