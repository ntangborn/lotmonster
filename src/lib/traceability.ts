/**
 * Traceability — bidirectional genealogy across lots, production runs,
 * and sales orders. Critical for food-safety recalls and customer
 * audits.
 *
 * Lots are polymorphic (post migration 007): a lot is either RAW
 * (ingredient_id set) or FINISHED-GOODS (sku_id + production_run_id
 * set). The forward/reverse/run traces all handle both.
 *
 * Forward (RAW or FINISHED lot → customer):
 *   - raw lot → runs that consumed it → finished lots those runs produced
 *     → sales orders that shipped those finished lots.
 *   - finished lot → sales orders that shipped it.
 *
 * Reverse (customer → supplier):
 *   SO line `lot_numbers_allocated` entries resolve to finished lots
 *   (new system), or run numbers / raw lot numbers (legacy). For each
 *   resolved finished lot we also walk to its production_run_id and
 *   surface the raw lots that run consumed, so a recall from a
 *   customer order follows the full chain back to suppliers.
 *
 * Run (middle-out):
 *   run → consumed ingredient lots (raw + packaging) + produced
 *   finished-goods lots + downstream sales orders.
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
  /** 'raw' = ingredient_id set; 'finished' = sku_id + production_run_id set. */
  kind: 'raw' | 'finished'
  // Raw-lot fields (null for finished).
  ingredient_id: string | null
  ingredient_name: string
  ingredient_sku: string | null
  supplier: string | null
  po_number: string | null
  // Finished-goods fields (null for raw).
  sku_id: string | null
  sku_name: string | null
  production_run_id: string | null
  production_run_number: string | null
  // Common.
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
  recipe_id: string | null
  recipe_name: string
  qty: number
  unit: string
  // The exact reference in lot_numbers_allocated that matched.
  matched_via: string
}

interface LotJoinRow {
  id: string
  lot_number: string
  ingredient_id: string | null
  sku_id: string | null
  production_run_id: string | null
  unit: string
  received_date: string | null
  expiry_date: string | null
  ingredients?: { name: string; sku: string | null } | null
  skus?: { name: string } | null
  purchase_orders?: { po_number: string; supplier: string } | null
  production_runs?: { run_number: string } | null
}

function toLotRef(row: LotJoinRow): LotRef {
  const kind: 'raw' | 'finished' = row.sku_id ? 'finished' : 'raw'
  const ing = row.ingredients ?? null
  const sku = row.skus ?? null
  const po = row.purchase_orders ?? null
  const run = row.production_runs ?? null
  return {
    id: row.id,
    lot_number: row.lot_number,
    kind,
    ingredient_id: row.ingredient_id,
    ingredient_name: ing?.name ?? (kind === 'finished' ? '' : 'Unknown'),
    ingredient_sku: ing?.sku ?? null,
    supplier: po?.supplier ?? null,
    po_number: po?.po_number ?? null,
    sku_id: row.sku_id,
    sku_name: sku?.name ?? null,
    production_run_id: row.production_run_id,
    production_run_number: run?.run_number ?? null,
    received_date: row.received_date,
    expiry_date: row.expiry_date,
    unit: row.unit,
  }
}

const LOT_SELECT =
  'id, lot_number, ingredient_id, sku_id, production_run_id, unit, received_date, expiry_date, ' +
  'ingredients(name, sku), skus(name), purchase_orders(po_number, supplier), production_runs(run_number)'

// ─── Forward trace: lot → customer ───────────────────────────────────────────

export interface ForwardTraceResult {
  query: string
  lot: LotRef | null
  /** Raw-lot query: runs that consumed this raw lot. Empty for finished-lot query. */
  consumed_in_runs: Array<RunRef & { quantity_used: number; unit: string }>
  /** Finished-goods lots downstream of this query.
   *   - raw-lot query: finished lots produced by the runs that consumed it.
   *   - finished-lot query: [this lot] itself (for UI continuity).
   */
  produced_finished_lots: LotRef[]
  /** SOs whose lot_numbers_allocated contains the lot or any downstream ref. */
  shipped_in: SORef[]
}

export async function traceForward(
  orgId: string,
  lotNumber: string
): Promise<ForwardTraceResult> {
  const admin = createAdminClient()
  const trimmed = lotNumber.trim()

  const { data: lotRow } = await admin
    .from('lots')
    .select(LOT_SELECT)
    .eq('org_id', orgId)
    .eq('lot_number', trimmed)
    .maybeSingle()

  if (!lotRow) {
    return {
      query: trimmed,
      lot: null,
      consumed_in_runs: [],
      produced_finished_lots: [],
      shipped_in: [],
    }
  }

  const lotRef = toLotRef(lotRow as unknown as LotJoinRow)

  // Finished-lot query: forward chain = this lot → SOs.
  if (lotRef.kind === 'finished') {
    const refs = new Set<string>([lotRef.lot_number])
    // Legacy bridge: some SOs may have the run number in lot_numbers_allocated.
    if (lotRef.production_run_number) refs.add(lotRef.production_run_number)
    const shipped = await findSOLinesContainingAny(orgId, Array.from(refs))
    return {
      query: trimmed,
      lot: lotRef,
      consumed_in_runs: [],
      produced_finished_lots: [lotRef],
      shipped_in: shipped,
    }
  }

  // Raw-lot query: find runs that consumed it.
  const { data: runLots } = await admin
    .from('production_run_lots')
    .select(
      'production_run_id, quantity_used, unit, production_runs(id, run_number, status, recipe_id, started_at, completed_at, recipes(name))'
    )
    .eq('org_id', orgId)
    .eq('lot_id', lotRef.id)

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

  // For every run, find the finished-goods lots it produced.
  let produced: LotRef[] = []
  if (runs.length > 0) {
    const runIds = runs.map((r) => r.id)
    const { data: finished } = await admin
      .from('lots')
      .select(LOT_SELECT)
      .eq('org_id', orgId)
      .in('production_run_id', runIds)
      .not('sku_id', 'is', null)
    produced = (finished ?? []).map((row) =>
      toLotRef(row as unknown as LotJoinRow)
    )
  }

  // Build shipped-in search keys:
  //   - this raw lot's number (pre-007 SOs might reference it)
  //   - the run numbers that consumed it (legacy bridge)
  //   - every finished lot number the runs produced (new system)
  const refs = new Set<string>([lotRef.lot_number])
  for (const r of runs) refs.add(r.run_number)
  for (const p of produced) refs.add(p.lot_number)
  const shipped = await findSOLinesContainingAny(orgId, Array.from(refs))

  return {
    query: trimmed,
    lot: lotRef,
    consumed_in_runs: runs,
    produced_finished_lots: produced,
    shipped_in: shipped,
  }
}

// ─── Reverse trace: SO → supplier ────────────────────────────────────────────

export interface ReverseLineTrace {
  line_id: string
  recipe_id: string | null
  recipe_name: string
  qty: number
  unit: string
  refs: Array<{
    raw: string
    resolved_run: RunRef | null
    resolved_lot: LotRef | null
    /** If the ref matched a run (or a finished lot whose production_run_id resolves),
     *  the raw ingredient lots that run consumed. */
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

  let { data: so } = await admin
    .from('sales_orders')
    .select(
      'id, order_number, customer_name, customer_email, status, shipped_at, created_at'
    )
    .eq('org_id', orgId)
    .eq('id', q)
    .maybeSingle()
  if (!so) {
    const r = await admin
      .from('sales_orders')
      .select(
        'id, order_number, customer_name, customer_email, status, shipped_at, created_at'
      )
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
      .select(LOT_SELECT)
      .eq('org_id', orgId)
      .in('lot_number', refList)

    for (const l of directLots ?? []) {
      const ref = toLotRef(l as unknown as LotJoinRow)
      lotByNumber.set(ref.lot_number, ref)
    }

    // Run IDs we need upstream-consumption for = every run matched
    // directly PLUS every finished lot's parent run.
    const runIdsNeedingConsumption = new Set<string>()
    for (const r of runByNumber.values()) runIdsNeedingConsumption.add(r.id)
    for (const l of lotByNumber.values()) {
      if (l.kind === 'finished' && l.production_run_id) {
        runIdsNeedingConsumption.add(l.production_run_id)
      }
    }

    if (runIdsNeedingConsumption.size > 0) {
      const { data: runLots } = await admin
        .from('production_run_lots')
        .select(
          `production_run_id, lot_id, lots(${LOT_SELECT})`
        )
        .eq('org_id', orgId)
        .in('production_run_id', Array.from(runIdsNeedingConsumption))

      for (const rl of runLots ?? []) {
        const lot = (
          rl as unknown as { lots: LotJoinRow | null }
        ).lots
        if (!lot) continue
        const lotRef = toLotRef(lot)
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
      let consumed: LotRef[] = []
      if (run) {
        consumed = consumedByRun.get(run.id) ?? []
      } else if (lot?.kind === 'finished' && lot.production_run_id) {
        consumed = consumedByRun.get(lot.production_run_id) ?? []
      }
      return {
        raw: t,
        resolved_run: run,
        resolved_lot: lot,
        consumed_lots: consumed,
      }
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

  const runsSet = new Map<string, RunRef>()
  const lotsSet = new Map<string, LotRef>()
  const suppliersSet = new Set<string>()
  for (const line of linesOut) {
    for (const ref of line.refs) {
      if (ref.resolved_run) runsSet.set(ref.resolved_run.id, ref.resolved_run)
      if (ref.resolved_lot) {
        lotsSet.set(ref.resolved_lot.id, ref.resolved_lot)
        if (ref.resolved_lot.supplier)
          suppliersSet.add(ref.resolved_lot.supplier)
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

// ─── Run trace: run → consumed + produced + downstream ───────────────────────

export interface RunTraceResult {
  query: string
  run: RunRef | null
  /** Lots consumed by the run (raw ingredients + packaging). */
  consumed_lots: Array<LotRef & { quantity_used: number; unit: string }>
  /** Finished-goods lots this run produced. */
  produced_finished_lots: LotRef[]
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
    return {
      query: q,
      run: null,
      consumed_lots: [],
      produced_finished_lots: [],
      shipped_in: [],
    }
  }

  const recipe = (run as unknown as { recipes: { name: string } | null })
    .recipes
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
      `lot_id, quantity_used, unit, lots(${LOT_SELECT})`
    )
    .eq('org_id', orgId)
    .eq('production_run_id', run.id)

  const consumed: RunTraceResult['consumed_lots'] = (rls ?? [])
    .map((rl) => {
      const lot = (rl as unknown as { lots: LotJoinRow | null }).lots
      if (!lot) return null
      const ref = toLotRef(lot)
      return {
        ...ref,
        quantity_used: Number(rl.quantity_used) || 0,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const { data: finished } = await admin
    .from('lots')
    .select(LOT_SELECT)
    .eq('org_id', orgId)
    .eq('production_run_id', run.id)
    .not('sku_id', 'is', null)

  const produced: LotRef[] = (finished ?? []).map((row) =>
    toLotRef(row as unknown as LotJoinRow)
  )

  const refs = new Set<string>([runRef.run_number])
  for (const c of consumed) refs.add(c.lot_number)
  for (const p of produced) refs.add(p.lot_number)
  const shipped = await findSOLinesContainingAny(orgId, Array.from(refs))

  return {
    query: q,
    run: runRef,
    consumed_lots: consumed,
    produced_finished_lots: produced,
    shipped_in: shipped,
  }
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
    .select(
      'id, run_number, recipe_id, status, actual_yield, yield_unit, completed_at'
    )
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
