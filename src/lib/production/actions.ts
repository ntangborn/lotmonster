import { createAdminClient } from '@/lib/supabase/admin'
import { allocateLots, InsufficientStockError } from '@/lib/fefo'
import type { Database } from '@/types/database'

type LotRow = Database['public']['Tables']['lots']['Row']

export class RunStateError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'RunStateError'
  }
}

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

export async function completeRun(
  orgId: string,
  runId: string,
  actualYield: number,
  notes: string | null
): Promise<void> {
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('production_runs')
    .select('id, status, expected_yield')
    .eq('org_id', orgId)
    .eq('id', runId)
    .maybeSingle()
  if (!run) throw new RunStateError('Run not found')
  if (run.status !== 'in_progress') {
    throw new RunStateError(
      `Cannot complete a run in state "${run.status}"`
    )
  }

  const { data: consumed } = await admin
    .from('production_run_lots')
    .select('line_cost')
    .eq('org_id', orgId)
    .eq('production_run_id', runId)

  const totalCogs = (consumed ?? []).reduce(
    (s, r) => s + (Number(r.line_cost) || 0),
    0
  )
  const costPerUnit = actualYield > 0 ? totalCogs / actualYield : null
  const expected = run.expected_yield != null ? Number(run.expected_yield) : null
  const wastePct =
    expected != null && expected > 0
      ? Math.max(0, ((expected - actualYield) / expected) * 100)
      : null

  const update: Database['public']['Tables']['production_runs']['Update'] = {
    status: 'completed',
    completed_at: new Date().toISOString(),
    actual_yield: actualYield,
    total_cogs: totalCogs,
    cost_per_unit: costPerUnit,
    waste_pct: wastePct,
  }
  if (notes != null) update.notes = notes

  const { error } = await admin
    .from('production_runs')
    .update(update)
    .eq('id', runId)
  if (error) throw new Error(error.message)

  // Stub QBO journal entry sync — actual posting happens in a future cron.
  await admin.from('qbo_sync_log').insert({
    org_id: orgId,
    entity_type: 'journal_entry',
    entity_id: runId,
    status: 'pending',
  })
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
