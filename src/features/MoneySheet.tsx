import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { formatMoney, parseAmount } from '../core/money'
import { searchItems } from '../core/recents'
import type { Entry, EntryKind, ID, Item } from '../core/types'
import { db } from '../data/db'
import { logMoney, setEntryDeleted } from '../data/repo'
import { useSettings } from '../ui/hooks'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

interface Props {
  entry?: Entry
  prefill?: { title?: string; kind?: EntryKind }
}

/** `datetime-local` wants local wall time without a zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MoneySheet({ entry, prefill }: Props) {
  const settings = useSettings()
  const editing = !!entry
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? prefill?.kind ?? 'expense')
  const [amount, setAmount] = useState(entry?.money ? String(entry.money.amount) : '')
  const [title, setTitle] = useState(entry?.title ?? prefill?.title ?? '')
  const [categoryId, setCategoryId] = useState<ID | null>(entry?.money?.categoryId ?? null)
  const [when, setWhen] = useState(toLocalInput(entry?.occurredAt ?? new Date().toISOString()))
  const [note, setNote] = useState(entry?.note ?? '')
  const [showNote, setShowNote] = useState(!!entry?.note)
  const [error, setError] = useState<string | null>(null)
  const [titleFocused, setTitleFocused] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').filter((c) => !c.archived && !c.deletedAt).toArray(),
    [],
  )
  const items = useLiveQuery(() => db.items.toArray(), [])
  const suggestions = useMemo(() => {
    if (!items || !titleFocused || !title.trim()) return []
    return searchItems(items.filter((i) => i.kind === kind), title, Date.now(), 4).filter(
      (i) => i.name !== title.trim(),
    )
  }, [items, title, kind, titleFocused])

  function pick(item: Item) {
    setTitle(item.name)
    if (item.money) {
      if (!amount) setAmount(String(item.money.amount))
      setCategoryId(item.money.categoryId)
    }
    setTitleFocused(false)
    amountRef.current?.focus()
  }

  async function save() {
    const value = parseAmount(amount)
    if (value == null) {
      setError('Enter an amount.')
      amountRef.current?.focus()
      return
    }
    const id = await logMoney(
      {
        kind,
        title,
        amount: value,
        categoryId,
        occurredAt: new Date(when).toISOString(),
        note: showNote ? note : null,
      },
      entry?.id,
    )
    closeSheet()
    const label = `${title.trim() || (kind === 'income' ? 'Income' : 'Expense')} · ${formatMoney(value, settings.currency)}`
    if (editing) toast(`Updated ${label}`)
    else toast(`Logged ${label}`, { label: 'Undo', run: () => setEntryDeleted(id, true) })
  }

  async function remove() {
    if (!entry) return
    await setEntryDeleted(entry.id, true)
    closeSheet()
    toast(`Deleted ${entry.title}`, { label: 'Undo', run: () => setEntryDeleted(entry.id, false) })
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={editing ? 'Edit' : kind === 'income' ? 'Income' : 'Expense'}
      footer={
        <div className="row-gap">
          {editing && (
            <button type="button" className="btn btn-quiet danger" onClick={remove}>
              Delete
            </button>
          )}
          <button type="submit" form="money-form" className="btn btn-primary grow">
            Save
          </button>
        </div>
      }
    >
      <form
        id="money-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="segmented" role="radiogroup" aria-label="Type">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? 'on' : ''}
              onClick={() => setKind(k)}
            >
              {k === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <label className="field">
          <span className="field-label">Amount ({settings.currency === 'ALL' ? 'Lek' : settings.currency})</span>
          <input
            ref={amountRef}
            className="input input-big num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            data-autofocus={editing ? undefined : ''}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
            aria-invalid={!!error}
          />
          {error && <span className="field-error">{error}</span>}
        </label>

        <label className="field">
          <span className="field-label">What</span>
          <input
            className="input"
            autoComplete="off"
            placeholder={kind === 'income' ? 'Salary…' : 'Red Bull, taxi, groceries…'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => setTimeout(() => setTitleFocused(false), 150)}
          />
        </label>
        {suggestions.length > 0 && (
          <div className="chips" aria-label="Suggestions">
            {suggestions.map((i) => (
              <button key={i.id} type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}>
                {i.name}
                {i.money && <span className="muted num"> {formatMoney(i.money.amount, i.money.currency)}</span>}
              </button>
            ))}
          </div>
        )}

        {kind === 'expense' && (
          <fieldset className="field">
            <legend className="field-label">Category</legend>
            <div className="chips">
              {categories?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip ${categoryId === c.id ? 'on' : ''}`}
                  aria-pressed={categoryId === c.id}
                  onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="field">
          <span className="field-label">When</span>
          <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>

        {showNote ? (
          <label className="field">
            <span className="field-label">Note</span>
            <input className="input" autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        ) : (
          <button type="button" className="btn-text" onClick={() => setShowNote(true)}>
            + Add note
          </button>
        )}
      </form>
    </Sheet>
  )
}
