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
      { kind: 'ingredient', id: line.ingredient_id },
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

export interface CompleteRunContextSku {
  id: string
  name: string
  fill_quantity: number | null
  fill_unit: string | null
  shelf_life_days: number | null
  boms: Array<{
    ingredient_id: string
    ingredient_name: string
    ingredient_unit: string
    quantity_per_unit: number
    bom_unit: string | null
  }>
}

export interface CompleteRunContext {
  liquidTotal: number
  skus: CompleteRunContextSku[]
  /**
   * Aggregated packaging-ingredient stock + weighted-avg cost across
   * available lots, keyed by ingredient_id. Used client-side for
   * shortfall detection + packaging-COGS preview.
   */
  packagingStock: Record<
    string,
    { available: number; avg_unit_cost: number }
  >
}

/**
 * Data bundle the Complete-Run dialog needs to render the multi-SKU
 * yield form + live cost preview + shortfall warning. Reads:
 *   - raw production_run_lots written by startRun → liquidTotal
 *   - skus linked to the run's recipe (kind='unit', active=true)
 *   - sku_packaging BOMs for those skus
 *   - available/avg_unit_cost for the referenced packaging ingredients
 */
export async function getCompleteRunContext(
  orgId: string,
  runId: string
): Promise<CompleteRunContext | null> {
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('production_runs')
    .select('id, recipe_id, status')
    .eq('org_id', orgId)
    .eq('id', runId)
    .maybeSingle()
  if (!run) return null

  // Liquid total from raw production_run_lots (written at startRun).
  const { data: rawLots } = await admin
    .from('production_run_lots')
    .select('line_cost')
    .eq('org_id', orgId)
    .eq('production_run_id', runId)
  const liquidTotal = (rawLots ?? []).reduce(
    (s, r) => s + (Number(r.line_cost) || 0),
    0
  )

  // SKUs linked to this recipe.
  const { data: skuRows } = await admin
    .from('skus')
    .select(
      'id, name, fill_quantity, fill_unit, shelf_life_days'
    )
    .eq('org_id', orgId)
    .eq('recipe_id', run.recipe_id)
    .eq('kind', 'unit')
    .eq('active', true)
    .order('name', { ascending: true })

  const skus = skuRows ?? []
  if (skus.length === 0) {
    return { liquidTotal, skus: [], packagingStock: {} }
  }

  const skuIds = skus.map((s) => s.id)

  // BOMs for these SKUs.
  const { data: bomRows } = await admin
    .from('sku_packaging')
    .select(
      'sku_id, ingredient_id, quantity, unit, ingredients(name, unit, kind)'
    )
    .eq('org_id', orgId)
    .in('sku_id', skuIds)

  const bomsBySku = new Map<
    string,
    CompleteRunContextSku['boms']
  >()
  const ingredientIds = new Set<string>()
  for (const b of bomRows ?? []) {
    const ing = (
      b as unknown as {
        ingredients: { name: string; unit: string; kind: string } | null
      }
    ).ingredients
    if (!ing) continue
    ingredientIds.add(b.ingredient_id)
    const arr = bomsBySku.get(b.sku_id) ?? []
    arr.push({
      ingredient_id: b.ingredient_id,
      ingredient_name: ing.name,
      ingredient_unit: ing.unit,
      quantity_per_unit: Number(b.quantity) || 0,
      bom_unit: b.unit,
    })
    bomsBySku.set(b.sku_id, arr)
  }

  // Aggregate available packaging stock + weighted-avg cost per ingredient.
  const packagingStock: CompleteRunContext['packagingStock'] = {}
  if (ingredientIds.size > 0) {
    const { data: lots } = await admin
      .from('lots')
      .select('ingredient_id, quantity_remaining, unit_cost')
      .eq('org_id', orgId)
      .eq('status', 'available')
      .gt('quantity_remaining', 0)
      .in('ingredient_id', Array.from(ingredientIds))

    const agg = new Map<string, { stock: number; costSum: number }>()
    for (const l of lots ?? []) {
      if (!l.ingredient_id) continue
      const cur = agg.get(l.ingredient_id) ?? { stock: 0, costSum: 0 }
      const qty = Number(l.quantity_remaining) || 0
      const cost = Number(l.unit_cost) || 0
      cur.stock += qty
      cur.costSum += qty * cost
      agg.set(l.ingredient_id, cur)
    }
    for (const [id, v] of agg) {
      packagingStock[id] = {
        available: v.stock,
        avg_unit_cost: v.stock > 0 ? v.costSum / v.stock : 0,
      }
    }
    // Ingredients referenced in BOMs but with no available stock still
    // need an entry so the UI can flag "0 available".
    for (const id of ingredientIds) {
      if (!packagingStock[id]) {
        packagingStock[id] = { available: 0, avg_unit_cost: 0 }
      }
    }
  }

  return {
    liquidTotal,
    skus: skus.map((s) => ({
      id: s.id,
      name: s.name,
      fill_quantity: s.fill_quantity != null ? Number(s.fill_quantity) : null,
      fill_unit: s.fill_unit,
      shelf_life_days:
        s.shelf_life_days != null ? Number(s.shelf_life_days) : null,
      boms: bomsBySku.get(s.id) ?? [],
    })),
    packagingStock,
  }
}
