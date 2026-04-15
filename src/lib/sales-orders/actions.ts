import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'
import type { ShipLineInput } from './schema'

export class SOStateError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'SOStateError'
  }
}

/**
 * Ship a sales order: writes lot_numbers_allocated to each line,
 * sets shipped_at, and moves the SO to 'shipped'. Inserts a stub
 * QBO Invoice sync row.
 */
export async function shipSalesOrder(
  orgId: string,
  soId: string,
  inputs: ShipLineInput[],
  shippedAt: string | null,
  notes: string | null
): Promise<void> {
  const admin = createAdminClient()

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

  const { data: lines } = await admin
    .from('sales_order_lines')
    .select('id')
    .eq('org_id', orgId)
    .eq('sales_order_id', soId)
  const lineIds = new Set((lines ?? []).map((l) => l.id))

  for (const input of inputs) {
    if (!lineIds.has(input.line_id)) {
      throw new SOStateError(`Line ${input.line_id} not on this SO`)
    }
    const cleaned = (input.lot_numbers ?? [])
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const { error } = await admin
      .from('sales_order_lines')
      .update({ lot_numbers_allocated: cleaned })
      .eq('id', input.line_id)
    if (error) throw new Error(error.message)
  }

  const update: Database['public']['Tables']['sales_orders']['Update'] = {
    status: 'shipped',
    shipped_at: shippedAt || new Date().toISOString(),
  }
  if (notes && notes.trim()) {
    update.notes = so.notes ? `${so.notes}\n${notes.trim()}` : notes.trim()
  }
  const { error: poErr } = await admin
    .from('sales_orders')
    .update(update)
    .eq('id', soId)
  if (poErr) throw new Error(poErr.message)

  // Stub QBO Invoice sync — actual posting happens in a future cron.
  await admin.from('qbo_sync_log').insert({
    org_id: orgId,
    entity_type: 'invoice',
    entity_id: soId,
    status: 'pending',
  })
}
