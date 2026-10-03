/** Tiny trend line, no axes — shape over time, numbers live in the list below it. */
export function Sparkline({ values, tint, label, height = 56 }: { values: number[]; tint: string; label: string; height?: number }) {
  if (values.length < 2) return null
  const w = 300
  const pad = 6
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [pad + (i * (w - 2 * pad)) / (values.length - 1), pad + (1 - (v - min) / span) * (height - 2 * pad)])
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={tint} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="4" fill={tint} />
    </svg>
  )
}
