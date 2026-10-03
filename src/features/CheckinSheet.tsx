import { useLiveQuery } from '../ui/live'
import { useState } from 'react'
import { formatDayLabel } from '../core/dates'
import type { DayCheckin, LocalDate } from '../core/types'
import { db } from '../data/db'
import { saveCheckin } from '../data/repo-body'
import { Scale, SheetFooter } from '../ui/fields'
import { useSettings, useToday } from '../ui/hooks'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

const FORM = 'checkin-form'

/** The evening check-in: only what Buddy can't infer from other logs. One per day. */
export function CheckinSheet({ date }: { date?: LocalDate }) {
  const today = useToday(useSettings())
  const day = date ?? today
  const existing = useLiveQuery(async () => (await db.checkins.get(day)) ?? null, [day])
  if (existing === undefined) return null
  return <CheckinForm key={day} day={day} today={today} existing={existing} />
}

function CheckinForm({ day, today, existing }: { day: LocalDate; today: LocalDate; existing: DayCheckin | null }) {
  const [mood, setMood] = useState(existing?.mood ?? null)
  const [energy, setEnergy] = useState(existing?.energy ?? null)
  const [stress, setStress] = useState(existing?.stress ?? null)
  const [productivity, setProductivity] = useState(existing?.productivity ?? null)
  const [note, setNote] = useState(existing?.note ?? '')

  async function save() {
    await saveCheckin(day, { mood, energy, stress, productivity, note })
    closeSheet()
    toast(day === today ? 'Check-in saved' : `Check-in saved for ${formatDayLabel(day, today)}`)
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={day === today ? 'How was today?' : formatDayLabel(day, today)}
      footer={<SheetFooter form={FORM} />}
    >
      <form
        id={FORM}
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Scale label="Mood" value={mood} onChange={setMood} low="Low" high="Great" />
        <Scale label="Energy" value={energy} onChange={setEnergy} low="Drained" high="Energised" />
        <Scale label="Stress" value={stress} onChange={setStress} low="Calm" high="Stressed" />
        <Scale label="Productivity" value={productivity} onChange={setProductivity} low="Low" high="High" />
        <label className="field">
          <span className="field-label">Note</span>
          <textarea
            className="input textarea"
            rows={3}
            placeholder="Anything worth remembering about today"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </form>
    </Sheet>
  )
}
