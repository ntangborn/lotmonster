import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { receivePOSchema } from '@/lib/purchase-orders/schema'
import { receiveDelivery, POStateError } from '@/lib/purchase-orders/actions'

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

  const parsed = receivePOSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  try {
    const result = await receiveDelivery(
      orgId,
      id,
      parsed.data.lines,
      parsed.data.notes ?? null
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof POStateError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'receive_failed' },
      { status: 500 }
    )
  }
}
