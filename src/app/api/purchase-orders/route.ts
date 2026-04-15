import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import {
  listPurchaseOrders,
  suggestPONumber,
} from '@/lib/purchase-orders/queries'
import {
  poCreateSchema,
  type POStatus,
} from '@/lib/purchase-orders/schema'

export async function GET(request: NextRequest) {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'auth_failed' },
      { status: 401 }
    )
  }
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') as POStatus | null
  try {
    const rows = await listPurchaseOrders(orgId, status ?? undefined)
    return NextResponse.json({ rows })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'query_failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'auth_failed' },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = poCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const input = parsed.data
  const admin = createAdminClient()

  const ingIds = Array.from(new Set(input.lines.map((l) => l.ingredient_id)))
  const { data: validIngs } = await admin
    .from('ingredients')
    .select('id')
    .eq('org_id', orgId)
    .in('id', ingIds)
  if ((validIngs?.length ?? 0) !== ingIds.length) {
    return NextResponse.json(
      { error: 'invalid_ingredient' },
      { status: 400 }
    )
  }

  const poNumber =
    input.po_number?.trim() || (await suggestPONumber(orgId))
  const total = input.lines.reduce(
    (s, l) => s + l.qty_ordered * l.unit_cost,
    0
  )

  const { data: po, error } = await admin
    .from('purchase_orders')
    .insert({
      org_id: orgId,
      po_number: poNumber,
      supplier: input.supplier.trim(),
      status: input.mark_sent ? 'sent' : 'draft',
      expected_delivery_date: input.expected_delivery_date || null,
      total_amount: total,
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single()

  if (error || !po) {
    const status = error?.code === '23505' ? 409 : 500
    return NextResponse.json(
      { error: error?.message ?? 'insert_failed' },
      { status }
    )
  }

  const linePayload = input.lines.map((l) => ({
    org_id: orgId,
    po_id: po.id,
    ingredient_id: l.ingredient_id,
    qty_ordered: l.qty_ordered,
    unit: l.unit,
    unit_cost: l.unit_cost,
  }))

  const { error: linesError } = await admin
    .from('purchase_order_lines')
    .insert(linePayload)

  if (linesError) {
    await admin.from('purchase_orders').delete().eq('id', po.id)
    return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  return NextResponse.json({ po }, { status: 201 })
}
