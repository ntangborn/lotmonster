import { createAdminClient } from '@/lib/supabase/admin'
import { previewAllocation, type LotAllocation } from '@/lib/fefo'
import type { Database } from '@/types/database'
import type { RunStatus } from './schema'

type RunRow = Database['public']['Tables']['production_runs']['Row']

export interface RunListItem extends RunRow {
  recipe_name: string
}

export interface RunDetail {
  run: RunRow
  recipe: {
    id: string
    name: string
    target_yield: number
    target_yield_unit: string
    version: number
  }
  consumed: Array<{
    id: string
    ingredient_id: string
    ingredient_name: string
    lot_id: string
    lot_number: string
    quantity_used: number
    unit: string
    unit_cost_at_use: number
    line_cost: number
  }>
  total_cogs_observed: number
}

export interface IngredientDemand {
  ingredient_id: string
  ingredient_name: string
  ingredient_sku: string | null
  required_qty: number
  unit: string
  available_qty: number
  shortage: number
  allocations: LotAllocation[]
  ok: boolean
}

export interface AllocationPreview {
  recipe_id: string
  recipe_name: string
  target_yield: number
  target_yield_unit: string
  batch_multiplier: number
  expected_yield: number
  demands: IngredientDemand[]
  all_ok: boolean
}

/**
 * Generate next run number: PR-{YYYY}-{NNN}, scoped per org per year.
 */
export async function suggestRunNumber(orgId: string): Promise<string> {
  const admin = createAdminClient()
  const year = new Date().getFullYear()
  const prefix = `PR-${year}-`
  const { data } = await admin
    .from('production_runs')
    .select('run_number')
    .eq('org_id', orgId)
    .ilike('run_number', `${prefix}%`)

  let max = 0
  for (const r of data ?? []) {
    const m = r.run_number.match(/-(\d+)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

/**
 * Compute per-ingredient demand and FEFO allocation preview for a recipe
 * at a given batch multiplier. Does NOT mutate.
 */
export async function previewProductionRun(
  orgId: string,
  recipeId: string,
  batchMultiplier: number
): Promise<AllocationPreview | null> {
  const admin = createAdminClient()

  const { data: recipe } = await admin
    .from('recipes')
    .select('id, name, target_yield, target_yield_unit, version')
    .eq('org_id', orgId)
    .eq('id', recipeId)
    .maybeSingle()
  if (!recipe) return null

  const { data: lines } = await admin
    .from('recipe_lines')
    .select('ingredient_id, quantity, unit, ingredients(name, sku)')
    .eq('org_id', orgId)
    .eq('recipe_id', recipeId)
    .order('sort_order', { ascending: true })

  const demands: IngredientDemand[] = []

  for (const line of lines ?? []) {
    const required = Number(line.quantity) * batchMultiplier
    const ing = (
      line as unknown as {
        ingredients: { name: string; sku: string | null } | null
      }
    ).ingredients
    const preview = await previewAllocation(
      line.ingredient_id,
      required,
      orgId
    )
    if (preview.ok) {
      const used = preview.allocations.reduce(
        (s, a) => s + a.quantityUsed,
        0
      )
      demands.push({
        ingredient_id: line.ingredient_id,
        ingredient_name: ing?.name ?? 'Unknown',
        ingredient_sku: ing?.sku ?? null,
        required_qty: required,
        unit: line.unit,
        available_qty: used, // sum of allocated; sufficient
        shortage: 0,
        allocations: preview.allocations,
        ok: true,
      })
    } else {
      demands.push({
        ingredient_id: line.ingredient_id,
        ingredient_name: ing?.name ?? 'Unknown',
        ingredient_sku: ing?.sku ?? null,
        required_qty: required,
        unit: line.unit,
        available_qty: preview.available,
        shortage: preview.needed - preview.available,
        allocations: [],
        ok: false,
      })
    }
  }

  return {
    recipe_id: recipe.id,
    recipe_name: recipe.name,
    target_yield: Number(recipe.target_yield),
    target_yield_unit: recipe.target_yield_unit,
    batch_multiplier: batchMultiplier,
    expected_yield: Number(recipe.target_yield) * batchMultiplier,
    demands,
    all_ok: demands.every((d) => d.ok),
  }
}

export async function listRuns(
  orgId: string,
  status?: RunStatus
): Promise<RunListItem[]> {
  const admin = createAdminClient()
  let q = admin
    .from('production_runs')
    .select('*, recipes(name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  return (data ?? []).map((r) => {
    const recipe = (r as unknown as { recipes: { name: string } | null }).recipes
    return {
      ...(r as RunRow),
      recipe_name: recipe?.name ?? 'Unknown',
    }
  })
}

export async function getRunDetail(
  orgId: string,
  id: string
): Promise<RunDetail | null> {
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('production_runs')
    .select('*, recipes(id, name, target_yield, target_yield_unit, version)')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!run) return null

  const recipe = (
    run as unknown as {
      recipes: {
        id: string
        name: string
        target_yield: number
        target_yield_unit: string
        version: number
      } | null
    }
  ).recipes
  if (!recipe) return null

  const { data: consumed } = await admin
    .from('production_run_lots')
    .select(
      'id, ingredient_id, lot_id, quantity_used, unit, unit_cost_at_use, line_cost, lots(lot_number), ingredients(name)'
    )
    .eq('org_id', orgId)
    .eq('production_run_id', id)
    .order('created_at', { ascending: true })

  let total = 0
  const consumedOut = (consumed ?? []).map((c) => {
    const lot = (c as unknown as { lots: { lot_number: string } | null }).lots
    const ing = (
      c as unknown as { ingredients: { name: string } | null }
    ).ingredients
    const lineCost = Number(c.line_cost) || 0
    total += lineCost
    return {
      id: c.id,
      ingredient_id: c.ingredient_id,
      ingredient_name: ing?.name ?? 'Unknown',
      lot_id: c.lot_id,
      lot_number: lot?.lot_number ?? '',
      quantity_used: Number(c.quantity_used),
      unit: c.unit,
      unit_cost_at_use: Number(c.unit_cost_at_use),
      line_cost: lineCost,
    }
  })

  return {
    run: run as RunRow,
    recipe: {
      id: recipe.id,
      name: recipe.name,
      target_yield: Number(recipe.target_yield),
      target_yield_unit: recipe.target_yield_unit,
      version: recipe.version,
    },
    consumed: consumedOut,
    total_cogs_observed: total,
  }
}
