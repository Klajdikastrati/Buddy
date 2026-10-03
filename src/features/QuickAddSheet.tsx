import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { formatMoney } from '../core/money'
import { searchItems } from '../core/recents'
import type { Item } from '../core/types'
import { db } from '../data/db'
import { logItem, setEntryDeleted } from '../data/repo'
import { closeSheet, openSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

/**
 * The centre action. Recents first — a repeat purchase is one tap. Tapping the
 * row's amount instead opens it prefilled, for when the price changed.
 */
export function QuickAddSheet() {
  const [query, setQuery] = useState('')
  const items = useLiveQuery(() => db.items.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const catName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories])
  const list = useMemo(() => (items ? searchItems(items, query, Date.now(), 10) : []), [items, query])

  async function repeat(item: Item) {
    const id = await logItem(item)
    closeSheet()
    const amount = item.money ? ` · ${formatMoney(item.money.amount, item.money.currency)}` : ''
    toast(`Logged ${item.name}${amount}`, { label: 'Undo', run: () => setEntryDeleted(id, true) })
  }

  function adjust(item: Item) {
    openSheet({ kind: 'money', prefill: { title: item.name, kind: item.kind } })
  }

  const q = query.trim()

  return (
    <Sheet open onClose={closeSheet} title="Quick add">
      <div className="quick-actions">
        <button type="button" className="action" onClick={() => openSheet({ kind: 'money', prefill: { kind: 'expense', title: q || undefined } })}>
          Expense
        </button>
        <button type="button" className="action" onClick={() => openSheet({ kind: 'money', prefill: { kind: 'income', title: q || undefined } })}>
          Income
        </button>
      </div>

      <input
        className="input"
        type="search"
        autoComplete="off"
        placeholder="Search…"
        aria-label="Search items"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {items && items.length > 0 && <h3 className="section-label">{q ? 'Matches' : 'Recent'}</h3>}
      <ul className="list">
        {list.map((item) => (
          <li key={item.id} className="list-row">
            <button type="button" className="row-main" onClick={() => repeat(item)}>
              <span className="row-title">{item.name}</span>
              <span className="row-sub">
                {item.kind === 'income' ? 'Income' : item.money?.categoryId ? catName.get(item.money.categoryId) : 'Expense'}
              </span>
            </button>
            {item.money && (
              <button type="button" className="row-side num" aria-label={`Change amount for ${item.name}`} onClick={() => adjust(item)}>
                {formatMoney(item.money.amount, item.money.currency)}
              </button>
            )}
          </li>
        ))}
      </ul>

      {q && (
        <button type="button" className="btn btn-quiet full" onClick={() => openSheet({ kind: 'money', prefill: { kind: 'expense', title: q } })}>
          Add “{q}”
        </button>
      )}
      {items && items.length === 0 && <p className="muted">Things you log appear here for one-tap repeats.</p>}
    </Sheet>
  )
}
