import { countOn, timesOf, type Consistency } from '../core/habits'
import type { LocalDate, PlanItem } from '../core/types'
import { tickHabit } from '../data/repo-plan'
import { Icon } from './icons'
import { toast } from './toast'

/** One tap = one completion. Clearing a done day (a mistap) says so, with Undo. */
export async function tapHabit(h: PlanItem, day: LocalDate) {
  const { count, undo } = await tickHabit(h, day)
  if (count === 0) toast(`Cleared ${h.title}`, { label: 'Undo', run: () => void undo() })
}

/** Round tick that counts: empty → 1/2 → ✓ for a twice-a-day habit. */
export function HabitTick({ habit, day, tint }: { habit: PlanItem; day: LocalDate; tint: string }) {
  const c = countOn(habit, day)
  const t = timesOf(habit)
  const done = c >= t
  return (
    <button
      type="button"
      className={`tick habit-tick ${c && !done ? 'partial' : ''}`}
      aria-label={`${habit.title}: ${done ? 'done — tap to clear' : t > 1 ? `${c} of ${t}, tap for one more` : 'mark done'}`}
      aria-pressed={done}
      style={{ '--tint': tint } as React.CSSProperties}
      onClick={() => void tapHabit(habit, day)}
    >
      <span className="tick-box">{done ? <Icon name="check" size={15} strokeWidth={3} /> : c > 0 ? <span className="num">{`${c}/${t}`}</span> : null}</span>
    </button>
  )
}

const DOT_TITLE: Record<string, string> = { done: 'done', partial: 'partly', missed: 'missed', off: 'not scheduled', today: 'today', before: 'before you started' }

/** Last days as dots — filled done, half partial, ring missed, faint off. */
export function HabitDots({ c }: { c: Consistency }) {
  return (
    <span className="habit-dots" aria-label={`Done ${c.done} of ${c.scheduled} scheduled days`}>
      {c.days.map((d) => (
        <span key={d.date} className={`hd hd-${d.state}`} title={`${d.date}: ${DOT_TITLE[d.state]}`} />
      ))}
    </span>
  )
}
