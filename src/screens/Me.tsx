import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { formatMoney, parseAmount } from '../core/money'
import { db } from '../data/db'
import { addCategory, saveSettings, setTarget, targetOn, updateCategory, updateItem } from '../data/repo'
import { signOut, syncNow, type SyncState } from '../data/sync'
import { useSettings, useSyncState, useToday } from '../ui/hooks'
import { toast } from '../ui/toast'

function syncLabel(s: SyncState, pending: number): string {
  const waiting = pending ? ` · ${pending} waiting` : ''
  if (s.status === 'syncing') return 'Syncing…'
  if (s.status === 'offline') return `Offline${waiting}`
  if (s.status === 'error') return `Couldn’t sync${waiting} · tap to retry`
  if (!s.lastSyncedAt) return pending ? `${pending} waiting` : 'Not synced yet'
  const mins = Math.round((Date.now() - Date.parse(s.lastSyncedAt)) / 60_000)
  return `Synced ${mins < 1 ? 'just now' : `${mins} min ago`}${waiting}`
}

export function Me() {
  const settings = useSettings()
  const sync = useSyncState()
  const today = useToday(settings)
  const targets = useLiveQuery(() => db.targets.toArray(), [])
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').filter((c) => !c.deletedAt).toArray(), [])
  const items = useLiveQuery(() => db.items.filter((i) => !i.deletedAt).toArray(), [])
  const pending = useLiveQuery(() => db.outbox.count(), [])
  const budget = targets ? targetOn(targets, 'budget_month', today) : null

  const [budgetDraft, setBudgetDraft] = useState<string | null>(null)
  const [newCat, setNewCat] = useState('')

  async function saveBudget() {
    if (budgetDraft == null) return
    const value = budgetDraft.trim() ? parseAmount(budgetDraft) : null
    if (budgetDraft.trim() && value == null) return toast('Enter a number for the budget.')
    await setTarget('budget_month', value, settings.currency, today)
    setBudgetDraft(null)
    toast(value == null ? 'Budget removed' : `Budget set to ${formatMoney(value, settings.currency)} a month`)
  }

  async function exportBackup() {
    const data = {
      exportedAt: new Date().toISOString(),
      settings,
      entries: await db.entries.toArray(),
      items: await db.items.toArray(),
      categories: await db.categories.toArray(),
      targets: await db.targets.toArray(),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `buddy-backup-${today}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const sortedItems = [...(items ?? [])].sort((a, b) => Number(a.archived) - Number(b.archived) || b.useCount - a.useCount)

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Me</h1>
      </header>

      <section className="group" aria-labelledby="money-set">
        <h2 id="money-set" className="section-label">
          Money
        </h2>
        <form
          className="setting"
          onSubmit={(e) => {
            e.preventDefault()
            void saveBudget()
          }}
        >
          <label htmlFor="budget">Monthly budget</label>
          <input
            id="budget"
            className="input input-inline num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="None"
            value={budgetDraft ?? (budget != null ? String(budget) : '')}
            onChange={(e) => setBudgetDraft(e.target.value)}
            onBlur={() => void saveBudget()}
          />
        </form>
        <div className="setting">
          <span>Currency</span>
          <span className="muted">{settings.currency === 'ALL' ? 'Lek (ALL)' : settings.currency}</span>
        </div>
      </section>

      <section className="group" aria-labelledby="day-set">
        <h2 id="day-set" className="section-label">
          Day
        </h2>
        <div className="setting">
          <label htmlFor="rollover">New day starts at</label>
          <select
            id="rollover"
            className="input input-inline"
            value={settings.rolloverHour}
            onChange={(e) => void saveSettings({ rolloverHour: Number(e.target.value) })}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="group" aria-labelledby="cat-set">
        <h2 id="cat-set" className="section-label">
          Categories
        </h2>
        <ul className="list">
          {categories?.map((c) => (
            <li key={c.id} className="list-row">
              <span className={`row-main static ${c.archived ? 'muted' : ''}`}>
                <span className="row-title">{c.name}</span>
              </span>
              <button type="button" className="btn-text" onClick={() => void updateCategory(c, { archived: !c.archived })}>
                {c.archived ? 'Restore' : 'Hide'}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="row-gap"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newCat.trim()) return
            void addCategory(newCat)
            setNewCat('')
          }}
        >
          <input
            className="input grow"
            autoComplete="off"
            placeholder="New category…"
            aria-label="New category name"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button type="submit" className="btn btn-quiet">
            Add
          </button>
        </form>
      </section>

      <section className="group" aria-labelledby="item-set">
        <h2 id="item-set" className="section-label">
          Saved items
        </h2>
        {sortedItems.length === 0 && <p className="muted">Items are saved automatically when you log something.</p>}
        <ul className="list">
          {sortedItems.map((i) => (
            <li key={i.id} className="list-row">
              <span className={`row-main static ${i.archived ? 'muted' : ''}`}>
                <span className="row-title">{i.name}</span>
                <span className="row-sub num">
                  {i.money ? formatMoney(i.money.amount, i.money.currency) : ''} · used {i.useCount}×
                </span>
              </span>
              <button
                type="button"
                className={`btn-text ${i.favorite ? 'accent' : ''}`}
                aria-pressed={i.favorite}
                onClick={() => void updateItem(i, { favorite: !i.favorite })}
              >
                {i.favorite ? 'Pinned' : 'Pin'}
              </button>
              <button type="button" className="btn-text" onClick={() => void updateItem(i, { archived: !i.archived })}>
                {i.archived ? 'Restore' : 'Hide'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="group" aria-labelledby="data-set">
        <h2 id="data-set" className="section-label">
          Data
        </h2>
        <button type="button" className="setting setting-button" onClick={() => void syncNow()}>
          <span>Cloud sync</span>
          <span className={`muted ${sync.status === 'error' ? 'over' : ''}`}>{syncLabel(sync, pending ?? 0)}</span>
        </button>
        <button type="button" className="btn btn-quiet full" onClick={() => void exportBackup()}>
          Download backup
        </button>
        <button
          type="button"
          className="btn btn-quiet full"
          onClick={async () => {
            if (!(await signOut())) toast('Some changes haven’t synced yet. Connect to the internet first.')
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  )
}
