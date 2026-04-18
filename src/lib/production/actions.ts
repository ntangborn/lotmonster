import { createAdminClient } from '@/lib/supabase/admin'
import {
  allocateLots,
  previewAllocation,
  InsufficientStockError,
} from '@/lib/fefo'
import { buildLotPrefix } from '@/lib/skus/schema'
import {
  planCompleteRun,
  RunStateError,
  type CompleteRunOutput,
  type ResolvedBom,
  type ResolvedOutput,
} from './complete-run-math'
import type { Database } from '@/types/database'

type LotRow = Database['public']['Tables']['lots']['Row']

// Re-export for existing consumers (API routes that do `import { RunStateError } from '@/lib/production/actions'`).
export { RunStateError }
export type { CompleteRunOutput }

/**
 * Allocate ingredients via FEFO and decrement lot quantities for an
 * in-progress / planned run. Inserts production_run_lots, decrements
 * lot quantity_remaining, and marks newly-depleted lots.
 *
 * Best-effort atomicity: writes happen sequentially via the admin
 * client. Consumed allocations are tracked so we can attempt rollback
 * if a mid-run write fails. Real ACID guarantees should come from a
 * Postgres function (rpc) — TODO when traffic warrants it.
 */
export async function startRun(orgId: string, runId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('production_runs')
    .select('*, recipes(id, target_yield)')
    .eq('org_id', orgId)
    .eq('id', runId)
    .maybeSingle()
  if (!run) throw new RunStateError('Run not found')
  if (run.status !== 'planned') {
    throw new RunStateError(`Cannot start a run in state "${run.status}"`)
  }

  const { data: lines } = await admin
    .from('recipe_lines')
    .select('ingredient_id, quantity, unit')
    .eq('org_id', orgId)
    .eq('recipe_id', run.recipe_id)
  if (!lines || lines.length === 0) {
    throw new RunStateError('Recipe has no ingredients')
  }

  const multiplier = Number(run.batch_multiplier) || 1
  const consumed: Array<{ lotId: string; quantity: number }> = []

  try {
    for (const line of lines) {
      const need = Number(line.quantity) * multiplier
      const allocations = await allocateLots(
        { kind: 'ingredient', id: line.ingredient_id },
        need,
        orgId
      )

      for (const a of allocations) {
        const { data: lot } = await admin
          .from('lots')
          .select('quantity_remaining')
          .eq('id', a.lotId)
          .maybeSingle()
        if (!lot) throw new RunStateError(`Lot ${a.lotId} disappeared`)

        const before = Number(lot.quantity_remaining)
        if (before < a.quantityUsed) {
          throw new InsufficientStockError(a.quantityUsed, before)
        }
        const remaining = before - a.quantityUsed
        const update: Database['public']['Tables']['lots']['Update'] = {
          quantity_remaining: remaining,
        }
        if (remaining <= 0) update.status = 'depleted'
        const { error: updErr } = await admin
          .from('lots')
          .update(update)
          .eq('id', a.lotId)
        if (updErr) throw new Error(updErr.message)

        consumed.push({ lotId: a.lotId, quantity: a.quantityUsed })

        const { error: insErr } = await admin
          .from('production_run_lots')
          .insert({
            org_id: orgId,
            production_run_id: runId,
            lot_id: a.lotId,
            ingredient_id: line.ingredient_id,
            quantity_used: a.quantityUsed,
            unit: line.unit,
            unit_cost_at_use: a.unitCost,
            line_cost: a.quantityUsed * a.unitCost,
          })
        if (insErr) throw new Error(insErr.message)
      }
    }

    const recipe = (
      run as unknown as { recipes: { target_yield: number } | null }
    ).recipes
    const expectedYield =
      recipe ? Number(recipe.target_yield) * multiplier : null

    const { error: runUpdErr } = await admin
      .from('production_runs')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        expected_yield: expectedYield,
      })
      .eq('id', runId)
    if (runUpdErr) throw new Error(runUpdErr.message)
  } catch (e) {
    await rollbackConsumption(orgId, runId, consumed)
    throw e
  }
}

async function rollbackConsumption(
  orgId: string,
  runId: string,
  consumed: Array<{ lotId: string; quantity: number }>
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('production_run_lots')
    .delete()
    .eq('org_id', orgId)
    .eq('production_run_id', runId)

  for (const c of consumed) {
    const { data: lot } = await admin
      .from('lots')
      .select('quantity_remaining, status')
      .eq('id', c.lotId)
      .maybeSingle()
    if (!lot) continue
    const restored = Number(lot.quantity_remaining) + c.quantity
    const update: Database['public']['Tables']['lots']['Update'] = {
      quantity_remaining: restored,
    }
    if (lot.status === 'depleted' && restored > 0) update.status = 'available'
    await admin.from('lots').update(update).eq('id', c.lotId)
  }
}

interface WriteTracker {
  packagingConsumed: Array<{ lotId: string; quantity: number }>
  packagingRunLotIds: string[]
  finishedLotIds: string[]
  outputIds: string[]
}

function today(): Date {
  return new Date()
}

function todayStamp(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function addDaysISO(d: Date, days: number): string {
  const next = new Date(d.getTime())
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

async function nextLotNumber(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  prefix: string,
  datePart: string
): Promise<string> {
  const base = `${prefix}-${datePart}`
  for (let n = 1; n <= 999; n++) {
    const candidate = `${base}-${String(n).padStart(3, '0')}`
    const { data } = await admin
      .from('lots')
      .select('id')
      .eq('org_id', orgId)
      .eq('lot_number', candidate)
      .maybeSingle()
    if (!data) return candidate
  }
  throw new Error(
    `Could not generate unique lot number under base "${base}" after 999 attempts`
  )
}

/**
 * Complete a production run.
 *
 * Implements the phase-1 spec in
 * docs/plans/2026-04-16-skus-and-finished-goods.md (Q4/Q8/Q10):
 *
 *   1. Validate run is in_progress + all SKUs belong to this org and are
 *      unit-kind SKUs with a fill_quantity declared.
 *   2. Read liquid_total from raw production_run_lots already written at
 *      startRun.
 *   3. Allocate liquid COGS by volume share (fill_quantity × quantity),
 *      or honor per-SKU liquidPctOverride if provided (must sum to 1).
 *   4. FEFO-allocate packaging for each output SKU's sku_packaging BOM
 *      against ingredient lots where kind='packaging'. Throws
 *      InsufficientStockError naming SKU + component on shortfall.
 *   5. Compute unit_cogs per SKU = allocated_cogs_total / quantity.
 *   6. Auto-generate lot_number = {PREFIX}-{YYYYMMDD}-{NNN}, insert
 *      finished-goods lots (ingredient_id NULL, sku_id SET), insert
 *      production_run_outputs (one per output SKU).
 *   7. Invariant: sum(production_run_outputs.allocated_cogs_total)
 *      must equal run.total_cogs within ±$0.01, throw on mismatch.
 *   8. Write qbo_sync_log journal_entry row.
 *
 * cost_per_unit is set only for single-SKU runs; multi-SKU sets it to
 * null (the column is deprecated once more than one output exists).
 *
 * Best-effort atomicity: mid-flight failures roll back inserted finished
 * lots, inserted production_run_outputs, and packaging consumption
 * written during this call. Raw consumption from startRun is preserved.
 */
export async function completeRun(
  orgId: string,
  runId: string,
  outputs: CompleteRunOutput[],
  notes: string | null
): Promise<void> {
  const admin = createAdminClient()

  if (outputs.length === 0) {
    throw new RunStateError('At least one output SKU is required')
  }

  // ── 1. Validate run exists + is in_progress ────────────────────────
  const { data: run } = await admin
    .from('production_runs')
    .select('id, status, expected_yield, recipe_id, yield_unit')
    .eq('org_id', orgId)
    .eq('id', runId)
    .maybeSingle()
  if (!run) throw new RunStateError('Run not found')
  if (run.status !== 'in_progress') {
    throw new RunStateError(`Cannot complete a run in state "${run.status}"`)
  }

  // ── 2. Fetch SKUs (verify they belong to this org) ─────────────────
  const skuIds = outputs.map((o) => o.skuId)
  const { data: skuRows } = await admin
    .from('skus')
    .select(
      'id, name, kind, fill_quantity, fill_unit, shelf_life_days, lot_prefix, org_id'
    )
    .eq('org_id', orgId)
    .in('id', skuIds)
  const skuById = new Map((skuRows ?? []).map((s) => [s.id, s]))
  for (const o of outputs) {
    if (!skuById.has(o.skuId)) {
      throw new RunStateError(
        `SKU ${o.skuId} not found in this organization`
      )
    }
  }

  // ── 3. Read liquid_total from raw production_run_lots already written
  // by startRun (this function adds packaging rows AFTER this read). ──
  const { data: rawConsumption } = await admin
    .from('production_run_lots')
    .select('line_cost')
    .eq('org_id', orgId)
    .eq('production_run_id', runId)
  const liquidTotal = (rawConsumption ?? []).reduce(
    (s, r) => s + (Number(r.line_cost) || 0),
    0
  )

  // ── 4. Resolve each output's packaging BOM via previewAllocation ───
  const resolved: ResolvedOutput[] = []
  for (const o of outputs) {
    const sku = skuById.get(o.skuId)!

    const { data: bomRows } = await admin
      .from('sku_packaging')
      .select('ingredient_id, quantity, ingredients(name, kind)')
      .eq('org_id', orgId)
      .eq('sku_id', sku.id)

    const boms: ResolvedBom[] = []
    for (const bom of bomRows ?? []) {
      const ing = (
        bom as unknown as {
          ingredients: { name: string; kind: string } | null
        }
      ).ingredients
      if (!ing) {
        throw new RunStateError(
          `BOM row for SKU "${sku.name}" references a missing ingredient`
        )
      }
      if (ing.kind !== 'packaging') {
        throw new RunStateError(
          `BOM for SKU "${sku.name}" references ingredient "${ing.name}" which is kind="${ing.kind}" — only packaging ingredients are allowed`
        )
      }

      const need = Number(bom.quantity) * Number(o.quantity)
      const preview = await previewAllocation(
        { kind: 'ingredient', id: bom.ingredient_id },
        need,
        orgId
      )
      boms.push({
        ingredientId: bom.ingredient_id,
        ingredientName: ing.name,
        quantityPerUnit: Number(bom.quantity),
        allocation: preview.ok
          ? { ok: true, allocations: preview.allocations }
          : { ok: false, needed: preview.needed, available: preview.available },
      })
    }

    resolved.push({ input: o, sku, boms })
  }

  // ── 5. Pure cost math + invariant check ────────────────────────────
  const plan = planCompleteRun({ liquidTotal, resolved })
  const { planned, totalCogs } = plan

  // ── 6. Commit phase — all tracked for rollback ─────────────────────
  const tracker: WriteTracker = {
    packagingConsumed: [],
    packagingRunLotIds: [],
    finishedLotIds: [],
    outputIds: [],
  }
  const datePart = todayStamp(today())

  try {
    for (const e of planned) {
      // 7a. Consume packaging per BOM entry.
      for (const bom of e.boms) {
        for (const a of bom.allocations) {
          const { data: lot } = await admin
            .from('lots')
            .select('quantity_remaining, status')
            .eq('id', a.lotId)
            .maybeSingle()
          if (!lot) {
            throw new RunStateError(`Packaging lot ${a.lotId} disappeared`)
          }
          const before = Number(lot.quantity_remaining)
          if (before < a.quantityUsed) {
            throw new InsufficientStockError(a.quantityUsed, before)
          }
          const remaining = before - a.quantityUsed
          const lotUpdate: Database['public']['Tables']['lots']['Update'] = {
            quantity_remaining: remaining,
          }
          if (remaining <= 0) lotUpdate.status = 'depleted'
          const { error: updErr } = await admin
            .from('lots')
            .update(lotUpdate)
            .eq('id', a.lotId)
          if (updErr) throw new Error(updErr.message)

          tracker.packagingConsumed.push({
            lotId: a.lotId,
            quantity: a.quantityUsed,
          })

          const lineCost = a.quantityUsed * a.unitCost
          const { data: runLotRow, error: insErr } = await admin
            .from('production_run_lots')
            .insert({
              org_id: orgId,
              production_run_id: runId,
              lot_id: a.lotId,
              ingredient_id: bom.ingredientId,
              quantity_used: a.quantityUsed,
              unit: 'each',
              unit_cost_at_use: a.unitCost,
              line_cost: lineCost,
            })
            .select('id')
            .single()
          if (insErr) throw new Error(insErr.message)
          if (runLotRow) tracker.packagingRunLotIds.push(runLotRow.id)
        }
      }

      // 7b. Generate lot number + insert finished-goods lot.
      const prefix =
        e.sku.lot_prefix ?? buildLotPrefix(e.sku.name) ?? 'LOT'
      const lotNumber = await nextLotNumber(admin, orgId, prefix, datePart)

      const expiryDate =
        e.input.expiryDate ??
        (e.sku.shelf_life_days != null
          ? addDaysISO(today(), Number(e.sku.shelf_life_days))
          : null)

      const { data: finishedLot, error: lotErr } = await admin
        .from('lots')
        .insert({
          org_id: orgId,
          ingredient_id: null,
          sku_id: e.sku.id,
          production_run_id: runId,
          lot_number: lotNumber,
          quantity_received: Number(e.input.quantity),
          quantity_remaining: Number(e.input.quantity),
          unit: 'each',
          unit_cost: e.unitCogs,
          received_date: new Date().toISOString().slice(0, 10),
          expiry_date: expiryDate,
          status: 'available',
        })
        .select('id')
        .single()
      if (lotErr) throw new Error(lotErr.message)
      if (!finishedLot) throw new Error('Finished-goods lot insert returned no row')
      tracker.finishedLotIds.push(finishedLot.id)

      // 7c. Insert production_run_outputs.
      const { data: outputRow, error: outErr } = await admin
        .from('production_run_outputs')
        .insert({
          org_id: orgId,
          production_run_id: runId,
          sku_id: e.sku.id,
          lot_id: finishedLot.id,
          quantity: Number(e.input.quantity),
          cost_allocation_pct: e.pct,
          allocated_cogs_liquid: e.liquidCogs,
          allocated_cogs_packaging: e.packagingCogs,
          allocated_cogs_total: e.allocatedTotal,
          unit_cogs: e.unitCogs,
          override_note: e.overrideNote,
        })
        .select('id')
        .single()
      if (outErr) throw new Error(outErr.message)
      if (outputRow) tracker.outputIds.push(outputRow.id)
    }

    // 7d. Update run.
    const totalQty = outputs.reduce((s, o) => s + Number(o.quantity), 0)
    const update: Database['public']['Tables']['production_runs']['Update'] = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      actual_yield: totalQty,
      total_cogs: totalCogs,
      cost_per_unit:
        outputs.length === 1 && totalQty > 0 ? totalCogs / totalQty : null,
      waste_pct: null,
    }
    if (notes != null) update.notes = notes

    const { error: runErr } = await admin
      .from('production_runs')
      .update(update)
      .eq('id', runId)
    if (runErr) throw new Error(runErr.message)

    // 7e. QBO journal-entry sync log (consumed by the future cron).
    const { error: qboErr } = await admin.from('qbo_sync_log').insert({
      org_id: orgId,
      entity_type: 'journal_entry',
      entity_id: runId,
      status: 'pending',
    })
    if (qboErr) throw new Error(qboErr.message)
  } catch (err) {
    await rollbackCompletion(orgId, tracker)
    throw err
  }
}

async function rollbackCompletion(
  orgId: string,
  tracker: WriteTracker
): Promise<void> {
  const admin = createAdminClient()

  // Delete in dependency order: outputs → finished lots → packaging
  // run_lots → restore packaging lot quantities.
  if (tracker.outputIds.length > 0) {
    await admin
      .from('production_run_outputs')
      .delete()
      .eq('org_id', orgId)
      .in('id', tracker.outputIds)
  }
  if (tracker.finishedLotIds.length > 0) {
    await admin
      .from('lots')
      .delete()
      .eq('org_id', orgId)
      .in('id', tracker.finishedLotIds)
  }
  if (tracker.packagingRunLotIds.length > 0) {
    await admin
      .from('production_run_lots')
      .delete()
      .eq('org_id', orgId)
      .in('id', tracker.packagingRunLotIds)
  }

  const grouped = new Map<string, number>()
  for (const c of tracker.packagingConsumed) {
    grouped.set(c.lotId, (grouped.get(c.lotId) ?? 0) + c.quantity)
  }
  for (const [lotId, qty] of grouped) {
    const { data: lot } = await admin
      .from('lots')
      .select('quantity_remaining, status')
      .eq('id', lotId)
      .maybeSingle()
    if (!lot) continue
    const restored = Number(lot.quantity_remaining) + qty
    const update: Database['public']['Tables']['lots']['Update'] = {
      quantity_remaining: restored,
    }
    if ((lot as LotRow).status === 'depleted' && restored > 0) {
      update.status = 'available'
    }
    await admin.from('lots').update(update).eq('id', lotId)
  }
}

export async function cancelRun(orgId: string, runId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('production_runs')
    .select('status')
    .eq('org_id', orgId)
    .eq('id', runId)
    .maybeSingle()
  if (!run) throw new RunStateError('Run not found')
  if (run.status === 'cancelled' || run.status === 'completed') {
    throw new RunStateError(`Run is already ${run.status}`)
  }

  if (run.status === 'in_progress') {
    const { data: consumed } = await admin
      .from('production_run_lots')
      .select('lot_id, quantity_used')
      .eq('org_id', orgId)
      .eq('production_run_id', runId)

    const grouped = new Map<string, number>()
    for (const c of consumed ?? []) {
      grouped.set(
        c.lot_id,
        (grouped.get(c.lot_id) ?? 0) + (Number(c.quantity_used) || 0)
      )
    }

    for (const [lotId, qty] of grouped) {
      const { data: lot } = await admin
        .from('lots')
        .select('quantity_remaining, status')
        .eq('id', lotId)
        .maybeSingle()
      if (!lot) continue
      const restored = Number(lot.quantity_remaining) + qty
      const update: Database['public']['Tables']['lots']['Update'] = {
        quantity_remaining: restored,
      }
      if ((lot as LotRow).status === 'depleted' && restored > 0) {
        update.status = 'available'
      }
      await admin.from('lots').update(update).eq('id', lotId)
    }

    await admin
      .from('production_run_lots')
      .delete()
      .eq('org_id', orgId)
      .eq('production_run_id', runId)
  }

  await admin
    .from('production_runs')
    .update({ status: 'cancelled' })
    .eq('id', runId)
}
