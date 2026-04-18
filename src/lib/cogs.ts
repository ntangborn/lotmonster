/**
 * COGS (cost of goods sold) calculations.
 *
 * Two flavors of "cost":
 *   1. Actual COGS — what an ingredient lot really cost when it was
 *      consumed by a production run. Snapshot at use-time and stored
 *      on production_run_lots.unit_cost_at_use. Use for completed runs
 *      and accounting.
 *   2. Estimated recipe COGS — weighted average of unit_cost across
 *      currently-available lots. Used to predict cost for recipe
 *      planning and "what would this batch cost today" UI.
 *
 * Pure helpers (compute*) take inputs and return shapes — testable
 * without a database. Wrappers (calculate*, get*) load the rows then
 * delegate.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Pure helpers ────────────────────────────────────────────────────────────

export interface ConsumedLot {
  ingredient_id: string
  ingredient_name: string
  lot_id: string
  lot_number: string
  quantity_used: number
  unit: string
  unit_cost_at_use: number
}

export interface RunCOGSLine {
  ingredient_id: string
  ingredient_name: string
  lot_id: string
  lot_number: string
  quantity_used: number
  unit: string
  unit_cost: number
  line_cost: number
}

export interface RunCOGSResult {
  total_cogs: number
  cogs_per_unit: number | null
  lines: RunCOGSLine[]
}

export function computeRunCOGS(
  consumed: ConsumedLot[],
  actualYield: number | null
): RunCOGSResult {
  const lines: RunCOGSLine[] = consumed.map((c) => ({
    ingredient_id: c.ingredient_id,
    ingredient_name: c.ingredient_name,
    lot_id: c.lot_id,
    lot_number: c.lot_number,
    quantity_used: c.quantity_used,
    unit: c.unit,
    unit_cost: c.unit_cost_at_use,
    line_cost: c.quantity_used * c.unit_cost_at_use,
  }))
  const total = lines.reduce((s, l) => s + l.line_cost, 0)
  const perUnit =
    actualYield != null && actualYield > 0 ? total / actualYield : null
  return { total_cogs: total, cogs_per_unit: perUnit, lines }
}

export interface RecipeLineInput {
  ingredient_id: string
  ingredient_name: string
  ingredient_sku?: string | null
  quantity: number
  unit: string
}

export interface AvailableLot {
  ingredient_id: string
  quantity_remaining: number
  unit_cost: number
}

export interface RecipeCOGSLine {
  ingredient_id: string
  ingredient_name: string
  quantity: number
  unit: string
  avg_unit_cost: number | null
  line_cost: number | null
  has_stock: boolean
}

export interface RecipeCOGSResult {
  estimated_cogs: number
  cogs_per_unit: number | null
  lines: RecipeCOGSLine[]
  warnings: string[]
  cost_known: boolean
}

export function computeRecipeEstimatedCOGS(
  recipeLines: RecipeLineInput[],
  availableLots: AvailableLot[],
  targetYield: number
): RecipeCOGSResult {
  // Weighted-average unit cost per ingredient from available lots.
  const acc = new Map<string, { stock: number; costSum: number }>()
  for (const lot of availableLots) {
    const qty = Number(lot.quantity_remaining) || 0
    const cost = Number(lot.unit_cost) || 0
    if (qty <= 0) continue
    const cur = acc.get(lot.ingredient_id) ?? { stock: 0, costSum: 0 }
    cur.stock += qty
    cur.costSum += qty * cost
    acc.set(lot.ingredient_id, cur)
  }

  const warnings: string[] = []
  let knownTotal = 0
  let allKnown = true

  const lines: RecipeCOGSLine[] = recipeLines.map((line) => {
    const a = acc.get(line.ingredient_id)
    const avg = a && a.stock > 0 ? a.costSum / a.stock : null
    if (avg == null) {
      allKnown = false
      warnings.push(
        `${line.ingredient_name}: no available lots — cost unknown`
      )
    }
    const lineCost = avg != null ? line.quantity * avg : null
    if (lineCost != null) knownTotal += lineCost
    return {
      ingredient_id: line.ingredient_id,
      ingredient_name: line.ingredient_name,
      quantity: line.quantity,
      unit: line.unit,
      avg_unit_cost: avg,
      line_cost: lineCost,
      has_stock: avg != null,
    }
  })

  const perUnit =
    targetYield > 0 && allKnown ? knownTotal / targetYield : null

  return {
    estimated_cogs: knownTotal,
    cogs_per_unit: perUnit,
    lines,
    warnings,
    cost_known: allKnown,
  }
}

export interface MonthlyRunSummary {
  run_id: string
  run_number: string
  recipe_name: string
  total_cogs: number
  completed_at: string
}

export interface MonthlyCOGSResult {
  year: number
  month: number // 1-12
  total_cogs: number
  run_count: number
  breakdown: MonthlyRunSummary[]
}

export function aggregateMonthlyCOGS(
  runs: MonthlyRunSummary[],
  year: number,
  month: number
): MonthlyCOGSResult {
  const total = runs.reduce((s, r) => s + r.total_cogs, 0)
  return {
    year,
    month,
    total_cogs: total,
    run_count: runs.length,
    breakdown: runs,
  }
}

export interface YTDMonthBucket {
  month: number // 1-12
  total_cogs: number
  run_count: number
}

export interface YTDCOGSResult {
  year: number
  total_cogs: number
  run_count: number
  monthly: YTDMonthBucket[]
}

export function aggregateYTDCOGS(
  runs: Array<{ total_cogs: number; completed_at: string }>,
  year: number
): YTDCOGSResult {
  const buckets: YTDMonthBucket[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    total_cogs: 0,
    run_count: 0,
  }))
  let total = 0
  let count = 0
  for (const r of runs) {
    const d = new Date(r.completed_at)
    if (Number.isNaN(d.getTime())) continue
    if (d.getUTCFullYear() !== year) continue
    const m = d.getUTCMonth() // 0-11, UTC to match SQL UTC boundaries
    buckets[m].total_cogs += r.total_cogs
    buckets[m].run_count += 1
    total += r.total_cogs
    count += 1
  }
  return { year, total_cogs: total, run_count: count, monthly: buckets }
}

// ─── Data-access wrappers ────────────────────────────────────────────────────

export async function calculateRunCOGS(
  orgId: string,
  runId: string
): Promise<RunCOGSResult | null> {
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('production_runs')
    .select('actual_yield')
    .eq('org_id', orgId)
    .eq('id', runId)
    .maybeSingle()
  if (!run) return null

  const { data: rows } = await admin
    .from('production_run_lots')
    .select(
      'ingredient_id, lot_id, quantity_used, unit, unit_cost_at_use, lots(lot_number), ingredients(name)'
    )
    .eq('org_id', orgId)
    .eq('production_run_id', runId)

  const consumed: ConsumedLot[] = (rows ?? []).map((r) => {
    const lot = (r as unknown as { lots: { lot_number: string } | null }).lots
    const ing = (
      r as unknown as { ingredients: { name: string } | null }
    ).ingredients
    return {
      ingredient_id: r.ingredient_id,
      ingredient_name: ing?.name ?? 'Unknown',
      lot_id: r.lot_id,
      lot_number: lot?.lot_number ?? '',
      quantity_used: Number(r.quantity_used) || 0,
      unit: r.unit,
      unit_cost_at_use: Number(r.unit_cost_at_use) || 0,
    }
  })

  return computeRunCOGS(
    consumed,
    run.actual_yield != null ? Number(run.actual_yield) : null
  )
}

export async function calculateRecipeEstimatedCOGS(
  orgId: string,
  recipeId: string
): Promise<RecipeCOGSResult | null> {
  const admin = createAdminClient()

  const { data: recipe } = await admin
    .from('recipes')
    .select('target_yield')
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

  const recipeLines: RecipeLineInput[] = (lines ?? []).map((l) => {
    const ing = (
      l as unknown as { ingredients: { name: string; sku: string | null } | null }
    ).ingredients
    return {
      ingredient_id: l.ingredient_id,
      ingredient_name: ing?.name ?? 'Unknown',
      ingredient_sku: ing?.sku ?? null,
      quantity: Number(l.quantity) || 0,
      unit: l.unit,
    }
  })

  if (recipeLines.length === 0) {
    return {
      estimated_cogs: 0,
      cogs_per_unit: null,
      lines: [],
      warnings: ['Recipe has no ingredient lines'],
      cost_known: false,
    }
  }

  const ingredientIds = recipeLines.map((l) => l.ingredient_id)
  const { data: lots } = await admin
    .from('lots')
    .select('ingredient_id, quantity_remaining, unit_cost')
    .eq('org_id', orgId)
    .eq('status', 'available')
    .gt('quantity_remaining', 0)
    .in('ingredient_id', ingredientIds)

  const availableLots: AvailableLot[] = (lots ?? [])
    .filter((l): l is typeof l & { ingredient_id: string } => l.ingredient_id !== null)
    .map((l) => ({
      ingredient_id: l.ingredient_id,
      quantity_remaining: Number(l.quantity_remaining) || 0,
      unit_cost: Number(l.unit_cost) || 0,
    }))

  return computeRecipeEstimatedCOGS(
    recipeLines,
    availableLots,
    Number(recipe.target_yield) || 0
  )
}

export async function getMonthlyCOGS(
  orgId: string,
  year: number,
  month: number // 1-12
): Promise<MonthlyCOGSResult> {
  const admin = createAdminClient()

  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const end = new Date(Date.UTC(year, month, 1)).toISOString()

  const { data } = await admin
    .from('production_runs')
    .select('id, run_number, total_cogs, completed_at, recipes(name)')
    .eq('org_id', orgId)
    .eq('status', 'completed')
    .gte('completed_at', start)
    .lt('completed_at', end)
    .order('completed_at', { ascending: true })

  const runs: MonthlyRunSummary[] = (data ?? []).map((r) => {
    const recipe = (
      r as unknown as { recipes: { name: string } | null }
    ).recipes
    return {
      run_id: r.id,
      run_number: r.run_number,
      recipe_name: recipe?.name ?? 'Unknown',
      total_cogs: r.total_cogs != null ? Number(r.total_cogs) : 0,
      completed_at: r.completed_at ?? '',
    }
  })

  return aggregateMonthlyCOGS(runs, year, month)
}

export async function getYTDCOGS(
  orgId: string,
  year: number
): Promise<YTDCOGSResult> {
  const admin = createAdminClient()

  const start = new Date(Date.UTC(year, 0, 1)).toISOString()
  const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString()

  const { data } = await admin
    .from('production_runs')
    .select('total_cogs, completed_at')
    .eq('org_id', orgId)
    .eq('status', 'completed')
    .gte('completed_at', start)
    .lt('completed_at', end)

  const rows = (data ?? []).map((r) => ({
    total_cogs: r.total_cogs != null ? Number(r.total_cogs) : 0,
    completed_at: r.completed_at ?? '',
  }))

  return aggregateYTDCOGS(rows, year)
}
