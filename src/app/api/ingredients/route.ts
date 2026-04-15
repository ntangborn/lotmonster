import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  listIngredients,
  listCategories,
  resolveOrgId,
} from '@/lib/ingredients/queries'
import { ingredientCreateSchema } from '@/lib/ingredients/schema'

export async function GET(request: NextRequest) {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'auth_failed'
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? undefined
  const category = searchParams.get('category') ?? undefined
  const limit = Number(searchParams.get('limit') ?? 50)
  const offset = Number(searchParams.get('offset') ?? 0)
  const includeCategories = searchParams.get('include_categories') === '1'

  try {
    const { rows, total } = await listIngredients(orgId, {
      search,
      category,
      limit,
      offset,
    })
    const categories = includeCategories ? await listCategories(orgId) : undefined
    return NextResponse.json({ rows, total, categories })
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
    const msg = e instanceof Error ? e.message : 'auth_failed'
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = ingredientCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ingredients')
    .insert({ org_id: orgId, ...parsed.data })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ingredient: data }, { status: 201 })
}
