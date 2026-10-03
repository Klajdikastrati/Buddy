import { useLiveQuery } from '../ui/live'
import { useState } from 'react'
import { formatShortDate } from '../core/dates'
import { formatNumber, parseDecimal } from '../core/numbers'
import { formatTarget, SOURCE_LABEL, TARGET_DEFS, targetDef, targetHistory, targetOn, type TargetDef } from '../core/targets'
import type { LocalDate, Target } from '../core/types'
import { db } from '../data/db'
import { setTarget } from '../data/repo'
import { SubHead } from '../ui/fields'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { toast } from '../ui/toast'

/** Sleep is entered in hours, stored in minutes. */
const INPUT_SCALE: Partial<Record<Target['key'], number>> = { sleep_min: 60 }

export function MeTargets() {
  const settings = useSettings()
  const today = useToday(settings)
  const targets = useLiveQuery(() => db.targets.toArray(), [])
  if (!targets) return null
  const history = targetHistory(targets).slice(0, 30)

  return (
    <div className="screen">
      <SubHead title="Targets" back={() => navigate('/me')} />
      <p className="muted">Changes apply from today; earlier days keep the target they had.</p>
      <section className="settings-group">
        {TARGET_DEFS.map((def) => (
          <TargetField key={def.key} def={def} current={targetOn(targets, def.key, today)} today={today} currency={settings.currency} />
        ))}
      </section>

      {history.length > 0 && (
        <section className="group" aria-labelledby="target-history">
          <h2 id="target-history" className="section-label">
            History
          </h2>
          <ul className="list">
            {history.map((t) => (
              <li key={t.id} className="list-row">
                <span className="row-main static">
                  <span className="row-title">
                    {targetDef(t.key).label} · {t.deletedAt ? 'removed' : formatTarget(t.key, t.value, settings.currency)}
                  </span>
                  <span className="row-sub">
                    From {formatShortDate(t.effectiveFrom)} · {SOURCE_LABEL[t.source]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function TargetField({ def, current, today, currency }: { def: TargetDef; current: number | null; today: LocalDate; currency: string }) {
  const scale = INPUT_SCALE[def.key] ?? 1
  const [draft, setDraft] = useState<string | null>(null)
  const unit = def.unit ?? currency
  // The label already says "Steps" / "Workouts"; repeat only short units.
  const shownUnit =
    def.key === 'sleep_min' ? 'h' : def.unit === null ? (currency === 'ALL' ? 'Lek' : currency) : def.unit.length > 4 ? '' : def.unit

  async function commit() {
    if (draft == null) return
    const parsed = draft.trim() ? parseDecimal(draft) : null
    if (draft.trim() && (parsed == null || parsed <= 0)) {
      setDraft(null)
      return toast(`Enter a number for ${def.label.toLowerCase()}.`)
    }
    const value = parsed == null ? null : Math.round(parsed * scale * 100) / 100
    setDraft(null)
    if (value === current) return
    await setTarget(def.key, value, unit, today)
    toast(value == null ? `${def.label} target removed` : `${def.label}: ${formatTarget(def.key, value, currency)}`)
  }

  const id = `target-${def.key}`
  return (
    <form
      className="setting"
      onSubmit={(e) => {
        e.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.blur()
      }}
    >
      <label htmlFor={id}>{def.label}</label>
      <span className="row-gap">
        <input
          id={id}
          className="input input-inline num"
          inputMode="decimal"
          autoComplete="off"
          placeholder="None"
          value={draft ?? (current != null ? formatNumber(current / scale, 2).replace(/,/g, '') : '')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
        />
        <span className="unit muted">{shownUnit}</span>
      </span>
    </form>
  )
}
