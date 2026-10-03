import { formatTime } from '../core/dates'
import { formatMoney } from '../core/money'
import type { Entry } from '../core/types'
import { openSheet } from './sheets'

export function EntryRow({ entry, categoryName, timeZone }: { entry: Entry; categoryName?: string; timeZone: string }) {
  const m = entry.money
  return (
    <li className="list-row">
      <button type="button" className="row-main" onClick={() => openSheet({ kind: 'money', entry })}>
        <span className="row-title">{entry.title}</span>
        <span className="row-sub">
          <span className="num">{formatTime(entry.occurredAt, timeZone)}</span>
          {categoryName ? ` · ${categoryName}` : ''}
        </span>
      </button>
      {m && (
        <span className={`row-side num ${m.direction === 'in' ? 'positive' : ''}`}>
          {m.direction === 'in' ? '+' : ''}
          {formatMoney(m.amount, m.currency)}
        </span>
      )}
    </li>
  )
}
