import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { previewProductionRun } from '@/lib/production/queries'

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
  const recipeId = searchParams.get('recipe_id')
  const multiplierRaw = searchParams.get('multiplier') ?? '1'
  const multiplier = Number(multiplierRaw)
  if (!recipeId || !(multiplier > 0)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  const preview = await previewProductionRun(orgId, recipeId, multiplier)
  if (!preview) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(preview)
}
