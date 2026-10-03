/** Thin progress bar; turns warn-coloured past the max. */
export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const over = value > max
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <div className={`bar-fill ${over ? 'over' : ''}`} style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} />
    </div>
  )
}
