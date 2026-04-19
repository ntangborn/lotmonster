import { createAdminClient } from '@/lib/supabase/admin'
import { allocateLots, InsufficientStockError } from '@/lib/fefo'
import type { Database } from '@/types/database'

type LotRow = Database['public']['Tables']['lots']['Row']

export class SOStateError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'SOStateError'
  }
}

interface ShipTracker {
  consumed: Array<{ lotId: string; quantity: number }>
  lineUpdates: string[]
}

/**
 * Ship a sales order.
 *
 * Phase-1 rewrite: the server FEFO-allocates finished-goods lots per
 * SO line via `allocateLots({ kind: 'sku', id: line.sku_id }, ...)`,
 * decrements those lots, and writes the allocated lot numbers back
 * into the `lot_numbers_allocated` TEXT[] bridge column (which phase
 * 2 will replace with a proper `sales_order_line_lots` junction).
 * Throws `InsufficientStockError` naming the SKU on shortfall.
 *
 * Writes tracked for best-effort rollback: lot quantity decrements
 * and per-line `lot_numbers_allocated` updates are reversed if any
 * subsequent write fails.
 */
export async function shipSalesOrder(
  orgId: string,
  soId: string,
  shippedAt: string | null,
  notes: string | null
): Promise<void> {
  const admin = createAdminClient()

  // ── 1. Validate SO state ──────────────────────────────────────────
  const { data: so } = await admin
    .from('sales_orders')
    .select('id, status, notes')
    .eq('org_id', orgId)
    .eq('id', soId)
    .maybeSingle()
  if (!so) throw new SOStateError('Sales order not found')
  if (so.status !== 'confirmed' && so.status !== 'allocated') {
    throw new SOStateError(
      `Cannot ship a sales order in state "${so.status}"`
    )
  }

  // ── 2. Fetch SO lines with SKU name for error messages ────────────
  const { data: lines } = await admin
    .from('sales_order_lines')
    .select('id, sku_id, quantity, skus(name)')
    .eq('org_id', orgId)
    .eq('sales_order_id', soId)
  if (!lines || lines.length === 0) {
    throw new SOStateError('Sales order has no lines')
  }
  for (const line of lines) {
    if (!line.sku_id) {
      throw new SOStateError(
        `Line ${line.id} has no sku_id — relink this line to a SKU before shipping`
      )
    }
  }

  // ── 3. Per-line FEFO allocation + lot decrement (tracked) ─────────
  const tracker: ShipTracker = { consumed: [], lineUpdates: [] }

  try {
    for (const line of lines) {
      const skuName =
        (line as unknown as { skus: { name: string } | null }).skus?.name ??
        'unknown SKU'
      const needed = Number(line.quantity) || 0

      let allocations
      try {
        allocations = await allocateLots(
          { kind: 'sku', id: line.sku_id! },
          needed,
          orgId
        )
      } catch (e) {
        if (e instanceof InsufficientStockError) {
          const err = new InsufficientStockError(e.needed, e.available)
          err.message = `Insufficient finished-goods stock: SKU "${skuName}" needs ${e.needed}, only ${e.available} available`
          throw err
        }
        throw e
      }

      for (const a of allocations) {
        const { data: lot } = await admin
          .from('lots')
          .select('quantity_remaining, status')
          .eq('id', a.lotId)
          .maybeSingle()
        if (!lot) throw new SOStateError(`Lot ${a.lotId} disappeared`)
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

        tracker.consumed.push({
          lotId: a.lotId,
          quantity: a.quantityUsed,
        })
      }

      // Bridge column — phase 2 replaces this with a real junction.
      const lotNumbers = allocations.map((a) => a.lotNumber)
      const { error: lineErr } = await admin
        .from('sales_order_lines')
        .update({ lot_numbers_allocated: lotNumbers })
        .eq('id', line.id)
      if (lineErr) throw new Error(lineErr.message)
      tracker.lineUpdates.push(line.id)
    }

    // ── 4. Flip SO to shipped ───────────────────────────────────────
    const update: Database['public']['Tables']['sales_orders']['Update'] = {
      status: 'shipped',
      shipped_at: shippedAt || new Date().toISOString(),
    }
    if (notes && notes.trim()) {
      update.notes = so.notes
        ? `${so.notes}\n${notes.trim()}`
        : notes.trim()
    }
    const { error: soErr } = await admin
      .from('sales_orders')
      .update(update)
      .eq('id', soId)
    if (soErr) throw new Error(soErr.message)

    // ── 5. QBO invoice sync log (consumed by the future cron) ──────
    const { error: qboErr } = await admin.from('qbo_sync_log').insert({
      org_id: orgId,
      entity_type: 'invoice',
      entity_id: soId,
      status: 'pending',
    })
    if (qboErr) throw new Error(qboErr.message)
  } catch (err) {
    await rollbackShip(orgId, tracker)
    throw err
  }
}

async function rollbackShip(
  orgId: string,
  tracker: ShipTracker
): Promise<void> {
  const admin = createAdminClient()

  // Clear allocated lot numbers on any lines we updated mid-flight.
  if (tracker.lineUpdates.length > 0) {
    await admin
      .from('sales_order_lines')
      .update({ lot_numbers_allocated: [] })
      .eq('org_id', orgId)
      .in('id', tracker.lineUpdates)
  }

  // Restore lot quantities (flip depleted → available where needed).
  const grouped = new Map<string, number>()
  for (const c of tracker.consumed) {
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
