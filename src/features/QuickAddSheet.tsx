import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { formatMoney } from '../core/money'
import { searchItems } from '../core/recents'
import type { Item } from '../core/types'
import { db } from '../data/db'
import { logItem, setEntryDeleted } from '../data/repo'
import { DOMAIN, type DomainKey } from '../ui/domains'
import { Icon, IconChip } from '../ui/icons'
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
  const actions: { domain: DomainKey; open: () => void }[] = [
    { domain: 'expense', open: () => openSheet({ kind: 'money', prefill: { kind: 'expense', title: q || undefined } }) },
    { domain: 'income', open: () => openSheet({ kind: 'money', prefill: { kind: 'income', title: q || undefined } }) },
    { domain: 'sleep', open: () => openSheet({ kind: 'sleep' }) },
    { domain: 'weight', open: () => openSheet({ kind: 'weight' }) },
    { domain: 'activity', open: () => openSheet({ kind: 'activity' }) },
    { domain: 'checkin', open: () => openSheet({ kind: 'checkin' }) },
  ]

  return (
    <Sheet open onClose={closeSheet} title="Quick add">
      <div className="quick-actions">
        {actions.map((a) => (
          <button key={a.domain} type="button" className="action" onClick={a.open}>
            <IconChip name={DOMAIN[a.domain].icon} tint={DOMAIN[a.domain].tint} size="lg" />
            {DOMAIN[a.domain].label}
          </button>
        ))}
      </div>

      <div className="search">
        <Icon name="search" size={18} />
        <input
          className="input"
          type="search"
          autoComplete="off"
          placeholder="Search…"
          aria-label="Search items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {items && items.length > 0 && <h3 className="section-label">{q ? 'Matches' : 'Recent'}</h3>}
      <ul className="list with-icons">
        {list.map((item) => (
          <li key={item.id} className="list-row">
            <span className="row-icon">
              <IconChip name={DOMAIN[item.kind].icon} tint={DOMAIN[item.kind].tint} />
            </span>
            <button type="button" className="row-main" onClick={() => repeat(item)}>
              <span className="row-title">{item.name}</span>
              <span className="row-sub">
                {item.kind === 'food'
                  ? (item.food?.servingLabel ?? `${item.food?.grams ?? ''} g`)
                  : item.kind === 'income'
                    ? 'Income'
                    : item.money?.categoryId
                      ? catName.get(item.money.categoryId)
                      : 'Expense'}
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
