import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getSODetail } from '@/lib/sales-orders/queries'

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
  const detail = await getSODetail(orgId, id)
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

  const { data: so } = await admin
    .from('sales_orders')
    .select('status')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!so) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (so.status !== 'draft' && so.status !== 'cancelled') {
    return NextResponse.json(
      { error: 'cannot_delete_after_confirm' },
      { status: 409 }
    )
  }

  await admin
    .from('sales_order_lines')
    .delete()
    .eq('org_id', orgId)
    .eq('sales_order_id', id)
  const { error } = await admin
    .from('sales_orders')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
