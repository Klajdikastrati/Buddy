import { useLiveQuery } from '../ui/live'
import { useState } from 'react'
import { addDays, formatDayLabel } from '../core/dates'
import { nutritionOn } from '../core/nutrition'
import { formatNumber } from '../core/numbers'
import { targetOn } from '../core/targets'
import type { Nutrients, TargetKey } from '../core/types'
import { db } from '../data/db'
import { Bar } from '../ui/Bar'
import { DOMAIN } from '../ui/domains'
import { EntryRow } from '../ui/EntryRow'
import { DaySwitcher, SubHead } from '../ui/fields'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { Icon } from '../ui/icons'
import { Ring } from '../ui/Ring'
import { openSheet } from '../ui/sheets'

const MACROS: { key: keyof Nutrients; label: string; target: TargetKey }[] = [
  { key: 'proteinG', label: 'Protein', target: 'protein_daily' },
  { key: 'carbsG', label: 'Carbs', target: 'carbs_daily' },
  { key: 'fatG', label: 'Fat', target: 'fat_daily' },
]

const CORE: (keyof Nutrients)[] = ['kcal', 'proteinG', 'carbsG', 'fatG']

const DETAILS: { key: keyof Nutrients; label: string; unit: string }[] = [
  { key: 'fiberG', label: 'Fiber', unit: 'g' },
  { key: 'sugarG', label: 'Sugar', unit: 'g' },
  { key: 'satFatG', label: 'Saturated fat', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
  { key: 'caffeineMg', label: 'Caffeine', unit: 'mg' },
]

/** One day's food: every nutrient, honest about what's unknown. */
export function Nutrition() {
  const settings = useSettings()
  const today = useToday(settings)
  const [day, setDay] = useState(today)
  const entries = useLiveQuery(() => db.entries.where('localDate').equals(day).toArray(), [day])
  const targets = useLiveQuery(() => db.targets.toArray(), [])
  if (!entries || !targets) return null

  const d = nutritionOn(entries, day)
  const kcal = d.totals.kcal ?? 0
  const kcalTarget = targetOn(targets, 'kcal_daily', day)
  // Entries missing calories or a macro; rarer nutrients are flagged per line below.
  const incomplete = d.entries.filter((e) => CORE.some((k) => e.nutrition![k] == null)).length
  const tint = { '--tint': DOMAIN.food.tint } as React.CSSProperties

  /** "≥ 82" when some entries didn't know this nutrient; "Unknown" when none did. */
  const value = (k: keyof Nutrients, unit: string) => {
    const v = d.totals[k]
    if (v == null) return d.count ? 'Unknown' : '—'
    return `${d.unknown[k] ? '≥ ' : ''}${formatNumber(v, unit === 'mg' ? 0 : 1)} ${unit}`
  }

  return (
    <div className="screen">
      <SubHead title="Nutrition" back={() => navigate('/')} />
      <DaySwitcher
        label={formatDayLabel(day, today)}
        onPrev={() => setDay(addDays(day, -1))}
        onNext={() => setDay(addDays(day, 1))}
        canNext={day < today}
      />

      <section className="block nutrition-hero" style={tint} aria-label="Calories">
        <Ring value={kcal} max={kcalTarget ?? Math.max(kcal, 1)} size={148} stroke={14} tint={DOMAIN.food.tint} label={`${formatNumber(kcal, 0)} kcal`}>
          <span className="ring-value num">
            {d.unknown.kcal ? '≥' : ''}
            {formatNumber(kcal, 0)}
          </span>
          <span className="ring-label">{kcalTarget ? `of ${formatNumber(kcalTarget, 0)} kcal` : 'kcal'}</span>
        </Ring>
        <p className="stat-note num center">
          {kcalTarget == null
            ? 'No calorie target'
            : kcal <= kcalTarget
              ? `${formatNumber(kcalTarget - kcal, 0)} kcal left`
              : `${formatNumber(kcal - kcalTarget, 0)} kcal over target`}
          {incomplete > 0 && ` · ${incomplete} of ${d.count} ${d.count === 1 ? 'entry' : 'entries'} incomplete`}
        </p>
        {kcalTarget == null && (
          <button type="button" className="btn-text accent center-self" onClick={() => navigate('/me/targets')}>
            Set targets
          </button>
        )}
      </section>

      <section className="block macro-block" style={tint} aria-label="Macros">
        {MACROS.map((m) => {
          const v = d.totals[m.key]
          const t = targetOn(targets, m.target, day)
          return (
            <div key={m.key} className="macro-row">
              <div className="month-line">
                <span className="macro-name">{m.label}</span>
                <span className="num">
                  {value(m.key, 'g')}
                  {t != null && <span className="muted"> / {formatNumber(t, 0)} g</span>}
                </span>
              </div>
              {t != null && <Bar value={v ?? 0} max={t} label={`${m.label} vs target`} />}
            </div>
          )
        })}
      </section>

      <section className="group" aria-labelledby="nut-details">
        <h2 id="nut-details" className="section-label">
          Details
        </h2>
        <div className="settings-group">
          {DETAILS.map((x) => (
            <div key={x.key} className="setting">
              <span>{x.label}</span>
              <span className={`setting-trail num ${d.unknown[x.key] ? 'incomplete' : ''}`}>
                {value(x.key, x.unit)}
                {d.unknown[x.key] > 0 && d.totals[x.key] != null && <span className="muted"> · {d.unknown[x.key]} unknown</span>}
              </span>
            </div>
          ))}
        </div>
        <p className="field-hint">“≥” means some foods don’t list that value, so the real total is at least this.</p>
      </section>

      <section aria-labelledby="nut-entries">
        <h2 id="nut-entries" className="section-title">
          Eaten
        </h2>
        {d.entries.length ? (
          <ul className="list with-icons">
            {[...d.entries]
              .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
              .map((e) => (
                <EntryRow key={e.id} entry={e} timeZone={settings.timezone} />
              ))}
          </ul>
        ) : (
          <div className="empty empty-card">
            <p>Nothing logged.</p>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => openSheet({ kind: 'food' })}>
              <Icon name="plus" size={18} strokeWidth={2.2} />
              Food
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
