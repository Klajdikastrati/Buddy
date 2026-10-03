import type { ReactNode } from 'react'

/** Progress ring (Apple Fitness style). Past the max it closes and turns warn-coloured. */
export function Ring({
  value,
  max,
  size = 72,
  stroke = 9,
  tint,
  label,
  children,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  tint: string
  label: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, value / max) : 0
  const over = value > max
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--warn)' : tint}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 200ms var(--ease)' }}
        />
      </svg>
      {children && <div className="ring-center">{children}</div>}
    </div>
  )
}
