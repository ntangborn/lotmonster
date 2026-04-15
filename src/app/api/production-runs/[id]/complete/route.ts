import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { completeRun, RunStateError } from '@/lib/production/actions'
import { productionCompleteSchema } from '@/lib/production/schema'

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
  const parsed = productionCompleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  try {
    await completeRun(
      orgId,
      id,
      parsed.data.actual_yield,
      parsed.data.notes ?? null
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof RunStateError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'complete_failed' },
      { status: 500 }
    )
  }
}
