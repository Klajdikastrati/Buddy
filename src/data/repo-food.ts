import { recipeGrams, recipePer100, scaleNutrients, type FoodDraft } from '../core/nutrition'
import type { Food, ID, Instant, Item, Serving } from '../core/types'
import { db } from './db'
import { created, dayOf, entryRow, getSettings, now, patch, put, rememberItem, save } from './repo-base'

export type { FoodDraft }

export function saveFood(draft: FoodDraft, existing?: Food): Promise<Food> {
  const t = now()
  const food: Food = existing
    ? { ...existing, ...draft, updatedAt: t }
    : { ...created(t), ...draft, favorite: false, useCount: 0, lastUsedAt: null, archived: false }
  return save('foods', food)
}

export function updateFood(food: Food, changes: Partial<Pick<Food, 'favorite' | 'archived' | 'name'>>) {
  return patch('foods', food, changes)
}

/**
 * Recipes are foods whose nutrients are computed from ingredients (per 100 g
 * of the combined raw weight). "Whole recipe" is always offered as a serving.
 */
export async function saveRecipe(
  name: string,
  ingredients: { foodId: ID; grams: number }[],
  servings: Serving[],
  existing?: Food,
): Promise<Food> {
  const foods = new Map((await db.foods.bulkGet(ingredients.map((i) => i.foodId))).flatMap((f) => (f ? [[f.id, f]] : [])))
  const whole = { label: 'Whole recipe', grams: recipeGrams(ingredients) }
  return saveFood(
    {
      name: name.trim(),
      brand: null,
      barcode: null,
      basis: '100g',
      ...recipePer100(ingredients, foods),
      servings: [whole, ...servings.filter((s) => s.label !== whole.label)],
      ingredients,
      source: 'recipe',
      sourceId: null,
    },
    existing,
  )
}

export interface FoodLogInput {
  food: Food
  grams: number
  servingLabel: string | null
  /** Paid for it → the entry also carries a money facet (the Red Bull case). */
  price: number | null
  categoryId: ID | null
  occurredAt: Instant
  note: string | null
}

/**
 * Log food: nutrition snapshot (+ money if priced) on one entry. Remembers the
 * portion and price on the food's item so the next time is one tap.
 */
export async function logFood(input: FoodLogInput, editId?: ID): Promise<ID> {
  const settings = await getSettings()
  const localDate = await dayOf(input.occurredAt)
  const { food, grams, servingLabel } = input
  const money =
    input.price != null && input.price > 0
      ? { amount: input.price, currency: settings.currency, categoryId: input.categoryId }
      : undefined

  return db.transaction('rw', [db.entries, db.items, db.foods, db.outbox], async () => {
    const newUse = !editId
    const item = await rememberItem(
      (i) => i.kind === 'food' && i.food?.foodId === food.id,
      { name: food.name, kind: 'food', food: { foodId: food.id, grams, servingLabel }, money },
      newUse,
    )
    if (newUse) {
      const current = (await db.foods.get(food.id)) ?? food
      const t = now()
      await put('foods', { ...current, useCount: current.useCount + 1, lastUsedAt: t, updatedAt: t })
    }
    const entry = await entryRow(
      {
        kind: 'food',
        occurredAt: input.occurredAt,
        itemId: item.id,
        title: food.name,
        note: input.note,
        nutrition: { foodId: food.id, grams, servingLabel, ...scaleNutrients(food, grams) },
        money: money && { direction: 'out', ...money },
      },
      localDate,
      editId,
    )
    await put('entries', entry)
    return entry.id
  })
}

/** One-tap repeat of a food item: same portion, same price, now. */
export async function logFoodItem(item: Item): Promise<ID> {
  const food = item.food ? await db.foods.get(item.food.foodId) : undefined
  if (!food || !item.food) throw new Error(`Food for “${item.name}” is missing`)
  return logFood({
    food,
    grams: item.food.grams,
    servingLabel: item.food.servingLabel,
    price: item.money?.amount ?? null,
    categoryId: item.money?.categoryId ?? null,
    occurredAt: now(),
    note: null,
  })
}

/**
 * Keep a food picked from Open Food Facts: reuse the local copy for that
 * barcode if there is one, otherwise save the draft.
 */
export async function adoptFood(draft: FoodDraft): Promise<Food> {
  if (draft.sourceId) {
    const existing = await db.foods
      .filter((f) => !f.deletedAt && (f.sourceId === draft.sourceId || (!!draft.barcode && f.barcode === draft.barcode)))
      .first()
    if (existing) return existing.archived ? updateFood(existing, { archived: false }) : existing
  }
  return saveFood(draft)
}

export async function foodByBarcode(code: string): Promise<Food | undefined> {
  return db.foods
    .where('barcode')
    .equals(code)
    .filter((f) => !f.deletedAt)
    .first()
}
