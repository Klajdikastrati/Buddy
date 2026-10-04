import { formatWeekdays } from '../core/dates'
import { consistency, habitDetail } from '../core/habits'
import { isDoneOn } from '../core/plan'
import type { LocalDate, PlanItem } from '../core/types'
import { toggleDone } from '../data/repo-plan'
import { DOMAIN } from './domains'
import { Tick } from './fields'
import { HabitDots, HabitTick } from './habit'
import { IconChip } from './icons'
import { openSheet } from './sheets'

/** A plan item with its tick; tap the text to edit. Habits count up and show their last 7 days. */
export function PlanRow({ item, today, sub }: { item: PlanItem; today: LocalDate; sub?: string }) {
  const done = isDoneOn(item, today)
  const habit = item.kind === 'routine'
  return (
    <li className={`list-row plan-row ${done ? 'is-done' : ''}`}>
      {habit ? (
        <HabitTick habit={item} day={today} tint={DOMAIN.plan.tint} />
      ) : (
        <Tick checked={done} label={`${done ? 'Mark not done' : 'Mark done'}: ${item.title}`} tint={DOMAIN.plan.tint} onToggle={() => void toggleDone(item)} />
      )}
      <button type="button" className="row-main" onClick={() => openSheet({ kind: 'plan-item', item })}>
        <span className="row-title">{item.title}</span>
        {(sub || habit || item.kind === 'goal') && <span className="row-sub">{sub ?? (habit ? [habitDetail(item), item.weekdays.length < 7 ? formatWeekdays(item.weekdays) : null].filter(Boolean).join(' · ') || 'Every day' : 'Weekly goal')}</span>}
      </button>
      {habit ? (
        <span className="row-side">
          <HabitDots c={consistency(item, today, 7)} />
        </span>
      ) : (
        item.kind === 'goal' && (
          <span className="row-side plan-kind">
            <IconChip name="flag" tint={DOMAIN.plan.tint} size="sm" />
          </span>
        )
      )}
    </li>
  )
}
