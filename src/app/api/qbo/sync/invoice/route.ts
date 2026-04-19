/**
 * POST /api/qbo/sync/invoice
 *
 * On a shipped sales order, posts an Invoice to QBO:
 *   CustomerRef: looked up by DisplayName, auto-created if missing
 *   Line items:  one per SO line with unit_price > 0
 *
 * Idempotent: if sales_orders.qbo_invoice_id is already set, returns
 * it without re-posting.
 *
 * Auth modes:
 *   1. Cron — Authorization: Bearer ${CRON_SECRET}; org_id required
 *   2. User — authenticated session
 *
 * Body: { sales_order_id: string, org_id?: string }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { qboJson, QBOTokenExpiredError, QBONotConnectedError } from '@/lib/qbo'
import type { Database } from '@/types/database'

const bodySchema = z.object({
  sales_order_id: z.uuid(),
  org_id: z.uuid().optional(),
})

interface QBOQueryResponse<T> {
  QueryResponse: {
    [key: string]: T[] | number | undefined
    maxResults?: number
    startPosition?: number
  }
  time?: string
}

interface QBOCustomer {
  Id: string
  DisplayName: string
  PrimaryEmailAddr?: { Address: string }
}

interface QBOCustomerCreateResponse {
  Customer: QBOCustomer
}

interface QBOInvoiceResponse {
  Invoice: {
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
  // QBO query language uses single quotes; escape by doubling.
  return s.replace(/'/g, "''")
}

async function findOrCreateCustomer(
  orgId: string,
  displayName: string,
  email: string | null
): Promise<string> {
  const safe = escapeQboString(displayName)
  const query = `select Id, DisplayName from Customer where DisplayName = '${safe}'`
  const path = `query?query=${encodeURIComponent(query)}`

  const found = await qboJson<QBOQueryResponse<QBOCustomer>>(orgId, path)
  const list = (found?.QueryResponse?.Customer as QBOCustomer[] | undefined) ?? []
  if (list.length > 0 && list[0].Id) return list[0].Id

  const payload: Record<string, unknown> = { DisplayName: displayName }
  if (email) payload.PrimaryEmailAddr = { Address: email }

  const created = await qboJson<QBOCustomerCreateResponse>(
    orgId,
    'customer',
    { method: 'POST', body: payload }
  )
  if (!created?.Customer?.Id) {
    throw new Error('Customer create returned no Id')
  }
  return created.Customer.Id
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
  const { sales_order_id, org_id: bodyOrg } = parsed.data

  const auth = await authorize(request, bodyOrg)
  if ('error' in auth) return auth.error
  const { orgId } = auth

  const admin = createAdminClient()

  const { data: org } = await admin
    .from('orgs')
    .select('qbo_realm_id, qbo_default_item_id')
    .eq('id', orgId)
    .maybeSingle()
  if (!org?.qbo_realm_id) {
    return NextResponse.json(
      { error: 'qbo_not_connected', message: 'Connect QuickBooks first' },
      { status: 409 }
    )
  }
  // Note: org.qbo_default_item_id is NOT hard-required anymore. It's
  // only used as a fallback for SKUs that don't have their own
  // qbo_item_id set. If every SKU has one, the org default can be null.

  const { data: so } = await admin
    .from('sales_orders')
    .select(
      'id, order_number, customer_name, customer_email, status, shipped_at, qbo_invoice_id'
    )
    .eq('org_id', orgId)
    .eq('id', sales_order_id)
    .maybeSingle()
  if (!so) {
    return NextResponse.json({ error: 'sales_order_not_found' }, { status: 404 })
  }
  const okStates = new Set(['shipped', 'invoiced', 'closed'])
  if (!okStates.has(so.status)) {
    return NextResponse.json(
      {
        error: 'so_not_shipped',
        message: 'Only shipped/invoiced/closed orders can be invoiced',
      },
      { status: 409 }
    )
  }

  if (so.qbo_invoice_id) {
    await markSyncLog(orgId, sales_order_id, 'success', so.qbo_invoice_id, null)
    return NextResponse.json({
      ok: true,
      qbo_invoice_id: so.qbo_invoice_id,
      idempotent: true,
    })
  }

  const { data: lines } = await admin
    .from('sales_order_lines')
    .select(
      'id, recipe_id, sku_id, quantity, unit, unit_price, recipes(name), skus(name, qbo_item_id)'
    )
    .eq('org_id', orgId)
    .eq('sales_order_id', sales_order_id)
    .order('created_at', { ascending: true })

  type LineWithRefs = (typeof lines extends Array<infer T> | null ? T : never) & {
    recipes: { name: string } | null
    skus: { name: string; qbo_item_id: string | null } | null
  }
  const billable = (lines ?? []).filter(
    (l) => Number(l.quantity) > 0 && l.unit_price != null && Number(l.unit_price) > 0
  ) as LineWithRefs[]

  if (billable.length === 0) {
    return NextResponse.json(
      {
        error: 'no_billable_lines',
        message:
          'Sales order has no lines with both quantity > 0 and unit_price > 0',
      },
      { status: 409 }
    )
  }

  // Per-line QBO Item resolution: sku.qbo_item_id ?? org.qbo_default_item_id.
  // Fail fast (before posting to QBO) if any line has neither, naming the
  // offending SKUs so the operator knows what to fix.
  interface ResolvedLine {
    line: LineWithRefs
    itemRef: string
    description: string
  }
  const resolved: ResolvedLine[] = []
  const unmappable: string[] = []
  for (const line of billable) {
    const itemRef =
      line.skus?.qbo_item_id?.trim() ||
      org.qbo_default_item_id?.trim() ||
      null
    if (!itemRef) {
      unmappable.push(
        line.skus?.name ?? line.recipes?.name ?? `line ${line.id}`
      )
      continue
    }
    resolved.push({
      line,
      itemRef,
      description:
        line.skus?.name?.trim() ||
        line.recipes?.name?.trim() ||
        'Item',
    })
  }
  if (unmappable.length > 0) {
    const uniq = Array.from(new Set(unmappable))
    const message =
      `No QBO Item mapping for: ${uniq.join(', ')}. ` +
      'Set sku.qbo_item_id on each SKU, or set a fallback ' +
      'org.qbo_default_item_id in Settings.'
    await markSyncLog(orgId, sales_order_id, 'failed', null, message.slice(0, 500))
    return NextResponse.json(
      { error: 'qbo_item_mapping_missing', message, skus: uniq },
      { status: 409 }
    )
  }

  let customerId: string
  try {
    customerId = await findOrCreateCustomer(
      orgId,
      so.customer_name.trim(),
      so.customer_email?.trim() || null
    )
  } catch (e) {
    const msg = mapQboError(e)
    await markSyncLog(orgId, sales_order_id, 'failed', null, `customer:${msg}`.slice(0, 500))
    return NextResponse.json(
      { error: 'customer_lookup_failed', detail: msg },
      { status: statusForError(e) }
    )
  }

  const txnDate = (so.shipped_at ?? new Date().toISOString()).slice(0, 10)
  const payload = {
    TxnDate: txnDate,
    DocNumber: so.order_number,
    PrivateNote: `Lotmonster sales order ${so.order_number}`,
    CustomerRef: { value: customerId },
    Line: resolved.map(({ line, itemRef, description }) => {
      const qty = Number(line.quantity)
      const price = Number(line.unit_price)
      return {
        DetailType: 'SalesItemLineDetail',
        Amount: round2(qty * price),
        Description: description,
        SalesItemLineDetail: {
          ItemRef: { value: itemRef },
          Qty: qty,
          UnitPrice: round2(price),
        },
      }
    }),
  }

  let resp: QBOInvoiceResponse
  try {
    resp = await qboJson<QBOInvoiceResponse>(orgId, 'invoice', {
      method: 'POST',
      body: payload,
    })
  } catch (e) {
    const msg = mapQboError(e)
    await markSyncLog(orgId, sales_order_id, 'failed', null, msg.slice(0, 500))
    return NextResponse.json({ error: msg }, { status: statusForError(e) })
  }

  const invoiceId = resp?.Invoice?.Id
  if (!invoiceId) {
    await markSyncLog(orgId, sales_order_id, 'failed', null, 'missing_id_in_response')
    return NextResponse.json(
      { error: 'missing_id_in_response', raw: resp },
      { status: 502 }
    )
  }

  const { error: updErr } = await admin
    .from('sales_orders')
    .update({ qbo_invoice_id: invoiceId, status: 'invoiced' })
    .eq('org_id', orgId)
    .eq('id', sales_order_id)
  if (updErr) {
    await markSyncLog(
      orgId,
      sales_order_id,
      'failed',
      invoiceId,
      `posted_but_local_update_failed: ${updErr.message}`.slice(0, 500)
    )
    return NextResponse.json(
      { error: 'local_persist_failed', qbo_invoice_id: invoiceId },
      { status: 500 }
    )
  }

  await markSyncLog(orgId, sales_order_id, 'success', invoiceId, null)

  return NextResponse.json({ ok: true, qbo_invoice_id: invoiceId })
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
  soId: string,
  status: 'success' | 'failed' | 'pending' | 'retrying',
  qboDocId: string | null,
  errorMessage: string | null
): Promise<void> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('qbo_sync_log')
    .select('id, retry_count')
    .eq('org_id', orgId)
    .eq('entity_type', 'invoice')
    .eq('entity_id', soId)
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
      entity_type: 'invoice',
      entity_id: soId,
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
