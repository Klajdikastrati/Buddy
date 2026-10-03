import { useEffect, useState } from 'react'
import type { BuddyExport } from '../core/export'
import { formatNumber } from '../core/numbers'
import { collectExport } from '../data/export'
import { canShareFile, downloadFile, shareFile } from '../ui/download'
import { Segmented } from '../ui/fields'
import { Icon } from '../ui/icons'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

const PERIODS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
] as const

/** Build buddy-export-v1.json for a period and hand it off — nothing leaves the phone unless you send it. */
export function ExportSheet() {
  const [days, setDays] = useState<'30' | '90' | '365'>('90')
  const [built, setBuilt] = useState<{ data: BuddyExport; file: File } | null>(null)

  useEffect(() => {
    let live = true
    setBuilt(null)
    void collectExport(Number(days)).then((b) => live && setBuilt(b))
    return () => {
      live = false
    }
  }, [days])

  const q = built?.data.data_quality
  const share = built && canShareFile(built.file)

  return (
    <Sheet open onClose={closeSheet} title="Export for Analyst">
      <p className="muted">
        A read-only snapshot for Buddy Analyst: daily numbers, entries, workouts, check-ins, targets, data quality and signals. Give the file to Claude;
        bring its <span className="num">buddy-analysis.json</span> back via Me → Analyst.
      </p>
      <Segmented label="Period" options={PERIODS} value={days} onChange={setDays} />

      <div className="stats3">
        <div>
          <span className="summary-value num">{q ? q.days_with_any_log : '…'}</span>
          <span className="summary-label">of {q ? q.days_in_period : '…'} days logged</span>
        </div>
        <div>
          <span className="summary-value num">{built ? formatNumber(built.data.entries.length, 0) : '…'}</span>
          <span className="summary-label">entries</span>
        </div>
        <div>
          <span className="summary-value num">{built ? built.data.workouts.length : '…'}</span>
          <span className="summary-label">workouts</span>
        </div>
      </div>
      {built && (
        <p className="field-hint num">
          {built.file.name} · {formatNumber(built.file.size / 1024, 0)} KB
          {q && q.nutrition.entries_missing_kcal_or_macros > 0 ? ` · ${q.nutrition.entries_missing_kcal_or_macros} food entries incomplete` : ''}
        </p>
      )}

      {share && (
        <button
          type="button"
          className="btn btn-primary full"
          onClick={() => void shareFile(built.file).catch(() => toast('Couldn’t open the share sheet — use Download.'))}
        >
          <Icon name="upload" size={18} />
          Share…
        </button>
      )}
      <button
        type="button"
        className={`btn full ${share ? 'btn-quiet' : 'btn-primary'}`}
        disabled={!built}
        onClick={() => {
          if (!built) return
          downloadFile(built.file)
          toast(`Saved ${built.file.name}`)
        }}
      >
        <Icon name="download" size={18} />
        Download
      </button>
    </Sheet>
  )
}
