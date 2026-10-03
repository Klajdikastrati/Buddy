import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { archiveTracker } from '../data/repo-trackers'
import { DOMAIN } from '../ui/domains'
import { SubHead } from '../ui/fields'
import { navigate } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { openSheet } from '../ui/sheets'

const TYPE: Record<string, string> = { number: 'number', text: 'text', bool: 'yes/no' }

/** Your own things to track — water, reading, anything. They show up in Quick Add. */
export function MeTrackers() {
  const trackers = useLiveQuery(() => db.trackers.filter((t) => !t.deletedAt).toArray(), [])
  if (!trackers) return null
  const active = trackers.filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name))
  const hidden = trackers.filter((t) => t.archived)

  return (
    <div className="screen">
      <SubHead title="Trackers" back={() => navigate('/me')} />
      <p className="muted">Track anything Buddy doesn’t cover. Each tracker appears in Quick Add; numbers show up in History → Trends.</p>
      {active.length > 0 && (
        <ul className="list with-icons">
          {active.map((t) => (
            <li key={t.id} className="list-row">
              <span className="row-icon">
                <IconChip name="tracker" tint={DOMAIN.tracker.tint} />
              </span>
              <button type="button" className="row-main" onClick={() => openSheet({ kind: 'tracker-def', def: t })}>
                <span className="row-title">{t.name}</span>
                <span className="row-sub">{t.fields.map((f) => `${f.label} (${f.unit ?? TYPE[f.type]})`).join(' · ')}</span>
              </button>
              <Icon name="chevronRight" size={16} strokeWidth={2.2} className="row-chev" />
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-quiet full" onClick={() => openSheet({ kind: 'tracker-def' })}>
        <Icon name="plus" size={18} strokeWidth={2.2} />
        New tracker
      </button>
      {hidden.map((t) => (
        <div key={t.id} className="setting">
          <span className="muted">{t.name}</span>
          <button type="button" className="btn-text" onClick={() => void archiveTracker(t, false)}>
            Restore
          </button>
        </div>
      ))}
    </div>
  )
}
