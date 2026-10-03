import { useState } from 'react'
import { emptyNutrients, unitOf, type FoodDraft } from '../core/nutrition'
import { formatNumber, parseDecimal } from '../core/numbers'
import { NUTRIENT_KEYS, type Food, type Nutrients, type Serving } from '../core/types'
import { saveFood, updateFood } from '../data/repo-food'
import { Segmented, SheetFooter } from '../ui/fields'
import { Icon } from '../ui/icons'
import { closeSheet, openSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

const FORM = 'food-edit-form'

const FIELDS: { key: keyof Nutrients; label: string; unit: string; more?: boolean }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'carbsG', label: 'Carbs', unit: 'g' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
  { key: 'fiberG', label: 'Fiber', unit: 'g', more: true },
  { key: 'sugarG', label: 'Sugar', unit: 'g', more: true },
  { key: 'satFatG', label: 'Saturated fat', unit: 'g', more: true },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg', more: true },
  { key: 'caffeineMg', label: 'Caffeine', unit: 'mg', more: true },
]

const show = (v: number | null | undefined) => (v == null ? '' : String(v))

/**
 * Create or edit a food. Values can be typed per 100 g/ml or per serving (as
 * on most labels); they're stored per 100. Empty = unknown, never zero.
 */
export function FoodEditorSheet({ food, draft, logAfter }: { food?: Food; draft?: Partial<FoodDraft>; logAfter?: boolean }) {
  const base: Partial<FoodDraft> = { ...food, ...draft }
  const [name, setName] = useState(base.name ?? '')
  const [brand, setBrand] = useState(base.brand ?? '')
  const [basis, setBasis] = useState<Food['basis']>(base.basis ?? '100g')
  const [per, setPer] = useState<'100' | 'serving'>('100')
  const [servingLabel, setServingLabel] = useState('1 serving')
  const [servingSize, setServingSize] = useState('')
  const [values, setValues] = useState<Record<keyof Nutrients, string>>(
    () => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, show(base[k])])) as Record<keyof Nutrients, string>,
  )
  const [moreOpen, setMoreOpen] = useState(FIELDS.some((f) => f.more && base[f.key] != null))
  const [servings, setServings] = useState<Serving[]>(base.servings ?? [])
  const [newLabel, setNewLabel] = useState('')
  const [newGrams, setNewGrams] = useState('')
  const [barcode, setBarcode] = useState(base.barcode ?? '')
  const [error, setError] = useState<string | null>(null)
  const unit = unitOf({ basis })

  function addServing() {
    const g = parseDecimal(newGrams)
    if (!newLabel.trim() || !g) return
    setServings([...servings.filter((s) => s.label !== newLabel.trim()), { label: newLabel.trim(), grams: g }])
    setNewLabel('')
    setNewGrams('')
  }

  async function save() {
    if (!name.trim()) return setError('Give it a name.')
    const size = parseDecimal(servingSize)
    if (per === 'serving' && !size) return setError(`Enter the serving size in ${unit}.`)
    const factor = per === 'serving' ? 100 / size! : 1
    const per100 = emptyNutrients()
    for (const k of NUTRIENT_KEYS) {
      const v = parseDecimal(values[k])
      if (values[k].trim() && v == null) return setError('Nutrient values must be numbers (or empty if unknown).')
      per100[k] = v == null ? null : Math.round(v * factor * 10) / 10
    }
    const allServings =
      per === 'serving' ? [{ label: `${servingLabel.trim() || '1 serving'} (${formatNumber(size!)} ${unit})`, grams: size! }, ...servings] : servings
    const saved = await saveFood(
      {
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: barcode.replace(/\D/g, '') || null,
        basis,
        ...per100,
        servings: allServings,
        ingredients: food?.ingredients ?? null,
        source: food?.source ?? draft?.source ?? 'custom',
        sourceId: food?.sourceId ?? draft?.sourceId ?? null,
      },
      food,
    )
    if (logAfter) openSheet({ kind: 'food', food: saved })
    else {
      closeSheet()
      toast(food ? `Updated ${saved.name}` : `Saved ${saved.name}`)
    }
  }

  async function hide() {
    if (!food) return
    await updateFood(food, { archived: true })
    closeSheet()
    toast(`Hid ${food.name}`, { label: 'Undo', run: () => void updateFood({ ...food, archived: true }, { archived: false }) })
  }

  const nutrientInput = (f: (typeof FIELDS)[number]) => (
    <label key={f.key} className="field">
      <span className="field-label">
        {f.label} ({f.unit})
      </span>
      <input
        className="input num"
        inputMode="decimal"
        autoComplete="off"
        placeholder="Unknown"
        value={values[f.key]}
        onChange={(e) => {
          setValues({ ...values, [f.key]: e.target.value })
          setError(null)
        }}
      />
    </label>
  )

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={food ? 'Edit food' : 'New food'}
      footer={
        <div className="row-gap">
          {food && (
            <button type="button" className="btn btn-quiet" onClick={() => void hide()}>
              Hide
            </button>
          )}
          <div className="grow">
            <SheetFooter form={FORM} saveLabel={logAfter ? 'Save & continue' : 'Save'} />
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
          <input className="input" autoComplete="off" data-autofocus={name ? undefined : ''} placeholder="Byrek me spinaq" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Brand · optional</span>
          <input className="input" autoComplete="off" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>
        <Segmented
          label="Measured in"
          options={[
            { value: '100g', label: 'Grams' },
            { value: '100ml', label: 'Millilitres' },
          ]}
          value={basis}
          onChange={setBasis}
        />

        <fieldset className="field">
          <legend className="field-label">Values per</legend>
          <Segmented
            label="Values per"
            options={[
              { value: '100', label: `100 ${unit}` },
              { value: 'serving', label: 'Serving' },
            ]}
            value={per}
            onChange={setPer}
          />
        </fieldset>
        {per === 'serving' && (
          <div className="pair">
            <label className="field">
              <span className="field-label">Serving</span>
              <input className="input" autoComplete="off" value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Size ({unit})</span>
              <input className="input num" inputMode="decimal" autoComplete="off" value={servingSize} onChange={(e) => setServingSize(e.target.value)} />
            </label>
          </div>
        )}

        <div className="pair">{FIELDS.filter((f) => !f.more).map(nutrientInput)}</div>
        {moreOpen ? (
          <div className="pair">{FIELDS.filter((f) => f.more).map(nutrientInput)}</div>
        ) : (
          <button type="button" className="btn-text" onClick={() => setMoreOpen(true)}>
            + More nutrients
          </button>
        )}
        <p className="field-hint">Leave anything you don’t know empty — Buddy marks it unknown instead of counting zero.</p>

        <fieldset className="field">
          <legend className="field-label">Servings</legend>
          {servings.length > 0 && (
            <ul className="list">
              {servings.map((s) => (
                <li key={s.label} className="list-row">
                  <span className="row-main static">
                    <span className="row-title">{s.label}</span>
                    <span className="row-sub num">
                      {formatNumber(s.grams)} {unit}
                    </span>
                  </span>
                  <button type="button" className="icon-btn" aria-label={`Remove ${s.label}`} onClick={() => setServings(servings.filter((x) => x !== s))}>
                    <Icon name="close" size={14} strokeWidth={2.4} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row-gap">
            <input className="input grow" autoComplete="off" placeholder="1 piece" aria-label="Serving name" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <input className="input num w-90" inputMode="decimal" autoComplete="off" placeholder={unit} aria-label={`Serving size in ${unit}`} value={newGrams} onChange={(e) => setNewGrams(e.target.value)} />
            <button type="button" className="btn btn-quiet" onClick={addServing}>
              Add
            </button>
          </div>
        </fieldset>

        <label className="field">
          <span className="field-label">Barcode · optional</span>
          <input className="input num" inputMode="numeric" autoComplete="off" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        </label>
        {error && <p className="field-error">{error}</p>}
      </form>
    </Sheet>
  )
}
