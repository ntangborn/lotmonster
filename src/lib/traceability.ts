/**
 * Traceability — bidirectional genealogy across lots, production runs,
 * and sales orders. Critical for food-safety recalls and customer
 * audits.
 *
 * Forward (LOT → CUSTOMER):
 *   Given an ingredient lot number, find every production run that
 *   consumed it, then every sales order whose lot_numbers_allocated
 *   includes any of those runs (or the lot itself).
 *
 * Reverse (CUSTOMER → SUPPLIER):
 *   Given a sales order, walk lot_numbers_allocated (which can hold
 *   either PR-* run numbers OR ingredient lot numbers) → resolve to
 *   production runs → resolve to consumed ingredient lots → resolve
 *   to suppliers (PO records).
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Common shapes ───────────────────────────────────────────────────────────

export interface RunRef {
  id: string
  run_number: string
  status: string
  recipe_id: string
  recipe_name: string
  started_at: string | null
  completed_at: string | null
}

export interface LotRef {
  id: string
  lot_number: string
  ingredient_id: string
  ingredient_name: string
  ingredient_sku: string | null
  supplier: string | null
  po_number: string | null
  received_date: string | null
  expiry_date: string | null
  unit: string
}

export interface SORef {
  id: string
  order_number: string
  customer_name: string
  customer_email: string | null
  status: string
  shipped_at: string | null
  recipe_id: string
  recipe_name: string
  qty: number
  unit: string
  // The exact reference in lot_numbers_allocated that matched
  matched_via: string
}

// ─── Forward trace: lot → customer ───────────────────────────────────────────

export interface ForwardTraceResult {
  query: string
  lot: LotRef | null
  // Runs that consumed this lot
  consumed_in_runs: Array<RunRef & { quantity_used: number; unit: string }>
  // SO lines whose lot_numbers_allocated contains this lot OR a run that used this lot
  shipped_in: SORef[]
}

export async function traceForward(
  orgId: string,
  lotNumber: string
): Promise<ForwardTraceResult> {
  const admin = createAdminClient()
  const trimmed = lotNumber.trim()

  const { data: lot } = await admin
    .from('lots')
    .select(
      'id, lot_number, ingredient_id, unit, received_date, expiry_date, po_id, ingredients(name, sku), purchase_orders(po_number, supplier)'
    )
    .eq('org_id', orgId)
    .eq('lot_number', trimmed)
    .maybeSingle()

  if (!lot) {
    return {
      query: trimmed,
      lot: null,
      consumed_in_runs: [],
      shipped_in: [],
    }
  }

  const ing = (lot as unknown as { ingredients: { name: string; sku: string | null } | null }).ingredients
  const po = (lot as unknown as { purchase_orders: { po_number: string; supplier: string } | null }).purchase_orders
  const lotRef: LotRef = {
    id: lot.id,
    lot_number: lot.lot_number,
    ingredient_id: lot.ingredient_id,
    ingredient_name: ing?.name ?? 'Unknown',
    ingredient_sku: ing?.sku ?? null,
    supplier: po?.supplier ?? null,
    po_number: po?.po_number ?? null,
    received_date: lot.received_date,
    expiry_date: lot.expiry_date,
    unit: lot.unit,
  }

  // Runs that consumed this lot
  const { data: runLots } = await admin
    .from('production_run_lots')
    .select(
      'production_run_id, quantity_used, unit, production_runs(id, run_number, status, recipe_id, started_at, completed_at, recipes(name))'
    )
    .eq('org_id', orgId)
    .eq('lot_id', lot.id)

  const runs: ForwardTraceResult['consumed_in_runs'] = (runLots ?? [])
    .map((r) => {
      const run = (
        r as unknown as {
          production_runs: {
            id: string
            run_number: string
            status: string
            recipe_id: string
            started_at: string | null
            completed_at: string | null
            recipes: { name: string } | null
          } | null
        }
      ).production_runs
      if (!run) return null
      return {
        id: run.id,
        run_number: run.run_number,
        status: run.status,
        recipe_id: run.recipe_id,
        recipe_name: run.recipes?.name ?? 'Unknown',
        started_at: run.started_at,
        completed_at: run.completed_at,
        quantity_used: Number(r.quantity_used) || 0,
        unit: r.unit,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  // Build the search keys: this lot's number AND every run number that consumed it
  const refs = new Set<string>([lotRef.lot_number, ...runs.map((r) => r.run_number)])

  const shipped = await findSOLinesContainingAny(orgId, Array.from(refs))

  return {
    query: trimmed,
    lot: lotRef,
    consumed_in_runs: runs,
    shipped_in: shipped,
  }
}

// ─── Reverse trace: SO → supplier ────────────────────────────────────────────

export interface ReverseLineTrace {
  line_id: string
  recipe_id: string
  recipe_name: string
  qty: number
  unit: string
  // Each lot_numbers_allocated entry, resolved to whatever it maps to
  refs: Array<{
    raw: string
    resolved_run: RunRef | null
    resolved_lot: LotRef | null
    // If this ref matched a run, the ingredient lots that run consumed
    consumed_lots: LotRef[]
  }>
}

export interface ReverseTraceResult {
  query: string
  so: {
    id: string
    order_number: string
    customer_name: string
    customer_email: string | null
    status: string
    shipped_at: string | null
    created_at: string
  } | null
  lines: ReverseLineTrace[]
  // Aggregated unique sets across all lines (handy for the UI summary)
  all_runs: RunRef[]
  all_lots: LotRef[]
  all_suppliers: string[]
}

export async function traceReverse(
  orgId: string,
  orderNumberOrId: string
): Promise<ReverseTraceResult> {
  const admin = createAdminClient()
  const q = orderNumberOrId.trim()

  // Try by id first, then by order_number
  let { data: so } = await admin
    .from('sales_orders')
    .select('id, order_number, customer_name, customer_email, status, shipped_at, created_at')
    .eq('org_id', orgId)
    .eq('id', q)
    .maybeSingle()
  if (!so) {
    const r = await admin
      .from('sales_orders')
      .select('id, order_number, customer_name, customer_email, status, shipped_at, created_at')
      .eq('org_id', orgId)
      .eq('order_number', q)
      .maybeSingle()
    so = r.data ?? null
  }

  if (!so) {
    return {
      query: q,
      so: null,
      lines: [],
      all_runs: [],
      all_lots: [],
      all_suppliers: [],
    }
  }

  const { data: lines } = await admin
    .from('sales_order_lines')
    .select(
      'id, recipe_id, quantity, unit, lot_numbers_allocated, recipes(name)'
    )
    .eq('org_id', orgId)
    .eq('sales_order_id', so.id)
    .order('created_at', { ascending: true })

  // Collect all unique refs across all lines for batched lookups
  const allRefs = new Set<string>()
  for (const l of lines ?? []) {
    for (const r of (l.lot_numbers_allocated ?? []) as string[]) {
      const t = r?.trim()
      if (t) allRefs.add(t)
    }
  }

  const runByNumber = new Map<string, RunRef>()
  const lotByNumber = new Map<string, LotRef>()
  const consumedByRun = new Map<string, LotRef[]>()

  if (allRefs.size > 0) {
    const refList = Array.from(allRefs)

    const { data: runs } = await admin
      .from('production_runs')
      .select(
        'id, run_number, status, recipe_id, started_at, completed_at, recipes(name)'
      )
      .eq('org_id', orgId)
      .in('run_number', refList)

    for (const r of runs ?? []) {
      const recipe = (
        r as unknown as { recipes: { name: string } | null }
      ).recipes
      runByNumber.set(r.run_number, {
        id: r.id,
        run_number: r.run_number,
        status: r.status,
        recipe_id: r.recipe_id,
        recipe_name: recipe?.name ?? 'Unknown',
        started_at: r.started_at,
        completed_at: r.completed_at,
      })
    }

    const { data: directLots } = await admin
      .from('lots')
      .select(
        'id, lot_number, ingredient_id, unit, received_date, expiry_date, ingredients(name, sku), purchase_orders(po_number, supplier)'
      )
      .eq('org_id', orgId)
      .in('lot_number', refList)

    for (const l of directLots ?? []) {
      const ing = (
        l as unknown as { ingredients: { name: string; sku: string | null } | null }
      ).ingredients
      const po = (
        l as unknown as { purchase_orders: { po_number: string; supplier: string } | null }
      ).purchase_orders
      lotByNumber.set(l.lot_number, {
        id: l.id,
        lot_number: l.lot_number,
        ingredient_id: l.ingredient_id,
        ingredient_name: ing?.name ?? 'Unknown',
        ingredient_sku: ing?.sku ?? null,
        supplier: po?.supplier ?? null,
        po_number: po?.po_number ?? null,
        received_date: l.received_date,
        expiry_date: l.expiry_date,
        unit: l.unit,
      })
    }

    // For each matched run, look up the lots it consumed
    if (runByNumber.size > 0) {
      const runIds = Array.from(runByNumber.values()).map((r) => r.id)
      const { data: runLots } = await admin
        .from('production_run_lots')
        .select(
          'production_run_id, lot_id, lots(id, lot_number, ingredient_id, unit, received_date, expiry_date, ingredients(name, sku), purchase_orders(po_number, supplier))'
        )
        .eq('org_id', orgId)
        .in('production_run_id', runIds)

      for (const rl of runLots ?? []) {
        const lot = (
          rl as unknown as {
            lots: {
              id: string
              lot_number: string
              ingredient_id: string
              unit: string
              received_date: string | null
              expiry_date: string | null
              ingredients: { name: string; sku: string | null } | null
              purchase_orders: { po_number: string; supplier: string } | null
            } | null
          }
        ).lots
        if (!lot) continue
        const lotRef: LotRef = {
          id: lot.id,
          lot_number: lot.lot_number,
          ingredient_id: lot.ingredient_id,
          ingredient_name: lot.ingredients?.name ?? 'Unknown',
          ingredient_sku: lot.ingredients?.sku ?? null,
          supplier: lot.purchase_orders?.supplier ?? null,
          po_number: lot.purchase_orders?.po_number ?? null,
          received_date: lot.received_date,
          expiry_date: lot.expiry_date,
          unit: lot.unit,
        }
        const arr = consumedByRun.get(rl.production_run_id) ?? []
        if (!arr.find((x) => x.id === lot.id)) arr.push(lotRef)
        consumedByRun.set(rl.production_run_id, arr)
      }
    }
  }

  const linesOut: ReverseLineTrace[] = (lines ?? []).map((l) => {
    const recipe = (
      l as unknown as { recipes: { name: string } | null }
    ).recipes
    const refs = ((l.lot_numbers_allocated ?? []) as string[]).map((raw) => {
      const t = raw.trim()
      const run = runByNumber.get(t) ?? null
      const lot = lotByNumber.get(t) ?? null
      const consumed = run ? (consumedByRun.get(run.id) ?? []) : []
      return { raw: t, resolved_run: run, resolved_lot: lot, consumed_lots: consumed }
    })
    return {
      line_id: l.id,
      recipe_id: l.recipe_id,
      recipe_name: recipe?.name ?? 'Unknown',
      qty: Number(l.quantity) || 0,
      unit: l.unit,
      refs,
    }
  })

  // Aggregated sets
  const runsSet = new Map<string, RunRef>()
  const lotsSet = new Map<string, LotRef>()
  const suppliersSet = new Set<string>()
  for (const line of linesOut) {
    for (const ref of line.refs) {
      if (ref.resolved_run) runsSet.set(ref.resolved_run.id, ref.resolved_run)
      if (ref.resolved_lot) {
        lotsSet.set(ref.resolved_lot.id, ref.resolved_lot)
        if (ref.resolved_lot.supplier) suppliersSet.add(ref.resolved_lot.supplier)
      }
      for (const cl of ref.consumed_lots) {
        lotsSet.set(cl.id, cl)
        if (cl.supplier) suppliersSet.add(cl.supplier)
      }
    }
  }

  return {
    query: q,
    so,
    lines: linesOut,
    all_runs: Array.from(runsSet.values()),
    all_lots: Array.from(lotsSet.values()),
    all_suppliers: Array.from(suppliersSet).sort(),
  }
}

// ─── Run trace: search by run number ─────────────────────────────────────────

export interface RunTraceResult {
  query: string
  run: RunRef | null
  consumed_lots: Array<LotRef & { quantity_used: number; unit: string }>
  shipped_in: SORef[]
}

export async function traceRun(
  orgId: string,
  runNumber: string
): Promise<RunTraceResult> {
  const admin = createAdminClient()
  const q = runNumber.trim()

  const { data: run } = await admin
    .from('production_runs')
    .select(
      'id, run_number, status, recipe_id, started_at, completed_at, recipes(name)'
    )
    .eq('org_id', orgId)
    .eq('run_number', q)
    .maybeSingle()

  if (!run) {
    return { query: q, run: null, consumed_lots: [], shipped_in: [] }
  }

  const recipe = (run as unknown as { recipes: { name: string } | null }).recipes
  const runRef: RunRef = {
    id: run.id,
    run_number: run.run_number,
    status: run.status,
    recipe_id: run.recipe_id,
    recipe_name: recipe?.name ?? 'Unknown',
    started_at: run.started_at,
    completed_at: run.completed_at,
  }

  const { data: rls } = await admin
    .from('production_run_lots')
    .select(
      'lot_id, quantity_used, unit, lots(id, lot_number, ingredient_id, unit, received_date, expiry_date, ingredients(name, sku), purchase_orders(po_number, supplier))'
    )
    .eq('org_id', orgId)
    .eq('production_run_id', run.id)

  const consumed: RunTraceResult['consumed_lots'] = (rls ?? [])
    .map((rl) => {
      const lot = (
        rl as unknown as {
          lots: {
            id: string
            lot_number: string
            ingredient_id: string
            unit: string
            received_date: string | null
            expiry_date: string | null
            ingredients: { name: string; sku: string | null } | null
            purchase_orders: { po_number: string; supplier: string } | null
          } | null
        }
      ).lots
      if (!lot) return null
      return {
        id: lot.id,
        lot_number: lot.lot_number,
        ingredient_id: lot.ingredient_id,
        ingredient_name: lot.ingredients?.name ?? 'Unknown',
        ingredient_sku: lot.ingredients?.sku ?? null,
        supplier: lot.purchase_orders?.supplier ?? null,
        po_number: lot.purchase_orders?.po_number ?? null,
        received_date: lot.received_date,
        expiry_date: lot.expiry_date,
        unit: lot.unit,
        quantity_used: Number(rl.quantity_used) || 0,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const refs = new Set<string>([runRef.run_number, ...consumed.map((c) => c.lot_number)])
  const shipped = await findSOLinesContainingAny(orgId, Array.from(refs))

  return { query: q, run: runRef, consumed_lots: consumed, shipped_in: shipped }
}

// ─── Auto-suggest production runs to fulfill a sales order ───────────────────

export interface RunSuggestion {
  run_id: string
  run_number: string
  recipe_id: string
  status: string
  actual_yield: number | null
  yield_unit: string | null
  completed_at: string | null
}

export async function suggestRunsForOrderLine(
  orgId: string,
  recipeId: string,
  limit = 10
): Promise<RunSuggestion[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('production_runs')
    .select('id, run_number, recipe_id, status, actual_yield, yield_unit, completed_at')
    .eq('org_id', orgId)
    .eq('recipe_id', recipeId)
    .in('status', ['completed', 'in_progress'])
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((r) => ({
    run_id: r.id,
    run_number: r.run_number,
    recipe_id: r.recipe_id,
    status: r.status,
    actual_yield: r.actual_yield != null ? Number(r.actual_yield) : null,
    yield_unit: r.yield_unit,
    completed_at: r.completed_at,
  }))
}

// ─── Helper: find SO lines whose lot_numbers_allocated contains any of refs ──

async function findSOLinesContainingAny(
  orgId: string,
  refs: string[]
): Promise<SORef[]> {
  if (refs.length === 0) return []
  const admin = createAdminClient()

  // Postgres: lot_numbers_allocated && array['ref1','ref2',...] tests overlap.
  // Supabase JS PostgREST equivalent: .overlaps(). We must pass a TEXT[] literal.
  const arrayLiteral = `{${refs
    .map((r) => `"${r.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',')}}`

  const { data: lines } = await admin
    .from('sales_order_lines')
    .select(
      'id, sales_order_id, recipe_id, quantity, unit, lot_numbers_allocated, recipes(name), sales_orders(id, order_number, customer_name, customer_email, status, shipped_at)'
    )
    .eq('org_id', orgId)
    .overlaps('lot_numbers_allocated', arrayLiteral)

  const refSet = new Set(refs)
  const out: SORef[] = []
  for (const l of lines ?? []) {
    const so = (
      l as unknown as {
        sales_orders: {
          id: string
          order_number: string
          customer_name: string
          customer_email: string | null
          status: string
          shipped_at: string | null
        } | null
      }
    ).sales_orders
    if (!so) continue
    const recipe = (
      l as unknown as { recipes: { name: string } | null }
    ).recipes
    const matched =
      ((l.lot_numbers_allocated ?? []) as string[]).find((x) =>
        refSet.has(x.trim())
      ) ?? ''
    out.push({
      id: so.id,
      order_number: so.order_number,
      customer_name: so.customer_name,
      customer_email: so.customer_email,
      status: so.status,
      shipped_at: so.shipped_at,
      recipe_id: l.recipe_id,
      recipe_name: recipe?.name ?? 'Unknown',
      qty: Number(l.quantity) || 0,
      unit: l.unit,
      matched_via: matched,
    })
  }
  return out
}
