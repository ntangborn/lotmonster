/**
 * POST /api/qbo/sync/bill
 *
 * On a received PO, posts a Bill to QBO:
 *   VendorRef:  looked up by DisplayName, auto-created if missing
 *   Line items: one per PO line where qty_received > 0,
 *               AccountBasedExpenseLineDetail with AccountRef =
 *               org.qbo_inventory_account_id (raw materials inventory)
 *
 * Bills are amounted on what was actually received (qty_received *
 * unit_cost), so partial receipts produce partial bills. Subsequent
 * receipts on the same PO will fail the idempotency check (we don't
 * support multi-bill yet) — TODO: track per-receipt bills if you
 * routinely accept partials.
 *
 * Idempotent: if purchase_orders.qbo_bill_id is already set, returns
 * it without re-posting.
 *
 * Auth modes:
 *   1. Cron — Authorization: Bearer ${CRON_SECRET}; org_id required
 *   2. User — authenticated session
 *
 * Body: { po_id: string, org_id?: string }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { qboJson, QBOTokenExpiredError, QBONotConnectedError } from '@/lib/qbo'
import type { Database } from '@/types/database'

const bodySchema = z.object({
  po_id: z.uuid(),
  org_id: z.uuid().optional(),
})

interface QBOQueryResponse<T> {
  QueryResponse: {
    [key: string]: T[] | number | undefined
  }
}

interface QBOVendor {
  Id: string
  DisplayName: string
}

interface QBOVendorCreateResponse {
  Vendor: QBOVendor
}

interface QBOBillResponse {
  Bill: {
    Id: string
    DocNumber?: string
    SyncToken: string
    TxnDate: string
  }
}

async function authorize(
  request: NextRequest,
  bodyOrgId: string | undefined
): Promise<{ orgId: string } | { error: NextResponse }> {
  const auth = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    if (!bodyOrgId) {
      return {
        error: NextResponse.json(
          { error: 'org_id required for cron requests' },
          { status: 400 }
        ),
      }
    }
    return { orgId: bodyOrgId }
  }

  try {
    const { orgId } = await resolveOrgId()
    return { orgId }
  } catch {
    return {
      error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }
}

function escapeQboString(s: string): string {
  return s.replace(/'/g, "''")
}

async function findOrCreateVendor(
  orgId: string,
  displayName: string
): Promise<string> {
  const safe = escapeQboString(displayName)
  const query = `select Id, DisplayName from Vendor where DisplayName = '${safe}'`
  const path = `query?query=${encodeURIComponent(query)}`

  const found = await qboJson<QBOQueryResponse<QBOVendor>>(orgId, path)
  const list = (found?.QueryResponse?.Vendor as QBOVendor[] | undefined) ?? []
  if (list.length > 0 && list[0].Id) return list[0].Id

  const created = await qboJson<QBOVendorCreateResponse>(orgId, 'vendor', {
    method: 'POST',
    body: { DisplayName: displayName },
  })
  if (!created?.Vendor?.Id) {
    throw new Error('Vendor create returned no Id')
  }
  return created.Vendor.Id
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const { po_id, org_id: bodyOrg } = parsed.data

  const auth = await authorize(request, bodyOrg)
  if ('error' in auth) return auth.error
  const { orgId } = auth

  const admin = createAdminClient()

  const { data: org } = await admin
    .from('orgs')
    .select('qbo_realm_id, qbo_inventory_account_id')
    .eq('id', orgId)
    .maybeSingle()
  if (!org?.qbo_realm_id) {
    return NextResponse.json(
      { error: 'qbo_not_connected', message: 'Connect QuickBooks first' },
      { status: 409 }
    )
  }
  if (!org.qbo_inventory_account_id) {
    return NextResponse.json(
      {
        error: 'inventory_account_not_set',
        message:
          'Configure QBO Raw Materials Inventory account in Settings before posting bills',
      },
      { status: 409 }
    )
  }

  const { data: po } = await admin
    .from('purchase_orders')
    .select(
      'id, po_number, supplier, status, expected_delivery_date, qbo_bill_id, created_at'
    )
    .eq('org_id', orgId)
    .eq('id', po_id)
    .maybeSingle()
  if (!po) {
    return NextResponse.json({ error: 'po_not_found' }, { status: 404 })
  }
  const okStates = new Set(['partially_received', 'received', 'closed'])
  if (!okStates.has(po.status)) {
    return NextResponse.json(
      {
        error: 'po_not_received',
        message:
          'Only partially received / received / closed POs can be billed',
      },
      { status: 409 }
    )
  }

  if (po.qbo_bill_id) {
    await markSyncLog(orgId, po_id, 'success', po.qbo_bill_id, null)
    return NextResponse.json({
      ok: true,
      qbo_bill_id: po.qbo_bill_id,
      idempotent: true,
    })
  }

  const { data: lines } = await admin
    .from('purchase_order_lines')
    .select(
      'id, ingredient_id, qty_received, unit, unit_cost, ingredients(name)'
    )
    .eq('org_id', orgId)
    .eq('po_id', po_id)
    .order('created_at', { ascending: true })

  type LineWithIng = (typeof lines extends Array<infer T> | null ? T : never) & {
    ingredients: { name: string } | null
  }
  const billable = (lines ?? []).filter(
    (l) => Number(l.qty_received ?? 0) > 0
  ) as LineWithIng[]

  if (billable.length === 0) {
    return NextResponse.json(
      {
        error: 'no_received_lines',
        message: 'PO has no lines with qty_received > 0',
      },
      { status: 409 }
    )
  }

  let vendorId: string
  try {
    vendorId = await findOrCreateVendor(orgId, po.supplier.trim())
  } catch (e) {
    const msg = mapQboError(e)
    await markSyncLog(orgId, po_id, 'failed', null, `vendor:${msg}`.slice(0, 500))
    return NextResponse.json(
      { error: 'vendor_lookup_failed', detail: msg },
      { status: statusForError(e) }
    )
  }

  const txnDate = (po.expected_delivery_date ?? po.created_at).slice(0, 10)
  const payload = {
    TxnDate: txnDate,
    DocNumber: po.po_number,
    PrivateNote: `Lotmonster purchase order ${po.po_number}`,
    VendorRef: { value: vendorId },
    Line: billable.map((line) => {
      const qty = Number(line.qty_received ?? 0)
      const cost = Number(line.unit_cost)
      const amount = round2(qty * cost)
      const ingName = line.ingredients?.name ?? 'Item'
      return {
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: amount,
        Description: `${ingName} — ${qty} ${line.unit} @ $${cost.toFixed(4)}`,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: org.qbo_inventory_account_id! },
        },
      }
    }),
  }

  let resp: QBOBillResponse
  try {
    resp = await qboJson<QBOBillResponse>(orgId, 'bill', {
      method: 'POST',
      body: payload,
    })
  } catch (e) {
    const msg = mapQboError(e)
    await markSyncLog(orgId, po_id, 'failed', null, msg.slice(0, 500))
    return NextResponse.json({ error: msg }, { status: statusForError(e) })
  }

  const billId = resp?.Bill?.Id
  if (!billId) {
    await markSyncLog(orgId, po_id, 'failed', null, 'missing_id_in_response')
    return NextResponse.json(
      { error: 'missing_id_in_response', raw: resp },
      { status: 502 }
    )
  }

  const { error: updErr } = await admin
    .from('purchase_orders')
    .update({ qbo_bill_id: billId })
    .eq('org_id', orgId)
    .eq('id', po_id)
  if (updErr) {
    await markSyncLog(
      orgId,
      po_id,
      'failed',
      billId,
      `posted_but_local_update_failed: ${updErr.message}`.slice(0, 500)
    )
    return NextResponse.json(
      { error: 'local_persist_failed', qbo_bill_id: billId },
      { status: 500 }
    )
  }

  await markSyncLog(orgId, po_id, 'success', billId, null)
  return NextResponse.json({ ok: true, qbo_bill_id: billId })
}

function mapQboError(e: unknown): string {
  if (e instanceof QBOTokenExpiredError) return 'qbo_disconnected'
  if (e instanceof QBONotConnectedError) return 'qbo_not_connected'
  if (e instanceof Error) return e.message
  return 'qbo_request_failed'
}

function statusForError(e: unknown): number {
  if (e instanceof QBOTokenExpiredError) return 401
  if (e instanceof QBONotConnectedError) return 409
  return 502
}

async function markSyncLog(
  orgId: string,
  poId: string,
  status: 'success' | 'failed' | 'pending' | 'retrying',
  qboDocId: string | null,
  errorMessage: string | null
): Promise<void> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('qbo_sync_log')
    .select('id, retry_count')
    .eq('org_id', orgId)
    .eq('entity_type', 'bill')
    .eq('entity_id', poId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const update: Database['public']['Tables']['qbo_sync_log']['Update'] = {
      status,
      qbo_doc_id: qboDocId,
      error_message: errorMessage,
    }
    if (status === 'success') {
      update.synced_at = new Date().toISOString()
    } else if (status === 'failed') {
      update.retry_count = (existing.retry_count ?? 0) + 1
    }
    await admin.from('qbo_sync_log').update(update).eq('id', existing.id)
  } else {
    await admin.from('qbo_sync_log').insert({
      org_id: orgId,
      entity_type: 'bill',
      entity_id: poId,
      status,
      qbo_doc_id: qboDocId,
      error_message: errorMessage,
      synced_at: status === 'success' ? new Date().toISOString() : null,
    })
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
