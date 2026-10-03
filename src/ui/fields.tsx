import { useState, type ReactNode } from 'react'
import { Icon, IconChip, type IconName } from './icons'
import { toLocalInput } from './time'

/** 1–5 rating. Tapping the selected value clears it (unknown ≠ 3). */
export function Scale({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  low: string
  high: string
}) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      <div className="scale" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={value === n ? 'on' : ''}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="scale-ends" aria-hidden="true">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  )
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Note hidden behind "+ Add note" unless there already is one. */
export function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value)
  if (!open) {
    return (
      <button type="button" className="btn-text" onClick={() => setOpen(true)}>
        + Add note
      </button>
    )
  }
  return (
    <label className="field">
      <span className="field-label">Note</span>
      <input className="input" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/** "When" as a local date-time; value is an ISO instant. */
export function WhenField({ value, onChange, label = 'When' }: { value: string; onChange: (iso: string) => void; label?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="datetime-local"
        value={toLocalInput(value)}
        onChange={(e) => e.target.value && onChange(new Date(e.target.value).toISOString())}
      />
    </label>
  )
}

/** Save (+ Delete when editing) pinned under a sheet's form. */
export function SheetFooter({ form, onDelete, saveLabel = 'Save' }: { form: string; onDelete?: () => void; saveLabel?: string }) {
  return (
    <div className="row-gap">
      {onDelete && (
        <button type="button" className="btn btn-quiet danger" onClick={onDelete}>
          Delete
        </button>
      )}
      <button type="submit" form={form} className="btn btn-primary grow">
        {saveLabel}
      </button>
    </div>
  )
}

/** A tappable settings row: icon chip, label, trailing value and chevron. */
export function NavRow({
  icon,
  tint,
  label,
  trail,
  onClick,
  danger,
  chevron = true,
}: {
  icon?: IconName
  tint?: string
  label: string
  trail?: ReactNode
  onClick: () => void
  danger?: boolean
  chevron?: boolean
}) {
  return (
    <button type="button" className="setting setting-button" onClick={onClick}>
      <span className={`setting-lead ${danger ? 'danger-text' : ''}`}>
        {icon && <IconChip name={icon} tint={tint ?? 'var(--fg-2)'} size="sm" />}
        {label}
      </span>
      <span className="setting-trail">
        <span className="truncate">{trail}</span>
        {chevron && <Icon name="chevronRight" size={16} strokeWidth={2.2} />}
      </span>
    </button>
  )
}

/** Sub-screen header with a back link. */
export function SubHead({ title, back, action }: { title: string; back: () => void; action?: ReactNode }) {
  return (
    <header className="sub-head">
      <button type="button" className="btn-text back" onClick={back}>
        <Icon name="chevronLeft" size={20} strokeWidth={2.2} />
        Back
      </button>
      <div className="sub-head-row">
        <h1>{title}</h1>
        {action}
      </div>
    </header>
  )
}

/** ‹ Day › switcher; never goes past today. */
export function DaySwitcher({ label, onPrev, onNext, canNext }: { label: string; onPrev: () => void; onNext: () => void; canNext: boolean }) {
  return (
    <div className="day-switcher">
      <button type="button" className="icon-btn" aria-label="Previous day" onClick={onPrev}>
        <Icon name="chevronLeft" size={18} strokeWidth={2.2} />
      </button>
      <span className="day-switcher-label">{label}</span>
      <button type="button" className="icon-btn" aria-label="Next day" onClick={onNext} disabled={!canNext}>
        <Icon name="chevronRight" size={18} strokeWidth={2.2} />
      </button>
    </div>
  )
}

/** Round checkbox (44px hit area) for plan items. */
export function Tick({ checked, onToggle, label, tint }: { checked: boolean; onToggle: () => void; label: string; tint?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className="tick"
      style={tint ? ({ '--tint': tint } as React.CSSProperties) : undefined}
      onClick={onToggle}
    >
      <span className="tick-box">{checked && <Icon name="check" size={15} strokeWidth={3} />}</span>
    </button>
  )
}
