import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { addDays, formatLongDate, monthStart } from '../core/dates'
import { formatMoney, moneySummary } from '../core/money'
import { db } from '../data/db'
import { targetOn } from '../data/repo'
import { EntryRow } from '../ui/EntryRow'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { openSheet } from '../ui/sheets'

export function Today() {
  const settings = useSettings()
  const today = useToday(settings)
  const from = [monthStart(today), addDays(today, -30)].sort()[0]

  const entries = useLiveQuery(() => db.entries.where('localDate').aboveOrEqual(from).toArray(), [from])
  const firstDay = useLiveQuery(async () => {
    const first = await db.entries.orderBy('localDate').filter((e) => !e.deletedAt).first()
    return first?.localDate ?? null
  }, [])
  const targets = useLiveQuery(() => db.targets.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const catName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories])

  if (!entries || firstDay === undefined || !targets) return null

  const budget = targetOn(targets, 'budget_month', today)
  const s = moneySummary(entries, today, budget, firstDay)
  const todays = entries
    .filter((e) => e.localDate === today && !e.deletedAt)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const cur = settings.currency
  const diff = s.dailyAverage == null ? null : s.spentToday - s.dailyAverage

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{formatLongDate(today)}</h1>
      </header>

      <section className="block" aria-labelledby="money-h">
        <h2 id="money-h" className="block-label">
          Money
        </h2>
        <p className="stat">
          <span className="stat-value num">{formatMoney(s.spentToday, cur)}</span>
          <span className="stat-unit">today</span>
        </p>
        {diff != null && Math.round(diff) !== 0 && (
          <p className="stat-note num">
            {formatMoney(Math.abs(diff), cur)} {diff < 0 ? 'below' : 'above'} your daily average
          </p>
        )}

        <div className="month">
          {s.budget != null && s.remainingMonth != null ? (
            <>
              <div className="month-line">
                <span className="num">{formatMoney(s.spentMonth, cur)} spent this month</span>
                <span className={`num ${s.remainingMonth < 0 ? 'over' : ''}`}>
                  {s.remainingMonth < 0
                    ? `${formatMoney(-s.remainingMonth, cur)} over`
                    : `${formatMoney(s.remainingMonth, cur)} left`}
                </span>
              </div>
              <div
                className="bar"
                role="progressbar"
                aria-label="Monthly budget used"
                aria-valuemin={0}
                aria-valuemax={s.budget}
                aria-valuenow={Math.round(s.spentMonth)}
              >
                <div
                  className={`bar-fill ${s.remainingMonth < 0 ? 'over' : ''}`}
                  style={{ width: `${Math.min(100, (s.spentMonth / Math.max(1, s.budget)) * 100)}%` }}
                />
              </div>
              {s.perDayLeft != null && s.perDayLeft > 0 && (
                <p className="stat-note num">{formatMoney(s.perDayLeft, cur)} a day for the rest of the month</p>
              )}
            </>
          ) : (
            <div className="month-line">
              <span className="num">{formatMoney(s.spentMonth, cur)} spent this month</span>
              <button type="button" className="btn-text" onClick={() => navigate('/me')}>
                Set budget
              </button>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="entries-h">
        <h2 id="entries-h" className="section-label">
          Logged today
        </h2>
        {todays.length ? (
          <ul className="list">
            {todays.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                timeZone={settings.timezone}
                categoryName={e.money?.categoryId ? catName.get(e.money.categoryId) : undefined}
              />
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p>Nothing logged today.</p>
            <button type="button" className="btn btn-quiet" onClick={() => openSheet({ kind: 'quick-add' })}>
              + Add
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
