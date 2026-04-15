import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getRunDetail } from '@/lib/production/queries'

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
  const detail = await getRunDetail(orgId, id)
  if (!detail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(detail)
}
