import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { cancelRun, RunStateError } from '@/lib/production/actions'

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
    await cancelRun(orgId, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof RunStateError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'cancel_failed' },
      { status: 500 }
    )
  }
}
