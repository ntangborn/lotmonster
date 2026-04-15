import { createAdminClient } from '@/lib/supabase/admin'
import { suggestLotNumber } from '@/lib/lots/queries'
import type { Database } from '@/types/database'
import type { ReceiveLineInput } from './schema'

type LineRow = Database['public']['Tables']['purchase_order_lines']['Row']

export class POStateError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'POStateError'
  }
}

const RECEIVABLE_STATES = new Set([
  'sent',
  'partially_received',
])

/**
 * Receive a delivery: for each provided line, increment qty_received
 * and (if quantity > 0) create a corresponding lot with the PO's
 * unit_cost. Updates PO status:
 *   - all lines fully received → 'received'
 *   - any received but not all → 'partially_received'
 */
export async function receiveDelivery(
  orgId: string,
  poId: string,
  inputs: ReceiveLineInput[],
  notes?: string | null
): Promise<{ created_lot_ids: string[] }> {
  const admin = createAdminClient()

  const { data: po } = await admin
    .from('purchase_orders')
    .select('id, status, supplier, notes')
    .eq('org_id', orgId)
    .eq('id', poId)
    .maybeSingle()
  if (!po) throw new POStateError('PO not found')
  if (!RECEIVABLE_STATES.has(po.status)) {
    throw new POStateError(
      `Cannot receive against a PO in state "${po.status}"`
    )
  }

  const { data: lines } = await admin
    .from('purchase_order_lines')
    .select('*')
    .eq('org_id', orgId)
    .eq('po_id', poId)
  if (!lines || lines.length === 0) {
    throw new POStateError('PO has no lines')
  }
  const lineMap = new Map(lines.map((l) => [l.id, l as LineRow]))

  const createdLotIds: string[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const input of inputs) {
    const line = lineMap.get(input.line_id)
    if (!line) {
      throw new POStateError(`Line ${input.line_id} not in this PO`)
    }
    if (input.quantity_received <= 0) continue

    const newReceived =
      Number(line.qty_received ?? 0) + input.quantity_received
    if (newReceived > Number(line.qty_ordered)) {
      throw new POStateError(
        `Cannot over-receive line: ordered ${line.qty_ordered}, would receive ${newReceived}`
      )
    }

    const { error: updErr } = await admin
      .from('purchase_order_lines')
      .update({ qty_received: newReceived })
      .eq('id', line.id)
    if (updErr) throw new Error(updErr.message)

    const lotNumber =
      input.lot_number?.trim() ||
      (await suggestLotNumber(orgId, line.ingredient_id, new Date()))

    const { data: lot, error: lotErr } = await admin
      .from('lots')
      .insert({
        org_id: orgId,
        ingredient_id: line.ingredient_id,
        po_id: poId,
        lot_number: lotNumber,
        supplier_lot_number: input.supplier_lot_number?.trim() || null,
        quantity_received: input.quantity_received,
        quantity_remaining: input.quantity_received,
        unit: line.unit,
        unit_cost: Number(line.unit_cost),
        received_date: input.received_date || today,
        expiry_date: input.expiry_date || null,
        status: 'available',
        notes: notes?.trim() || null,
      })
      .select('id')
      .single()
    if (lotErr || !lot) {
      throw new Error(lotErr?.message ?? 'lot_insert_failed')
    }
    createdLotIds.push(lot.id)

    // Re-read updated line so the running snapshot stays consistent
    lineMap.set(line.id, { ...line, qty_received: newReceived })
  }

  const allLines = Array.from(lineMap.values())
  const totalOrdered = allLines.reduce(
    (s, l) => s + Number(l.qty_ordered),
    0
  )
  const totalReceived = allLines.reduce(
    (s, l) => s + Number(l.qty_received ?? 0),
    0
  )

  let nextStatus: 'partially_received' | 'received' = 'partially_received'
  if (totalReceived >= totalOrdered && totalReceived > 0) {
    nextStatus = 'received'
  }

  const update: Database['public']['Tables']['purchase_orders']['Update'] = {
    status: nextStatus,
  }
  if (notes && notes.trim()) {
    update.notes = po.notes ? `${po.notes}\n${notes.trim()}` : notes.trim()
  }
  const { error: poErr } = await admin
    .from('purchase_orders')
    .update(update)
    .eq('id', poId)
  if (poErr) throw new Error(poErr.message)

  return { created_lot_ids: createdLotIds }
}
