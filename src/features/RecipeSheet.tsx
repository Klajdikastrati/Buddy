import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { recipeGrams, recipePer100, scaleNutrients, searchFoods, unitOf } from '../core/nutrition'
import { formatNumber, parseDecimal } from '../core/numbers'
import type { Food, ID } from '../core/types'
import { db } from '../data/db'
import { saveRecipe, updateFood } from '../data/repo-food'
import { DOMAIN } from '../ui/domains'
import { SheetFooter } from '../ui/fields'
import { Icon, IconChip } from '../ui/icons'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

const FORM = 'recipe-form'

/** A recipe = a food computed from ingredients by weight. Optional portions add a "1 portion" serving. */
export function RecipeSheet({ food }: { food?: Food }) {
  const foods = useLiveQuery(() => db.foods.filter((f) => !f.deletedAt).toArray(), [])
  if (!foods) return null
  return <RecipeForm food={food} foods={foods} />
}

function RecipeForm({ food, foods }: { food?: Food; foods: Food[] }) {
  const byId = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])
  const [name, setName] = useState(food?.name ?? '')
  const [rows, setRows] = useState<{ foodId: ID; grams: string }[]>(
    (food?.ingredients ?? []).map((i) => ({ foodId: i.foodId, grams: String(i.grams) })),
  )
  const portion = food?.servings.find((s) => s.label === '1 portion')
  const [portions, setPortions] = useState(
    portion && food?.ingredients ? String(Math.round(recipeGrams(food.ingredients) / portion.grams)) : '',
  )
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  const ingredients = rows.flatMap((r) => {
    const g = parseDecimal(r.grams)
    return g ? [{ foodId: r.foodId, grams: g }] : []
  })
  const total = recipeGrams(ingredients)
  const per100 = recipePer100(ingredients, byId)
  const whole = scaleNutrients(per100, total)
  const n = parseDecimal(portions)
  const matches = q.trim()
    ? searchFoods(foods, q, Date.now(), 8).filter((f) => f.id !== food?.id && !rows.some((r) => r.foodId === f.id))
    : []

  async function save() {
    if (!name.trim()) return setError('Give the recipe a name.')
    if (!ingredients.length) return setError('Add at least one ingredient with an amount.')
    const servings = n && n >= 1 ? [{ label: '1 portion', grams: Math.round((total / n) * 10) / 10 }] : []
    const keep = (food?.servings ?? []).filter((s) => s.label !== '1 portion' && s.label !== 'Whole recipe')
    const saved = await saveRecipe(name, ingredients, [...servings, ...keep], food)
    closeSheet()
    toast(food ? `Updated ${saved.name}` : `Saved ${saved.name}`)
  }

  const known = (v: number | null) => (v == null ? '?' : formatNumber(v, 0))

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={food ? 'Edit recipe' : 'New recipe'}
      footer={
        <div className="row-gap">
          {food && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={async () => {
                await updateFood(food, { archived: true })
                closeSheet()
                toast(`Hid ${food.name}`)
              }}
            >
              Hide
            </button>
          )}
          <div className="grow">
            <SheetFooter form={FORM} />
          </div>
        </div>
      }
    >
      <form
        id={FORM}
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" autoComplete="off" placeholder="Tavë kosi" data-autofocus={food ? undefined : ''} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <fieldset className="field">
          <legend className="field-label">Ingredients (raw weight)</legend>
          {rows.length > 0 && (
            <ul className="list with-icons">
              {rows.map((r, i) => {
                const f = byId.get(r.foodId)
                return (
                  <li key={r.foodId} className="list-row">
                    <span className="row-icon">
                      <IconChip name="food" tint={DOMAIN.food.tint} />
                    </span>
                    <span className="row-main static">
                      <span className="row-title">{f?.name ?? 'Missing food'}</span>
                      <span className="row-sub num">{f?.kcal == null ? 'kcal unknown' : `${formatNumber(f.kcal, 0)} kcal / 100 ${f ? unitOf(f) : 'g'}`}</span>
                    </span>
                    <input
                      className="input input-inline num w-80"
                      inputMode="decimal"
                      aria-label={`Grams of ${f?.name ?? 'ingredient'}`}
                      value={r.grams}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))}
                    />
                    <span className="unit muted">{f ? unitOf(f) : 'g'}</span>
                    <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      <Icon name="close" size={14} strokeWidth={2.4} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="search">
            <Icon name="search" size={18} />
            <input className="input" type="search" autoComplete="off" placeholder="Add ingredient from your foods…" aria-label="Add ingredient" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {matches.length > 0 && (
            <ul className="list">
              {matches.map((f) => (
                <li key={f.id} className="list-row">
                  <button
                    type="button"
                    className="row-main"
                    onClick={() => {
                      setRows([...rows, { foodId: f.id, grams: '100' }])
                      setQ('')
                      setError(null)
                    }}
                  >
                    <span className="row-title">{f.name}</span>
                    <span className="row-sub">{f.brand ?? (f.kcal == null ? 'kcal unknown' : `${formatNumber(f.kcal, 0)} kcal / 100 ${unitOf(f)}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && matches.length === 0 && <p className="field-hint">No saved food matches — create it first from Food.</p>}
        </fieldset>

        <label className="field">
          <span className="field-label">Makes how many portions · optional</span>
          <input className="input num" inputMode="numeric" autoComplete="off" value={portions} onChange={(e) => setPortions(e.target.value)} />
        </label>

        {total > 0 && (
          <div className="summary-card num">
            <div>
              <span className="summary-value">{known(whole.kcal)}</span>
              <span className="summary-label">kcal total · {formatNumber(total, 0)} g</span>
            </div>
            <div>
              <span className="summary-value">{known(per100.kcal)}</span>
              <span className="summary-label">kcal / 100 g</span>
            </div>
            {n && n >= 1 ? (
              <div>
                <span className="summary-value">{whole.kcal == null ? '?' : formatNumber(whole.kcal / n, 0)}</span>
                <span className="summary-label">kcal / portion</span>
              </div>
            ) : null}
          </div>
        )}
        {error && <p className="field-error">{error}</p>}
      </form>
    </Sheet>
  )
}
