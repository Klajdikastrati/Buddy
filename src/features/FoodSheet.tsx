import { useLiveQuery } from '../ui/live'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { formatMoney, parseAmount } from '../core/money'
import { per100FromSnapshot, scaleNutrients, searchFoods, unitOf, type FoodDraft } from '../core/nutrition'
import { formatNumber, parseDecimal } from '../core/numbers'
import { rankItems } from '../core/recents'
import type { Entry, Food, ID, Item } from '../core/types'
import { db } from '../data/db'
import { offProduct, offSearch } from '../data/off'
import { adoptFood, foodByBarcode, logFood } from '../data/repo-food'
import { DOMAIN } from '../ui/domains'
import { confirmSaved, deleteEntry } from '../ui/entryActions'
import { NoteField, SheetFooter, WhenField } from '../ui/fields'
import { useSettings } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { closeSheet, openSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'

const BarcodeScanner = lazy(() => import('./BarcodeScanner'))
const FORM = 'food-form'

/** A food picked for logging. Open Food Facts results stay unsaved until logged. */
interface Picked {
  food: Food
  saved: boolean
}

function draftFood(d: FoodDraft): Food {
  const t = new Date().toISOString()
  return { ...d, id: `draft:${d.sourceId ?? d.name}`, createdAt: t, updatedAt: t, deletedAt: null, favorite: false, useCount: 0, lastUsedAt: null, archived: false }
}

const toDraft = ({ name, brand, barcode, basis, servings, ingredients, source, sourceId, ...rest }: Food): FoodDraft => {
  const { kcal, proteinG, carbsG, fatG, fiberG, sugarG, satFatG, sodiumMg, caffeineMg } = rest
  return { name, brand, barcode, basis, servings, ingredients, source, sourceId, kcal, proteinG, carbsG, fatG, fiberG, sugarG, satFatG, sodiumMg, caffeineMg }
}

const kcalPer100 = (f: Food) => (f.kcal == null ? 'kcal unknown' : `${formatNumber(f.kcal, 0)} kcal / 100 ${unitOf(f)}`)

export function FoodSheet({ entry, food, query }: { entry?: Entry; food?: Food; query?: string }) {
  // New logs open synchronously, so the search field's focus lands inside the tap (iOS keyboard).
  if (!entry) return <FoodFlow initial={food ? { food, saved: true } : null} query={query} />
  return <EditFood entry={entry} />
}

function EditFood({ entry }: { entry: Entry }) {
  // The entry's food — or, if it never synced to this device, one rebuilt from the snapshot.
  const initial = useLiveQuery(async (): Promise<Picked | null> => {
    if (!entry.nutrition) return null
    const n = entry.nutrition
    const stored = n.foodId ? await db.foods.get(n.foodId) : undefined
    if (stored) return { food: stored, saved: true }
    const snap: FoodDraft = {
      name: entry.title,
      brand: null,
      barcode: null,
      basis: '100g',
      ...per100FromSnapshot(n),
      servings: n.servingLabel && n.grams ? [{ label: n.servingLabel, grams: n.grams }] : [],
      ingredients: null,
      source: 'custom',
      sourceId: null,
    }
    return { food: draftFood(snap), saved: false }
  }, [entry.id])
  if (initial === undefined) return null
  return <FoodFlow entry={entry} initial={initial} />
}

function FoodFlow({ entry, initial, query }: { entry?: Entry; initial: Picked | null; query?: string }) {
  const [picked, setPicked] = useState<Picked | null>(initial)

  if (!picked) {
    return (
      <Sheet open onClose={closeSheet} title="Food">
        <FoodPicker initialQuery={query ?? ''} onPick={(food, saved) => setPicked({ food, saved })} />
      </Sheet>
    )
  }
  return <AmountLoader key={picked.food.id} entry={entry} picked={picked} onChange={() => setPicked(null)} />
}

/* --------------------------------- picking -------------------------------- */

type Online = { state: 'idle' } | { state: 'loading' } | { state: 'done'; results: FoodDraft[] } | { state: 'error' }
type Lookup = { state: 'idle' } | { state: 'loading'; code: string } | { state: 'missing'; code: string } | { state: 'error'; code: string }

function FoodPicker({ initialQuery, onPick }: { initialQuery: string; onPick: (food: Food, saved: boolean) => void }) {
  const [q, setQ] = useState(initialQuery)
  const [online, setOnline] = useState<Online>({ state: 'idle' })
  const [scanning, setScanning] = useState(false)
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' })
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const foodItems = useLiveQuery(() => db.items.filter((i) => i.kind === 'food').toArray(), [])
  const now = useMemo(() => Date.now(), [])

  const byId = useMemo(() => new Map(foods?.map((f) => [f.id, f])), [foods])
  const query = q.trim()
  const recents = useMemo(
    () =>
      query || !foodItems
        ? []
        : rankItems(foodItems, now, 8).flatMap((i) => {
            const f = i.food && byId.get(i.food.foodId)
            return f && !f.archived ? [{ item: i, food: f }] : []
          }),
    [query, foodItems, byId, now],
  )
  const matches = useMemo(() => (foods && query ? searchFoods(foods, query, now) : []), [foods, query, now])

  async function searchOnline() {
    setOnline({ state: 'loading' })
    try {
      setOnline({ state: 'done', results: await offSearch(query) })
    } catch {
      setOnline({ state: 'error' })
    }
  }

  async function byBarcode(code: string) {
    setScanning(false)
    setLookup({ state: 'loading', code })
    const local = await foodByBarcode(code)
    if (local) return onPick(local, true)
    try {
      const draft = await offProduct(code)
      if (draft) return onPick(draftFood(draft), false)
      setLookup({ state: 'missing', code })
    } catch {
      setLookup({ state: 'error', code })
    }
  }

  if (scanning) {
    return (
      <Suspense fallback={<p className="muted">Opening camera…</p>}>
        <BarcodeScanner onCode={(c) => void byBarcode(c)} onCancel={() => setScanning(false)} />
      </Suspense>
    )
  }

  const create = (draft: Partial<FoodDraft>) => openSheet({ kind: 'food-edit', draft, logAfter: true })

  return (
    <>
      <div className="row-gap">
        <div className="search grow">
          <Icon name="search" size={18} />
          <input
            className="input"
            type="search"
            autoComplete="off"
            placeholder="Search foods…"
            aria-label="Search foods"
            data-autofocus=""
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOnline({ state: 'idle' })
            }}
          />
        </div>
        <button type="button" className="btn btn-quiet square" aria-label="Scan barcode" onClick={() => setScanning(true)}>
          <Icon name="scan" size={22} />
        </button>
      </div>

      {lookup.state !== 'idle' && (
        <div className="notice" role="status">
          {lookup.state === 'loading' && <p>Looking up {lookup.code}…</p>}
          {lookup.state === 'missing' && <p>Open Food Facts doesn’t know {lookup.code}.</p>}
          {lookup.state === 'error' && <p>Couldn’t reach Open Food Facts. Check the connection.</p>}
          {lookup.state !== 'loading' && (
            <div className="row-gap">
              <button type="button" className="btn btn-quiet btn-small" onClick={() => setScanning(true)}>
                Scan again
              </button>
              <button type="button" className="btn btn-primary btn-small" onClick={() => create({ barcode: lookup.code, sourceId: null })}>
                Create food
              </button>
            </div>
          )}
        </div>
      )}

      {recents.length > 0 && (
        <section>
          <h3 className="section-label">Recent</h3>
          <ul className="list with-icons">
            {recents.map(({ item, food }) => (
              <FoodRow key={item.id} food={food} sub={recentSub(item, food)} onClick={() => onPick(food, true)} />
            ))}
          </ul>
        </section>
      )}

      {query && (
        <section>
          <h3 className="section-label">My foods</h3>
          {matches.length ? (
            <ul className="list with-icons">
              {matches.map((f) => (
                <FoodRow key={f.id} food={f} sub={[f.brand, kcalPer100(f)].filter(Boolean).join(' · ')} onClick={() => onPick(f, true)} />
              ))}
            </ul>
          ) : (
            <p className="muted pad-l">No saved food matches “{query}”.</p>
          )}
        </section>
      )}

      {query && online.state === 'done' && (
        <section>
          <h3 className="section-label">Open Food Facts</h3>
          {online.results.length ? (
            <ul className="list with-icons">
              {online.results.map((d) => {
                const f = draftFood(d)
                return <FoodRow key={f.id} food={f} sub={[d.brand, kcalPer100(f)].filter(Boolean).join(' · ')} onClick={() => onPick(f, false)} />
              })}
            </ul>
          ) : (
            <p className="muted pad-l">Nothing found online.</p>
          )}
        </section>
      )}

      {query && (
        <div className="stack">
          {online.state !== 'done' && (
            <button type="button" className="btn btn-quiet full" disabled={online.state === 'loading'} onClick={() => void searchOnline()}>
              <Icon name="search" size={18} />
              {online.state === 'loading' ? 'Searching Open Food Facts…' : 'Search Open Food Facts'}
            </button>
          )}
          {online.state === 'error' && <p className="field-error">Online search failed. Try again, scan, or create it.</p>}
          <button type="button" className="btn btn-quiet full" onClick={() => create({ name: query })}>
            <Icon name="plus" size={18} />
            Create “{query}”
          </button>
        </div>
      )}

      {!query && recents.length === 0 && lookup.state === 'idle' && (
        <p className="muted pad-l">Search your foods, scan a barcode, or create one — it’s remembered for next time.</p>
      )}
    </>
  )
}

function recentSub(item: Item, food: Food): string {
  const portion = item.food?.servingLabel ?? `${formatNumber(item.food?.grams ?? 100, 0)} ${unitOf(food)}`
  const kcal = food.kcal == null || !item.food ? null : `${formatNumber((food.kcal * item.food.grams) / 100, 0)} kcal`
  return [portion, kcal, item.money ? formatMoney(item.money.amount, item.money.currency) : null].filter(Boolean).join(' · ')
}

function FoodRow({ food, sub, onClick }: { food: Food; sub: string; onClick: () => void }) {
  return (
    <li className="list-row">
      <span className="row-icon">
        <IconChip name={food.source === 'recipe' ? 'book' : 'food'} tint={DOMAIN.food.tint} />
      </span>
      <button type="button" className="row-main" onClick={onClick}>
        <span className="row-title">{food.name}</span>
        <span className="row-sub num">{sub}</span>
      </button>
    </li>
  )
}

/* --------------------------------- amount --------------------------------- */

interface Defaults {
  grams: number
  servingLabel: string | null
  price: number | null
  categoryId: ID | null
}

function AmountLoader({ entry, picked, onChange }: { entry?: Entry; picked: Picked; onChange: () => void }) {
  const defaults = useLiveQuery(async (): Promise<Defaults> => {
    if (entry?.nutrition) {
      return {
        grams: entry.nutrition.grams ?? 100,
        servingLabel: entry.nutrition.servingLabel,
        price: entry.money?.amount ?? null,
        categoryId: entry.money?.categoryId ?? null,
      }
    }
    const item = await db.items.filter((i) => !i.deletedAt && i.kind === 'food' && i.food?.foodId === picked.food.id).first()
    const foodDrink = await db.categories.filter((c) => !c.deletedAt && c.name === 'Food & Drink').first()
    // Without a remembered portion: the first real serving — never a whole pack — else 100 g/ml.
    const first = picked.food.servings.find((s) => !s.label.startsWith('Whole'))
    return {
      grams: item?.food?.grams ?? first?.grams ?? 100,
      servingLabel: item?.food ? item.food.servingLabel : (first?.label ?? null),
      price: item?.money?.amount ?? null,
      categoryId: item?.money?.categoryId ?? foodDrink?.id ?? null,
    }
  }, [entry?.id, picked.food.id])
  if (!defaults) return null
  return <AmountForm entry={entry} picked={picked} defaults={defaults} onChange={onChange} />
}

/** "2 × 1 slice (30 g)" → serving index + count, when it matches one of the food's servings. */
function parseServing(label: string | null, servings: Food['servings']): { index: number; count: number } | null {
  if (!label) return null
  const m = /^(\d+(?:\.\d+)?) × (.+)$/.exec(label)
  const count = m ? Number(m[1]) : 1
  const index = servings.findIndex((s) => s.label === (m ? m[2] : label))
  return index >= 0 ? { index, count } : null
}

function AmountForm({ entry, picked, defaults, onChange }: { entry?: Entry; picked: Picked; defaults: Defaults; onChange: () => void }) {
  const settings = useSettings()
  const { food } = picked
  const unit = unitOf(food)
  const initialServing = parseServing(defaults.servingLabel, food.servings)
  const [serving, setServing] = useState<number | null>(initialServing?.index ?? null)
  const [count, setCount] = useState(initialServing?.count ?? 1)
  const [gramsText, setGramsText] = useState(String(defaults.grams))
  const [price, setPrice] = useState(defaults.price != null ? String(defaults.price) : '')
  const [categoryId, setCategoryId] = useState<ID | null>(defaults.categoryId)
  const [when, setWhen] = useState(entry?.occurredAt ?? new Date().toISOString())
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const gramsRef = useRef<HTMLInputElement>(null)
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').filter((c) => !c.archived && !c.deletedAt).toArray(), [])

  const grams = serving != null ? food.servings[serving].grams * count : parseDecimal(gramsText)
  const servingLabel = serving != null ? `${count !== 1 ? `${formatNumber(count)} × ` : ''}${food.servings[serving].label}` : null
  const n = grams ? scaleNutrients(food, grams) : null
  const priceValue = price.trim() ? parseAmount(price) : null

  function pickServing(i: number | null) {
    setServing(i)
    setCount(1)
    if (i == null) {
      setGramsText(grams ? String(Math.round(grams * 10) / 10) : '')
      requestAnimationFrame(() => gramsRef.current?.focus())
    }
    setError(null)
  }

  async function save() {
    if (!grams || grams <= 0) {
      setError(`Enter an amount in ${unit}.`)
      return
    }
    if (price.trim() && priceValue == null) {
      setError('Enter a valid price, or leave it empty.')
      return
    }
    const stored = picked.saved ? food : await adoptFood(toDraft(food))
    const id = await logFood(
      { food: stored, grams, servingLabel, price: priceValue, categoryId: priceValue ? categoryId : null, occurredAt: when, note },
      entry?.id,
    )
    const kcal = n?.kcal != null ? ` · ${formatNumber(n.kcal, 0)} kcal` : ''
    confirmSaved(`${stored.name}${kcal}`, id, !!entry)
  }

  const macro = (label: string, v: number | null | undefined, u = 'g') => (
    <span className="macro">
      <span className="macro-value num">{v == null ? '?' : formatNumber(v)}</span>
      <span className="macro-label">
        {label}
        {v == null ? '' : ` ${u}`}
      </span>
    </span>
  )

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={entry ? 'Edit food' : 'Food'}
      footer={<SheetFooter form={FORM} onDelete={entry ? () => void deleteEntry(entry) : undefined} />}
    >
      <form
        id={FORM}
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="picked">
          <IconChip name={food.source === 'recipe' ? 'book' : 'food'} tint={DOMAIN.food.tint} />
          <div className="grow">
            <p className="picked-name">{food.name}</p>
            <p className="row-sub">{[food.brand, kcalPer100(food), picked.saved ? null : 'Open Food Facts'].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" className="btn-text" onClick={onChange}>
            Change
          </button>
        </div>

        <fieldset className="field">
          <legend className="field-label">Amount</legend>
          <div className="chips">
            {food.servings.map((s, i) => (
              <button key={s.label} type="button" className={`chip ${serving === i ? 'on' : ''}`} aria-pressed={serving === i} onClick={() => pickServing(i)}>
                {s.label}
              </button>
            ))}
            <button type="button" className={`chip ${serving == null ? 'on' : ''}`} aria-pressed={serving == null} onClick={() => pickServing(null)}>
              In {unit}
            </button>
          </div>
        </fieldset>

        {serving != null ? (
          <div className="stepper" aria-label="Servings">
            <button type="button" className="icon-btn big" aria-label="Fewer" onClick={() => setCount(Math.max(0.5, count - (count > 1 ? 1 : 0.5)))}>
              −
            </button>
            <span className="stepper-value num">
              {formatNumber(count)}{' '}
              <span className="muted">
                × {formatNumber(food.servings[serving].grams)} = {formatNumber(grams ?? 0)} {unit}
              </span>
            </span>
            <button type="button" className="icon-btn big" aria-label="More" onClick={() => setCount(count < 1 ? 1 : count + 1)}>
              +
            </button>
          </div>
        ) : (
          <label className="field">
            <span className="sr-only">Amount in {unit}</span>
            <div className="input-unit">
              <input
                ref={gramsRef}
                className="input input-big num"
                inputMode="decimal"
                autoComplete="off"
                value={gramsText}
                onChange={(e) => {
                  setGramsText(e.target.value)
                  setError(null)
                }}
                aria-invalid={!!error}
              />
              <span className="input-suffix">{unit}</span>
            </div>
          </label>
        )}

        <div className="macros" aria-live="polite">
          <span className="macro macro-hero">
            <span className="macro-value num">{n?.kcal == null ? '?' : formatNumber(n.kcal, 0)}</span>
            <span className="macro-label">kcal</span>
          </span>
          {macro('Protein', n?.proteinG)}
          {macro('Carbs', n?.carbsG)}
          {macro('Fat', n?.fatG)}
        </div>
        {error && <p className="field-error">{error}</p>}

        <label className="field">
          <span className="field-label">Price ({settings.currency === 'ALL' ? 'Lek' : settings.currency}) · optional</span>
          <input className="input num" inputMode="decimal" autoComplete="off" placeholder="Didn’t pay" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        {priceValue != null && (
          <div className="chips" aria-label="Category">
            {categories?.map((c) => (
              <button key={c.id} type="button" className={`chip ${categoryId === c.id ? 'on' : ''}`} aria-pressed={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        <WhenField value={when} onChange={setWhen} />
        <NoteField value={note} onChange={setNote} />
      </form>
    </Sheet>
  )
}
