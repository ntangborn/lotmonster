import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'

type RecipeRow = Database['public']['Tables']['recipes']['Row']
type RecipeLineRow = Database['public']['Tables']['recipe_lines']['Row']

export interface RecipeListItem extends RecipeRow {
  line_count: number
}

export interface RecipeLineWithIngredient extends RecipeLineRow {
  ingredient_name: string
  ingredient_sku: string | null
  ingredient_unit: string
  avg_cost_per_unit: number | null
  has_stock: boolean
}

export interface RecipeDetail {
  recipe: RecipeRow
  lines: RecipeLineWithIngredient[]
  total_cost: number | null
  cost_per_yield_unit: number | null
  cost_known: boolean
  production_history: Array<{
    id: string
    run_number: string
    status: string
    batch_multiplier: number
    actual_yield: number | null
    total_cogs: number | null
    started_at: string | null
    completed_at: string | null
    created_at: string
  }>
}

/**
 * Returns a Map of ingredient_id → weighted avg cost per unit
 * (from available lots with quantity > 0). Ingredients with no
 * available lots are omitted. Used for live recipe cost preview.
 */
export async function getIngredientAvgCosts(
  orgId: string,
  ingredientIds: string[]
): Promise<Map<string, number>> {
  if (ingredientIds.length === 0) return new Map()

  const admin = createAdminClient()
  const { data } = await admin
    .from('lots')
    .select('ingredient_id, quantity_remaining, unit_cost')
    .eq('org_id', orgId)
    .eq('status', 'available')
    .gt('quantity_remaining', 0)
    .in('ingredient_id', ingredientIds)

  const acc = new Map<string, { stock: number; costSum: number }>()
  for (const l of data ?? []) {
    if (!l.ingredient_id) continue
    const qty = Number(l.quantity_remaining) || 0
    const cost = Number(l.unit_cost) || 0
    const cur = acc.get(l.ingredient_id) ?? { stock: 0, costSum: 0 }
    cur.stock += qty
    cur.costSum += qty * cost
    acc.set(l.ingredient_id, cur)
  }

  const out = new Map<string, number>()
  for (const [id, v] of acc) {
    if (v.stock > 0) out.set(id, v.costSum / v.stock)
  }
  return out
}

export async function listRecipes(orgId: string): Promise<RecipeListItem[]> {
  const admin = createAdminClient()
  const { data: recipes, error } = await admin
    .from('recipes')
    .select('*')
    .eq('org_id', orgId)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)

  if (!recipes || recipes.length === 0) return []

  const ids = recipes.map((r) => r.id)
  const { data: lines } = await admin
    .from('recipe_lines')
    .select('recipe_id')
    .eq('org_id', orgId)
    .in('recipe_id', ids)

  const counts = new Map<string, number>()
  for (const l of lines ?? []) {
    counts.set(l.recipe_id, (counts.get(l.recipe_id) ?? 0) + 1)
  }

  return recipes.map((r) => ({ ...r, line_count: counts.get(r.id) ?? 0 }))
}

export async function getRecipeDetail(
  orgId: string,
  id: string
): Promise<RecipeDetail | null> {
  const admin = createAdminClient()

  const { data: recipe } = await admin
    .from('recipes')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!recipe) return null

  const { data: lines } = await admin
    .from('recipe_lines')
    .select(
      'id, org_id, recipe_id, ingredient_id, quantity, unit, sort_order, created_at, ingredients(name, sku, unit)'
    )
    .eq('org_id', orgId)
    .eq('recipe_id', id)
    .order('sort_order', { ascending: true })

  const ingredientIds = (lines ?? []).map((l) => l.ingredient_id)
  const avgCosts = await getIngredientAvgCosts(orgId, ingredientIds)

  const linesOut: RecipeLineWithIngredient[] = (lines ?? []).map((l) => {
    const ing = (l as unknown as { ingredients: { name: string; sku: string | null; unit: string } | null }).ingredients
    const avg = avgCosts.get(l.ingredient_id) ?? null
    return {
      id: l.id,
      org_id: l.org_id,
      recipe_id: l.recipe_id,
      ingredient_id: l.ingredient_id,
      quantity: Number(l.quantity),
      unit: l.unit,
      sort_order: l.sort_order,
      created_at: l.created_at,
      ingredient_name: ing?.name ?? 'Unknown',
      ingredient_sku: ing?.sku ?? null,
      ingredient_unit: ing?.unit ?? l.unit,
      avg_cost_per_unit: avg,
      has_stock: avg != null,
    }
  })

  let totalCost: number | null = 0
  let costKnown = true
  for (const l of linesOut) {
    if (l.avg_cost_per_unit == null) {
      costKnown = false
      continue
    }
    totalCost += Number(l.quantity) * l.avg_cost_per_unit
  }
  if (!costKnown && linesOut.some((l) => l.avg_cost_per_unit == null)) {
    // Total cost is still partial; surface what we know
  }
  const costPerYield =
    totalCost != null && Number(recipe.target_yield) > 0
      ? totalCost / Number(recipe.target_yield)
      : null

  const { data: runs } = await admin
    .from('production_runs')
    .select(
      'id, run_number, status, batch_multiplier, actual_yield, total_cogs, started_at, completed_at, created_at'
    )
    .eq('org_id', orgId)
    .eq('recipe_id', id)
    .order('created_at', { ascending: false })

  return {
    recipe,
    lines: linesOut,
    total_cost: totalCost,
    cost_per_yield_unit: costPerYield,
    cost_known: costKnown,
    production_history: (runs ?? []).map((r) => ({
      id: r.id,
      run_number: r.run_number,
      status: r.status,
      batch_multiplier: Number(r.batch_multiplier) || 1,
      actual_yield: r.actual_yield != null ? Number(r.actual_yield) : null,
      total_cogs: r.total_cogs != null ? Number(r.total_cogs) : null,
      started_at: r.started_at,
      completed_at: r.completed_at,
      created_at: r.created_at,
    })),
  }
}
