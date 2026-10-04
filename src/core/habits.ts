// Habits (stored as plan routines). Pure: what's due today, ticking with
// times-per-day, and consistency as evidence ("5 of the last 7 days") — no
// streaks, points or flames (Buddy has no gamification).
import { addDays, weekdayOf } from './dates'
import type { LocalDate, PartOfDay, PlanItem } from './types'

export const PARTS: readonly PartOfDay[] = ['morning', 'afternoon', 'evening', 'anytime']
export const PART_LABEL: Record<PartOfDay, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', anytime: 'Any time' }

// Rows synced before the habits migration may lack the new fields.
export const timesOf = (h: PlanItem) => Math.max(1, h.timesPerDay ?? 1)
export const partOf = (h: PlanItem): PartOfDay => h.partOfDay ?? 'anytime'

export const countOn = (h: PlanItem, day: LocalDate) => h.doneDates.filter((d) => d === day).length
export const doneOn = (h: PlanItem, day: LocalDate) => countOn(h, day) >= timesOf(h)

const live = (h: PlanItem) => h.kind === 'routine' && !h.deletedAt && !h.archived
export const dueOn = (h: PlanItem, day: LocalDate) => live(h) && h.weekdays.includes(weekdayOf(day))

/** Habits due on a day, morning → evening → any time (then oldest first). */
export function habitsOn(items: PlanItem[], day: LocalDate): PlanItem[] {
  return items
    .filter((h) => dueOn(h, day))
    .sort((a, b) => PARTS.indexOf(partOf(a)) - PARTS.indexOf(partOf(b)) || a.createdAt.localeCompare(b.createdAt))
}

/**
 * A past (or current) day's habits: those scheduled that day since they were
 * created, plus any ticked that day regardless. Deleted habits drop out;
 * archived ones keep their history.
 */
export function habitsForDay(items: PlanItem[], day: LocalDate): { habit: PlanItem; count: number; times: number }[] {
  return items
    .filter((h) => h.kind === 'routine' && !h.deletedAt)
    .map((h) => ({ habit: h, count: countOn(h, day), times: timesOf(h) }))
    .filter(({ habit: h, count }) => count > 0 || (!h.archived && h.weekdays.includes(weekdayOf(day)) && day >= h.createdAt.slice(0, 10)))
    .sort((a, b) => PARTS.indexOf(partOf(a.habit)) - PARTS.indexOf(partOf(b.habit)) || a.habit.createdAt.localeCompare(b.habit.createdAt))
}

/** A tap: one more until done; a tap on a done habit clears the day (a mistap, undoable). */
export function nextCount(h: PlanItem, day: LocalDate): number {
  const c = countOn(h, day)
  return c >= timesOf(h) ? 0 : c + 1
}

/** `doneDates` with the day's completions set to `n`. */
export function withCount(h: PlanItem, day: LocalDate, n: number): LocalDate[] {
  return [...h.doneDates.filter((d) => d !== day), ...Array<LocalDate>(Math.max(0, n)).fill(day)].sort()
}

export type DayState = 'done' | 'partial' | 'missed' | 'off' | 'today' | 'before'

export interface Consistency {
  days: { date: LocalDate; state: DayState }[]
  /** Scheduled days so far (today only once something's done). */
  scheduled: number
  done: number
}

/**
 * The last `n` days ending today. Days before the habit existed are `before`,
 * unscheduled weekdays `off`; an untouched today isn't counted as missed yet.
 */
export function consistency(h: PlanItem, today: LocalDate, n = 7): Consistency {
  const start = h.createdAt.slice(0, 10)
  const days: Consistency['days'] = []
  let scheduled = 0
  let done = 0
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const c = countOn(h, date)
    let state: DayState
    if (date < start && !c) state = 'before'
    else if (!h.weekdays.includes(weekdayOf(date)) && !c) state = 'off'
    else if (c >= timesOf(h)) state = 'done'
    else if (date === today) state = c ? 'partial' : 'today'
    else state = c ? 'partial' : 'missed'
    if (state === 'done' || state === 'partial' || state === 'missed') scheduled++
    if (state === 'done') done++
    days.push({ date, state })
  }
  return { days, scheduled, done }
}

/** "Brush teeth · 2× · Morning · after I wake up" style detail line. */
export function habitDetail(h: PlanItem): string {
  const parts = [timesOf(h) > 1 ? `${timesOf(h)}× a day` : null, partOf(h) !== 'anytime' ? PART_LABEL[partOf(h)] : null, h.cue ? `after ${h.cue}` : null]
  return parts.filter(Boolean).join(' · ')
}

export interface HabitIdea {
  title: string
  timesPerDay: number
  partOfDay: PartOfDay
  cue: string | null
}

/** One-tap starters for a new habit; each comes with a cue to hang it on. */
export const HABIT_IDEAS: readonly HabitIdea[] = [
  { title: 'Brush teeth', timesPerDay: 2, partOfDay: 'anytime', cue: 'breakfast and before bed' },
  { title: 'Make bed', timesPerDay: 1, partOfDay: 'morning', cue: 'I get up' },
  { title: 'Glass of water', timesPerDay: 1, partOfDay: 'morning', cue: 'I wake up' },
  { title: 'Protein breakfast', timesPerDay: 1, partOfDay: 'morning', cue: 'I get dressed' },
  { title: 'Floss', timesPerDay: 1, partOfDay: 'evening', cue: 'I brush my teeth' },
  { title: 'Phone away', timesPerDay: 1, partOfDay: 'evening', cue: 'I get into bed' },
  { title: 'Stretch 5 min', timesPerDay: 1, partOfDay: 'evening', cue: 'I get home' },
  { title: 'Read 10 pages', timesPerDay: 1, partOfDay: 'evening', cue: 'I put the phone away' },
  { title: 'Walk after lunch', timesPerDay: 1, partOfDay: 'afternoon', cue: 'I finish lunch' },
  { title: 'Skincare', timesPerDay: 2, partOfDay: 'anytime', cue: 'I brush my teeth' },
  { title: 'Vitamins', timesPerDay: 1, partOfDay: 'morning', cue: 'breakfast' },
  { title: 'Tidy room 5 min', timesPerDay: 1, partOfDay: 'evening', cue: 'dinner' },
]
