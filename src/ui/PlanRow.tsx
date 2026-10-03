import { isDoneOn } from '../core/plan'
import type { LocalDate, PlanItem } from '../core/types'
import { toggleDone, toggleRoutine } from '../data/repo-plan'
import { DOMAIN } from './domains'
import { Tick } from './fields'
import { IconChip } from './icons'
import { openSheet } from './sheets'

/** A plan item with its tick; tap the text to edit. */
export function PlanRow({ item, today, sub }: { item: PlanItem; today: LocalDate; sub?: string }) {
  const done = isDoneOn(item, today)
  const icon = item.kind === 'routine' ? 'repeat' : item.kind === 'goal' ? 'flag' : null
  return (
    <li className={`list-row plan-row ${done ? 'is-done' : ''}`}>
      <Tick
        checked={done}
        label={`${done ? 'Mark not done' : 'Mark done'}: ${item.title}`}
        tint={DOMAIN.plan.tint}
        onToggle={() => void (item.kind === 'routine' ? toggleRoutine(item, today) : toggleDone(item))}
      />
      <button type="button" className="row-main" onClick={() => openSheet({ kind: 'plan-item', item })}>
        <span className="row-title">{item.title}</span>
        {(sub || icon) && (
          <span className="row-sub">
            {sub ?? (item.kind === 'routine' ? 'Routine' : 'Weekly goal')}
          </span>
        )}
      </button>
      {icon && (
        <span className="row-side plan-kind">
          <IconChip name={icon} tint={DOMAIN.plan.tint} size="sm" />
        </span>
      )}
    </li>
  )
}
