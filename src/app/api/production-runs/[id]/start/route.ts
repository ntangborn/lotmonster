import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { startRun, RunStateError } from '@/lib/production/actions'
import { InsufficientStockError } from '@/lib/fefo'

export async function POST(
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
  try {
    await startRun(orgId, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return NextResponse.json(
        {
          error: 'insufficient_stock',
          needed: e.needed,
          available: e.available,
        },
        { status: 409 }
      )
    }
    if (e instanceof RunStateError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'start_failed' },
      { status: 500 }
    )
  }
}
