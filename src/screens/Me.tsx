import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { formatMoney } from '../core/money'
import { formatTarget, targetOn, TARGET_DEFS } from '../core/targets'
import { db } from '../data/db'
import { addCategory, saveSettings, updateCategory, updateItem } from '../data/repo'
import { signOut, syncNow, type SyncState } from '../data/sync'
import { DOMAIN } from '../ui/domains'
import { NavRow } from '../ui/fields'
import { navigate, useSettings, useSyncState, useToday } from '../ui/hooks'
import { downloadFile } from '../ui/download'
import { IconChip } from '../ui/icons'
import { openSheet } from '../ui/sheets'
import { toast } from '../ui/toast'

function syncLabel(s: SyncState, pending: number): string {
  const waiting = pending ? ` · ${pending} waiting` : ''
  if (s.status === 'syncing') return 'Syncing…'
  if (s.status === 'offline') return `Offline${waiting}`
  if (s.status === 'error') return `Couldn’t sync${waiting}`
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
  const foodCount = useLiveQuery(() => db.foods.filter((f) => !f.deletedAt && !f.archived).count(), [])
  const trackerCount = useLiveQuery(() => db.trackers.filter((t) => !t.deletedAt && !t.archived).count(), [])
  const pendingRecs = useLiveQuery(() => db.recommendations.where('status').equals('pending').filter((r) => !r.deletedAt).count(), [])
  const [newCat, setNewCat] = useState('')

  const setTargets = targets ? TARGET_DEFS.filter((d) => targetOn(targets, d.key, today) != null) : []
  const budget = targets ? targetOn(targets, 'budget_month', today) : null
  const targetsTrail = budget != null
    ? `${formatTarget('budget_month', budget, settings.currency)}${setTargets.length > 1 ? ` +${setTargets.length - 1}` : ''}`
    : setTargets.length
      ? `${setTargets.length} set`
      : 'None set'

  async function exportBackup() {
    const tables = ['entries', 'items', 'categories', 'targets', 'foods', 'exercises', 'templates', 'sets', 'checkins', 'plan', 'trackers', 'analystRuns', 'recommendations'] as const
    const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), settings }
    for (const t of tables) data[t] = await db.table(t).toArray()
    downloadFile(new File([JSON.stringify(data, null, 2)], `buddy-backup-${today}.json`, { type: 'application/json' }))
  }

  const sortedItems = [...(items ?? [])].sort((a, b) => Number(a.archived) - Number(b.archived) || b.useCount - a.useCount)

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Me</h1>
      </header>

      <section className="settings-group with-icons" aria-label="Setup">
        <NavRow icon="target" tint={DOMAIN.plan.tint} label="Targets" trail={targetsTrail} onClick={() => navigate('/me/targets')} />
        <NavRow icon="food" tint={DOMAIN.food.tint} label="Foods & recipes" trail={foodCount ? `${foodCount}` : undefined} onClick={() => navigate('/me/foods')} />
        <NavRow icon="workout" tint={DOMAIN.workout.tint} label="Training" trail="Templates & exercises" onClick={() => navigate('/me/training')} />
        <NavRow icon="tracker" tint={DOMAIN.tracker.tint} label="Custom trackers" trail={trackerCount ? `${trackerCount}` : undefined} onClick={() => navigate('/me/trackers')} />
      </section>

      <section className="group" aria-labelledby="analyst-set">
        <h2 id="analyst-set" className="section-label">
          Buddy Analyst
        </h2>
        <div className="settings-group with-icons">
          <NavRow icon="upload" tint={DOMAIN.analyst.tint} label="Export for Analyst" onClick={() => openSheet({ kind: 'analyst-export' })} />
          <NavRow
            icon="sparkle"
            tint={DOMAIN.analyst.tint}
            label="Analyses & proposals"
            trail={pendingRecs ? `${pendingRecs} to review` : undefined}
            onClick={() => navigate('/me/analyst')}
          />
        </div>
      </section>

      <section className="group" aria-labelledby="cat-set">
        <h2 id="cat-set" className="section-label">
          Spending categories
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
            maxLength={60} placeholder="New category…"
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
        <ul className="list with-icons">
          {sortedItems.map((i) => (
            <li key={i.id} className="list-row">
              <span className="row-icon">
                <IconChip name={DOMAIN[i.kind].icon} tint={DOMAIN[i.kind].tint} />
              </span>
              <span className={`row-main static ${i.archived ? 'muted' : ''}`}>
                <span className="row-title">{i.name}</span>
                <span className="row-sub num">
                  {[i.money ? formatMoney(i.money.amount, i.money.currency) : null, `used ${i.useCount}×`].filter(Boolean).join(' · ')}
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

      <section className="group" aria-labelledby="day-set">
        <h2 id="day-set" className="section-label">
          General
        </h2>
        <div className="settings-group">
          <div className="setting">
            <span>Currency</span>
            <span className="setting-trail">{settings.currency === 'ALL' ? 'Lek (ALL)' : settings.currency}</span>
          </div>
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
        </div>
      </section>

      <section className="group" aria-labelledby="data-set">
        <h2 id="data-set" className="section-label">
          Data
        </h2>
        <div className="settings-group with-icons">
          <NavRow
            icon="cloud"
            label="Cloud sync"
            trail={<span className={sync.status === 'error' ? 'over' : ''}>{syncLabel(sync, pending ?? 0)}</span>}
            onClick={() => void syncNow()}
            chevron={false}
          />
          <NavRow icon="download" label="Download backup" onClick={() => void exportBackup()} chevron={false} />
          <NavRow
            icon="logout"
            tint="var(--danger)"
            label="Sign out"
            danger
            chevron={false}
            onClick={async () => {
              if (!(await signOut())) toast('Some changes haven’t synced yet. Connect to the internet first.')
            }}
          />
        </div>
      </section>
    </div>
  )
}
