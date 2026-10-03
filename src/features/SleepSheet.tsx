import { useLiveQuery } from '../ui/live'
import { useState } from 'react'
import { sleepMinutes } from '../core/body'
import { addDays, formatDuration } from '../core/dates'
import type { Entry } from '../core/types'
import { db } from '../data/db'
import { logSleep } from '../data/repo-body'
import { confirmSaved, deleteEntry } from '../ui/entryActions'
import { NoteField, Scale, SheetFooter } from '../ui/fields'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { atLocal, calendarDate, nowTime, timeOf } from '../ui/time'

const FORM = 'sleep-form'

/** Bedtime/wake time default to the last logged night; in the morning, "woke up" defaults to now. */
export function SleepSheet({ entry }: { entry?: Entry }) {
  const last = useLiveQuery(async () => {
    const all = await db.entries.where('kind').equals('sleep').filter((e) => !e.deletedAt).toArray()
    return all.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ?? null
  }, [])
  if (last === undefined) return null
  return <SleepForm entry={entry} last={last} />
}

function SleepForm({ entry, last }: { entry?: Entry; last: Entry | null }) {
  const s = entry?.sleep
  const hour = new Date().getHours()
  const [wakeDate, setWakeDate] = useState(calendarDate(s?.wakeAt ?? new Date().toISOString()))
  const [bed, setBed] = useState(s?.bedAt ? timeOf(s.bedAt) : last?.sleep?.bedAt ? timeOf(last.sleep.bedAt) : '23:30')
  const [wake, setWake] = useState(
    s?.wakeAt
      ? timeOf(s.wakeAt)
      : hour >= 4 && hour < 13
        ? nowTime()
        : last?.sleep?.wakeAt
          ? timeOf(last.sleep.wakeAt)
          : '07:30',
  )
  const [quality, setQuality] = useState<number | null>(s?.quality ?? null)
  const [note, setNote] = useState(entry?.note ?? '')

  // A bedtime later in the day than the wake time was the evening before.
  const wakeAt = bed && wake && wakeDate ? atLocal(wakeDate, wake) : null
  const bedAt = bed && wake && wakeDate ? atLocal(bed > wake ? addDays(wakeDate, -1) : wakeDate, bed) : null
  const minutes = wakeAt && bedAt ? sleepMinutes(bedAt, wakeAt) : null

  async function save() {
    if (!bedAt || !wakeAt || minutes == null) return
    const id = await logSleep({ bedAt, wakeAt, quality, note }, entry?.id)
    confirmSaved(`sleep · ${formatDuration(minutes)}`, id, !!entry)
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={entry ? 'Edit sleep' : 'Sleep'}
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
        <div className="pair">
          <label className="field">
            <span className="field-label">Went to bed</span>
            <input className="input num" type="time" required value={bed} onChange={(e) => setBed(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Woke up</span>
            <input className="input num" type="time" required value={wake} onChange={(e) => setWake(e.target.value)} />
          </label>
        </div>
        <p className="stat" aria-live="polite">
          <span className="stat-value num">{minutes != null ? formatDuration(minutes) : '—'}</span>
          <span className="stat-unit">{minutes != null ? 'asleep' : 'check the times'}</span>
        </p>
        <label className="field">
          <span className="field-label">Woke up on</span>
          <input className="input" type="date" required value={wakeDate} onChange={(e) => setWakeDate(e.target.value)} />
        </label>
        <Scale label="Quality" value={quality} onChange={setQuality} low="Poor" high="Great" />
        <NoteField value={note} onChange={setNote} />
      </form>
    </Sheet>
  )
}
