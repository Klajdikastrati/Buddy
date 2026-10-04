import { weekdayOf, weekStart } from './dates'
import { doneOn } from './habits'
import type { LocalDate, PlanItem } from './types'

export interface DayPlan {
  /** Tasks dated today (done ones included, shown ticked). */
  today: PlanItem[]
  /** Undone tasks from earlier days — carried forward, never silently dropped. */
  overdue: PlanItem[]
  /** Routines that apply to today's weekday. */
  routines: PlanItem[]
  /** Goals for the week containing today. */
  goals: PlanItem[]
  upcoming: PlanItem[]
  someday: PlanItem[]
}

const live = (items: PlanItem[]) => items.filter((i) => !i.deletedAt && !i.archived)
const byCreated = (a: PlanItem, b: PlanItem) => a.createdAt.localeCompare(b.createdAt)

export function planFor(items: PlanItem[], today: LocalDate): DayPlan {
  const all = live(items)
  const tasks = all.filter((i) => i.kind === 'task')
  const week = weekStart(today)
  const wd = weekdayOf(today)
  return {
    today: tasks.filter((t) => t.localDate === today).sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || byCreated(a, b)),
    overdue: tasks.filter((t) => t.localDate != null && t.localDate < today && !t.doneAt).sort((a, b) => a.localDate!.localeCompare(b.localDate!) || byCreated(a, b)),
    routines: all.filter((i) => i.kind === 'routine' && i.weekdays.includes(wd)).sort(byCreated),
    goals: all.filter((i) => i.kind === 'goal' && i.localDate === week).sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || byCreated(a, b)),
    upcoming: tasks.filter((t) => t.localDate != null && t.localDate > today && !t.doneAt).sort((a, b) => a.localDate!.localeCompare(b.localDate!) || byCreated(a, b)),
    someday: tasks.filter((t) => t.localDate == null && !t.doneAt).sort(byCreated),
  }
}

/** What Today shows: undone tasks for today, overdue first. */
export function priorities(items: PlanItem[], today: LocalDate, limit = 3): { shown: PlanItem[]; more: number } {
  const p = planFor(items, today)
  const open = [...p.overdue, ...p.today.filter((t) => !t.doneAt)]
  return { shown: open.slice(0, limit), more: Math.max(0, open.length - limit) }
}

export const isDoneOn = (item: PlanItem, day: LocalDate) => (item.kind === 'routine' ? doneOn(item, day) : !!item.doneAt)
