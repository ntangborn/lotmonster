import { createAdminClient } from '@/lib/supabase/admin'

export interface LotAllocation {
  lotId: string
  lotNumber: string
  quantityUsed: number
  unitCost: number
  expiryDate: string | null
}

export type AllocationTarget =
  | { kind: 'ingredient'; id: string }
  | { kind: 'sku'; id: string }

export class InsufficientStockError extends Error {
  constructor(
    public readonly needed: number,
    public readonly available: number
  ) {
    super(
      `Insufficient stock: needed ${needed}, only ${available} available`
    )
    this.name = 'InsufficientStockError'
  }
}

/**
 * FEFO (First Expires, First Out) allocator.
 *
 * Pure calculation — reads available lots, returns the allocation plan.
 * Does NOT mutate DB. Callers (production runs, shipments) should pass
 * the returned allocations into an atomic write that decrements
 * quantity_remaining and marks depleted lots.
 *
 * Polymorphic: `target.kind` flips the query column — 'ingredient' selects
 * raw/packaging ingredient lots (indexed by lots_fefo_ingredient_idx),
 * 'sku' selects finished-goods lots (lots_fefo_sku_idx). Sort order in
 * both cases: expiry_date ASC NULLS LAST, then received_date ASC.
 *
 * Throws InsufficientStockError if total available is less than needed.
 */
export async function allocateLots(
  target: AllocationTarget,
  quantityNeeded: number,
  orgId: string
): Promise<LotAllocation[]> {
  if (quantityNeeded <= 0) return []

  const admin = createAdminClient()
  const column = target.kind === 'sku' ? 'sku_id' : 'ingredient_id'
  const { data: lots, error } = await admin
    .from('lots')
    .select('id, lot_number, quantity_remaining, unit_cost, expiry_date, received_date')
    .eq('org_id', orgId)
    .eq(column, target.id)
    .eq('status', 'available')
    .gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .order('received_date', { ascending: true })

  if (error) throw new Error(error.message)

  const allocations: LotAllocation[] = []
  let remaining = quantityNeeded
  let totalAvailable = 0

  for (const lot of lots ?? []) {
    const qty = Number(lot.quantity_remaining) || 0
    totalAvailable += qty
    if (remaining <= 0) continue

    const take = Math.min(qty, remaining)
    allocations.push({
      lotId: lot.id,
      lotNumber: lot.lot_number,
      quantityUsed: take,
      unitCost: Number(lot.unit_cost) || 0,
      expiryDate: lot.expiry_date,
    })
    remaining -= take
  }

  if (remaining > 0) {
    throw new InsufficientStockError(quantityNeeded, totalAvailable)
  }

  return allocations
}

/**
 * Preview variant: returns both the plan and whether allocation is possible,
 * without throwing. Useful for UI that wants to show shortage details.
 */
export async function previewAllocation(
  target: AllocationTarget,
  quantityNeeded: number,
  orgId: string
): Promise<
  | { ok: true; allocations: LotAllocation[] }
  | { ok: false; needed: number; available: number }
> {
  try {
    const allocations = await allocateLots(target, quantityNeeded, orgId)
    return { ok: true, allocations }
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return { ok: false, needed: e.needed, available: e.available }
    }
    throw e
  }
}
