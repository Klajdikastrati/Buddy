import { useMemo, useState } from 'react'
import { addDays, daysInMonth, formatShortDate, monthStart } from '../core/dates'
import { formatMoney, moneySummary, monthMoney } from '../core/money'
import { formatNumber } from '../core/numbers'
import { targetOn } from '../core/targets'
import { db } from '../data/db'
import { Bar } from '../ui/Bar'
import { DayChart } from '../ui/DayChart'
import { DOMAIN } from '../ui/domains'
import { EntryRow } from '../ui/EntryRow'
import { DaySwitcher, SubHead } from '../ui/fields'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { useLiveQuery } from '../ui/live'

const monthLabel = (d: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))

/** Finance dashboard: read-only. Logging is the + button's job. */
export function Money() {
  const settings = useSettings()
  const cur = settings.currency
  const today = useToday(settings)
  const [month, setMonth] = useState(monthStart(today))
  const isCurrent = month === monthStart(today)
  const from = monthStart(addDays(month, -1))
  const data = useLiveQuery(async () => {
    const [entries, targets, categories, first] = await Promise.all([
      db.entries.where('localDate').aboveOrEqual(from).toArray(),
      db.targets.toArray(),
      db.categories.toArray(),
      db.entries
        .orderBy('localDate')
        .filter((e) => !!e.money && !e.deletedAt)
        .first(),
    ])
    return { entries, targets, categories, firstDay: first?.localDate ?? null }
  }, [from])
  const catName = useMemo(() => new Map(data?.categories.map((c) => [c.id, c.name])), [data])

  if (!data) return <SubHead title="Money" back={() => navigate('/')} />
  // The budget that applied: today's for this month, the month-end one for a past month.
  const ref = isCurrent ? today : addDays(month, daysInMonth(month) - 1)
  const m = monthMoney(data.entries, month, today, data.firstDay)
  const budget = targetOn(data.targets, 'budget_month', ref)
  const s = isCurrent ? moneySummary(data.entries, today, budget, data.firstDay) : null
  const left = budget != null ? budget - m.spent : null
  const fmt = (n: number) => formatMoney(n, cur)
  const short = (n: number) => (cur === 'ALL' ? formatNumber(n, 0) : formatMoney(n, cur))
  const tint = { '--tint': DOMAIN.money.tint } as React.CSSProperties

  return (
    <div className="screen dense-screen">
      <SubHead title="Money" back={() => navigate('/')} />
      <DaySwitcher
        label={monthLabel(month)}
        onPrev={() => setMonth(monthStart(addDays(month, -1)))}
        onNext={() => setMonth(monthStart(addDays(month, 40)))}
        canNext={!isCurrent}
      />

      <section className="block" style={tint} aria-label="This month">
        <span className="block-label">{isCurrent ? 'Spent this month' : 'Spent'}</span>
        <p className="stat">
          <span className="stat-value num">{fmt(m.spent)}</span>
          {budget != null && <span className="stat-unit">of {short(budget)}</span>}
        </p>
        {budget != null && <Bar value={m.spent} max={budget} label="Budget used" />}
        <p className="stat-note num">
          {left == null
            ? 'No monthly budget set'
            : left < 0
              ? `${fmt(-left)} over budget`
              : `${fmt(left)} left${s?.perDayLeft != null && s.perDayLeft > 0 ? ` · ${short(s.perDayLeft)} a day to month end` : ''}`}
        </p>
        <div className="money-split num">
          <span>
            <span className="muted">Income </span>
            {fmt(m.income)}
          </span>
          <span>
            <span className="muted">Net </span>
            <span className={m.income - m.spent >= 0 ? 'positive' : ''}>
              {m.income - m.spent >= 0 ? '+' : '−'}
              {fmt(Math.abs(m.income - m.spent))}
            </span>
          </span>
        </div>
      </section>

      <div className="stats3">
        <div>
          <span className="summary-value num">{isCurrent ? short(s?.spentToday ?? 0) : short(m.perDay)}</span>
          <span className="summary-label">{isCurrent ? 'Today' : 'Per day'}</span>
        </div>
        <div>
          <span className="summary-value num">{isCurrent ? (s?.dailyAverage != null ? short(s.dailyAverage) : '—') : String(m.transactions.length)}</span>
          <span className="summary-label">{isCurrent ? '30-day avg/day' : 'Transactions'}</span>
        </div>
        <div>
          <span className="summary-value num">
            {m.previousToDate == null ? '—' : `${m.spent - m.previousToDate <= 0 ? '−' : '+'}${short(Math.abs(m.spent - m.previousToDate))}`}
          </span>
          <span className="summary-label">vs last month{isCurrent ? ' so far' : ''}</span>
        </div>
      </div>

      <section className="chart-card" aria-label="Spending per day">
        <span className="block-label">Spending per day</span>
        <DayChart
          // The whole month, future days empty: bars keep their place as the month fills.
          points={Array.from({ length: daysInMonth(month) }, (_, i) => {
            const date = addDays(month, i)
            return { date, value: m.byDay.find((d) => d.date === date)?.spent ?? null }
          })}
          tint={DOMAIN.money.tint}
          format={fmt}
          label={formatShortDate}
          highlight={isCurrent ? today : undefined}
          average={m.perDay}
        />
      </section>

      {m.byCategory.length > 0 && (
        <section className="group" aria-labelledby="cat-h">
          <h2 id="cat-h" className="section-label">
            By category
          </h2>
          <div className="settings-group cat-list" style={tint}>
            {m.byCategory.map((c) => (
              <div key={c.categoryId ?? 'none'} className="cat-row">
                <div className="cat-line num">
                  <span>{c.categoryId ? (catName.get(c.categoryId) ?? 'Category') : 'Uncategorised'}</span>
                  <span>
                    {short(c.spent)} <span className="muted">· {Math.round(c.share * 100)}%</span>
                  </span>
                </div>
                <Bar value={c.share} max={1} label={`${Math.round(c.share * 100)}% of spending`} />
              </div>
            ))}
          </div>
        </section>
      )}

      {m.top.length > 0 && (
        <section className="group" aria-labelledby="top-h">
          <h2 id="top-h" className="section-label">
            Biggest spends
          </h2>
          <div className="settings-group">
            {m.top.map((t) => (
              <div key={t.title} className="setting">
                <span className="truncate">{t.title}</span>
                <span className="setting-trail num">
                  {t.count > 1 && <span className="muted">{t.count}× · </span>}
                  {fmt(t.spent)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="tx-h">
        <h2 id="tx-h" className="section-label">
          Transactions
        </h2>
        {m.transactions.length ? (
          <ul className="list with-icons dense">
            {m.transactions.map((e) => (
              <EntryRow key={e.id} entry={e} timeZone={settings.timezone} categoryName={e.money?.categoryId && !e.nutrition ? catName.get(e.money.categoryId) : undefined} />
            ))}
          </ul>
        ) : (
          <p className="muted pad-l">Nothing spent this month yet.</p>
        )}
      </section>
    </div>
  )
}
