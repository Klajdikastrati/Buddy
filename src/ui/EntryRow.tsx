import { formatTime } from '../core/dates'
import { entryLine } from '../core/entries'
import type { Entry, TrackerDef } from '../core/types'
import { DOMAIN, entryDomain } from './domains'
import { openEntry } from './entryActions'
import { IconChip } from './icons'

export function EntryRow({
  entry,
  categoryName,
  timeZone,
  tracker,
}: {
  entry: Entry
  categoryName?: string
  timeZone: string
  tracker?: TrackerDef
}) {
  const line = entryLine(entry, timeZone, tracker)
  // Sleep shows its bed–wake range instead of a single time.
  const sub = [...(entry.sleep ? [] : [formatTime(entry.occurredAt, timeZone)]), ...(categoryName ? [categoryName] : []), ...line.detail]
  const d = DOMAIN[entryDomain(entry)]
  return (
    <li className="list-row">
      <span className="row-icon">
        <IconChip name={d.icon} tint={d.tint} />
      </span>
      <button type="button" className="row-main" onClick={() => openEntry(entry)}>
        <span className="row-title">{entry.title}</span>
        <span className="row-sub num">{sub.join(' · ')}</span>
      </button>
      {line.side && <span className={`row-side num ${line.positive ? 'positive' : ''}`}>{line.side}</span>}
    </li>
  )
}
