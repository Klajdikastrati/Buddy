import { useState } from 'react'

export interface DayPoint {
  date: string
  value: number | null
}

/**
 * One series per day — thin bars (magnitude from zero) or a 2px line (levels
 * like weight). Tap/hover a day to read it; a faint average line for context.
 * Text stays in ink colours; only the marks carry the tint.
 */
export function DayChart({
  points,
  tint,
  format,
  label,
  mode = 'bars',
  highlight,
  average,
  height = 120,
}: {
  points: DayPoint[]
  tint: string
  format: (v: number) => string
  label: (date: string) => string
  mode?: 'bars' | 'line'
  /** Date to emphasise (today). */
  highlight?: string
  average?: number | null
  height?: number
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const W = 320
  const H = height
  const pad = { t: 8, b: 4, l: 2, r: 2 }
  const vals = points.map((p) => p.value).filter((v): v is number => v != null)
  if (!vals.length) return <p className="muted chart-empty">No data in this period yet.</p>
  const n = points.length
  const slot = (W - pad.l - pad.r) / n
  const min = mode === 'bars' ? 0 : Math.min(...vals) - (Math.max(...vals) - Math.min(...vals) || 1) * 0.15
  const max = Math.max(...vals, average ?? 0) * (mode === 'bars' ? 1.08 : 1) + (mode === 'line' ? (Math.max(...vals) - Math.min(...vals) || 1) * 0.15 : 0)
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b)
  const x = (i: number) => pad.l + slot * i + slot / 2
  const shown = picked ?? (highlight ? points.findIndex((p) => p.date === highlight) : -1)
  const readout = shown >= 0 && points[shown] ? points[shown] : null
  const barW = Math.max(2, Math.min(14, slot - 2))
  const line = points
    .map((p, i) => (p.value == null ? null : `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`))
    .filter(Boolean)
    .join(' ')

  return (
    <div className="day-chart" onPointerLeave={() => setPicked(null)}>
      <p className="chart-readout num" aria-live="polite">
        {readout ? (
          <>
            <span className="chart-readout-value">{readout.value == null ? '—' : format(readout.value)}</span>
            <span className="muted"> · {label(readout.date)}</span>
          </>
        ) : (
          <span className="muted">Tap a day</span>
        )}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${points.length} days`}>
        {average != null && average > 0 && (
          <line x1={pad.l} x2={W - pad.r} y1={y(average)} y2={y(average)} className="chart-avg" vectorEffect="non-scaling-stroke" />
        )}
        {mode === 'bars'
          ? points.map((p, i) => {
              if (!p.value) return null
              const top = y(p.value)
              const h = Math.max(2, H - pad.b - top)
              const r = Math.min(3, barW / 2, h / 2)
              const left = x(i) - barW / 2
              const bottom = H - pad.b
              // Rounded data end, square baseline.
              const d = `M${left},${bottom} V${bottom - h + r} Q${left},${bottom - h} ${left + r},${bottom - h} H${left + barW - r} Q${left + barW},${bottom - h} ${left + barW},${bottom - h + r} V${bottom} Z`
              return <path key={p.date} d={d} fill={tint} opacity={shown < 0 || shown === i ? 1 : 0.45} />
            })
          : (
              <>
                <polyline points={line} fill="none" stroke={tint} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {readout?.value != null && <circle cx={x(shown)} cy={y(readout.value)} r="4" fill={tint} stroke="var(--surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
              </>
            )}
        {/* Hit targets: the whole column, wider than the mark. */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}`}
            x={pad.l + slot * i}
            y={0}
            width={slot}
            height={H}
            fill="transparent"
            onPointerEnter={() => setPicked(i)}
            onPointerDown={() => setPicked(i)}
          />
        ))}
      </svg>
      <div className="chart-axis num" aria-hidden="true">
        <span>{label(points[0].date)}</span>
        <span>{label(points[n - 1].date)}</span>
      </div>
    </div>
  )
}
