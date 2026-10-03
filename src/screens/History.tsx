import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { addDays, formatDayLabel } from '../core/dates'
import { formatMoney } from '../core/money'
import type { Entry } from '../core/types'
import { db } from '../data/db'
import { EntryRow } from '../ui/EntryRow'
import { useSettings, useToday } from '../ui/hooks'

const PAGE_DAYS = 60

/** Past days, newest first. Tap any entry to fix it. */
export function History() {
  const settings = useSettings()
  const today = useToday(settings)
  const [days, setDays] = useState(PAGE_DAYS)
  const from = addDays(today, -days)

  const entries = useLiveQuery(
    () => db.entries.where('localDate').aboveOrEqual(from).filter((e) => !e.deletedAt).toArray(),
    [from],
  )
  const older = useLiveQuery(() => db.entries.where('localDate').below(from).count(), [from])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const catName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories])

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of entries ?? []) map.set(e.localDate, [...(map.get(e.localDate) ?? []), e])
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, list]) => ({
        day,
        list: list.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
        spent: list.reduce((t, e) => t + (e.money?.direction === 'out' ? e.money.amount : 0), 0),
      }))
  }, [entries])

  if (!entries) return null

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>History</h1>
      </header>
      {groups.length === 0 && <p className="muted">No entries yet.</p>}
      {groups.map((g) => (
        <section key={g.day} aria-label={g.day}>
          <div className="day-head">
            <h2 className="section-label">{formatDayLabel(g.day, today)}</h2>
            {g.spent > 0 && <span className="muted num">{formatMoney(g.spent, settings.currency)}</span>}
          </div>
          <ul className="list">
            {g.list.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                timeZone={settings.timezone}
                categoryName={e.money?.categoryId ? catName.get(e.money.categoryId) : undefined}
              />
            ))}
          </ul>
        </section>
      ))}
      {!!older && (
        <button type="button" className="btn btn-quiet full" onClick={() => setDays(days + PAGE_DAYS)}>
          Show older
        </button>
      )}
    </div>
  )
}
