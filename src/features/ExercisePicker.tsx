import { useLiveQuery } from '../ui/live'
import { useState } from 'react'
import { normalizeName } from '../core/recents'
import type { Exercise, ID } from '../core/types'
import { db } from '../data/db'
import { addExercise } from '../data/repo-training'
import { DOMAIN } from '../ui/domains'
import { Icon, IconChip } from '../ui/icons'

/** Search the library; "Create" adds a new exercise on the spot. */
export function ExercisePicker({ exclude = [], onPick }: { exclude?: ID[]; onPick: (e: Exercise) => void }) {
  const [q, setQ] = useState('')
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deletedAt && !e.archived).toArray(), [])
  const query = normalizeName(q)
  const list = (exercises ?? [])
    .filter((e) => !exclude.includes(e.id) && (!query || normalizeName(`${e.name} ${e.muscle ?? ''}`).includes(query)))
    .sort((a, b) => (a.muscle ?? '').localeCompare(b.muscle ?? '') || a.name.localeCompare(b.name))
  const exact = exercises?.some((e) => normalizeName(e.name) === query)

  return (
    <div className="stack">
      <div className="search">
        <Icon name="search" size={18} />
        <input className="input" type="search" autoComplete="off" placeholder="Search exercises…" aria-label="Search exercises" data-autofocus="" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim() && !exact && (
        <button type="button" className="btn btn-quiet full" onClick={async () => onPick(await addExercise(q, null))}>
          <Icon name="plus" size={18} />
          Create “{q.trim()}”
        </button>
      )}
      <ul className="list with-icons">
        {list.map((e) => (
          <li key={e.id} className="list-row">
            <span className="row-icon">
              <IconChip name="workout" tint={DOMAIN.workout.tint} />
            </span>
            <button type="button" className="row-main" onClick={() => onPick(e)}>
              <span className="row-title">{e.name}</span>
              {e.muscle && <span className="row-sub">{e.muscle}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
