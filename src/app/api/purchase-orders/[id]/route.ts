import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getPODetail } from '@/lib/purchase-orders/queries'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'auth_failed' },
      { status: 401 }
    )
  }
  const { id } = await context.params
  const detail = await getPODetail(orgId, id)
  if (!detail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(detail)
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'auth_failed' },
      { status: 401 }
    )
  }
  const { id } = await context.params
  const admin = createAdminClient()

  const { data: po } = await admin
    .from('purchase_orders')
    .select('status')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!po) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (po.status !== 'draft' && po.status !== 'cancelled') {
    return NextResponse.json(
      { error: 'cannot_delete_after_send' },
      { status: 409 }
    )
  }

  const { count: lotsCount } = await admin
    .from('lots')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('po_id', id)
  if ((lotsCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'has_lots', lots: lotsCount },
      { status: 409 }
    )
  }

  await admin
    .from('purchase_order_lines')
    .delete()
    .eq('org_id', orgId)
    .eq('po_id', id)
  const { error } = await admin
    .from('purchase_orders')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
