import type { CSSProperties } from 'react'

// Hand-drawn 24×24 stroke icons — a small fixed set, no icon library.
const PATHS = {
  today: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4',
  history: 'M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7.5V12l3 2',
  plus: 'M12 5v14M5 12h14',
  me: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4.5 21a7.5 7.5 0 0 1 15 0',
  plan: 'M9 11.5l2.5 2.5L21 4.5M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11',
  money: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7.5A2.5 2.5 0 0 0 5.5 10H20a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a2 2 0 0 1 0-4h4',
  income: 'M17 7 7 17M16 17H7V8',
  expense: 'M7 17 17 7M8 7h9v9',
  food: 'M12 20.9c1.5 0 2.7 1.1 4 1.1 3 0 6-8 6-12.2A4.9 4.9 0 0 0 17 5c-2.2 0-4 1.4-5 2-1-.6-2.8-2-5-2a4.9 4.9 0 0 0-5 4.8C2 14 5 22 8 22c1.3 0 2.5-1.1 4-1.1ZM10 2c1 .5 2 2 2 5',
  sleep: 'M12 3a6.5 6.5 0 0 0 9 9 9 9 0 1 1-9-9Z',
  weight: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM8 10a4 4 0 0 1 8 0M12 10l1.6-2',
  activity: 'M22 12h-4l-3 8L9 4l-3 8H2',
  workout: 'M7 12h10M7 7v10M17 7v10M4 9.5v5M20 9.5v5',
  checkin: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM8 14.5s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01',
  note: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5M9 13h6M9 17h4',
  tracker: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4',
  search: 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM21 21l-4.5-4.5',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10.5 8v8M14 8v8M17 8v8',
  chevronRight: 'M9 18l6-6-6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronDown: 'M6 9l6 6 6-6',
  check: 'M20 6 9 17l-5-5',
  close: 'M18 6 6 18M6 6l12 12',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z',
  timer: 'M10 2h4M12 14l3-3M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  trend: 'M22 7l-8.5 8.5-5-5L2 17M16 7h6v6',
  target: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  cloud: 'M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  book: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20',
  tag: 'M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4ZM7.5 7.5h.01',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6.5V12l3.5 2',
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9Z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  repeat: 'M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1ZM4 22v-7',
  moon: 'M12 3a6.5 6.5 0 0 0 9 9 9 9 0 1 1-9-9Z',
  play: 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 22,
  strokeWidth = 1.8,
  style,
  className,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  style?: CSSProperties
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Rounded tinted square holding an icon — the domain's identity mark. */
export function IconChip({ name, tint, size = 'md' }: { name: IconName; tint: string; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 15 : size === 'lg' ? 24 : 18
  return (
    <span className={`icon-chip icon-chip-${size}`} style={{ '--tint': tint } as CSSProperties}>
      <Icon name={name} size={px} strokeWidth={2} />
    </span>
  )
}
