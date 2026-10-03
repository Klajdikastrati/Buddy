import { useLiveQuery } from '../ui/live'
import { useMemo, useState } from 'react'
import { searchFoods, unitOf } from '../core/nutrition'
import { formatNumber } from '../core/numbers'
import type { Food } from '../core/types'
import { db } from '../data/db'
import { updateFood } from '../data/repo-food'
import { DOMAIN } from '../ui/domains'
import { SubHead } from '../ui/fields'
import { navigate } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { openSheet } from '../ui/sheets'

const SOURCE: Record<Food['source'], string | null> = { custom: null, off: 'Open Food Facts', recipe: 'Recipe', generic: 'Common food' }

/** The food library: custom foods, recipes, and anything kept from Open Food Facts. */
export function MeFoods() {
  const foods = useLiveQuery(() => db.foods.filter((f) => !f.deletedAt).toArray(), [])
  const [q, setQ] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const list = useMemo(() => {
    if (!foods) return []
    if (q.trim()) return searchFoods(foods, q, Date.now(), 100)
    return foods.filter((f) => !f.archived).sort((a, b) => a.name.localeCompare(b.name))
  }, [foods, q])
  const hidden = foods?.filter((f) => f.archived) ?? []
  if (!foods) return null

  const open = (f: Food) => openSheet(f.source === 'recipe' ? { kind: 'recipe', food: f } : { kind: 'food-edit', food: f })

  return (
    <div className="screen">
      <SubHead title="Foods" back={() => navigate('/me')} />
      <div className="pair">
        <button type="button" className="btn btn-quiet" onClick={() => openSheet({ kind: 'food-edit' })}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          New food
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => openSheet({ kind: 'recipe' })}>
          <Icon name="book" size={18} />
          New recipe
        </button>
      </div>
      <div className="search">
        <Icon name="search" size={18} />
        <input className="input" type="search" autoComplete="off" placeholder="Search your foods…" aria-label="Search foods" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {list.length ? (
        <ul className="list with-icons">
          {list.map((f) => (
            <li key={f.id} className="list-row">
              <span className="row-icon">
                <IconChip name={f.source === 'recipe' ? 'book' : 'food'} tint={DOMAIN.food.tint} />
              </span>
              <button type="button" className="row-main" onClick={() => open(f)}>
                <span className="row-title">{f.name}</span>
                <span className="row-sub num">
                  {[f.brand, f.kcal == null ? 'kcal unknown' : `${formatNumber(f.kcal, 0)} kcal / 100 ${unitOf(f)}`, SOURCE[f.source]]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
              <Icon name="chevronRight" size={16} strokeWidth={2.2} className="row-chev" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted pad-l">{q.trim() ? `No food matches “${q.trim()}”.` : 'Foods you create or log appear here.'}</p>
      )}

      {hidden.length > 0 && !q.trim() && (
        <section className="group">
          <button type="button" className="btn-text" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? 'Hide hidden foods' : `Show hidden (${hidden.length})`}
          </button>
          {showHidden && (
            <ul className="list">
              {hidden.map((f) => (
                <li key={f.id} className="list-row">
                  <span className="row-main static muted">
                    <span className="row-title">{f.name}</span>
                  </span>
                  <button type="button" className="btn-text" onClick={() => void updateFood(f, { archived: false })}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
