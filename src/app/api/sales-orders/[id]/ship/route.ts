import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { shipSOSchema } from '@/lib/sales-orders/schema'
import { shipSalesOrder, SOStateError } from '@/lib/sales-orders/actions'
import { InsufficientStockError } from '@/lib/fefo'

export async function POST(
  request: NextRequest,
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = shipSOSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  try {
    await shipSalesOrder(
      orgId,
      id,
      parsed.data.shipped_at ?? null,
      parsed.data.notes ?? null
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof SOStateError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    if (e instanceof InsufficientStockError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'ship_failed' },
      { status: 500 }
    )
  }
}
