import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getIngredientDetail,
  getDeletionBlockers,
  resolveOrgId,
} from '@/lib/ingredients/queries'
import { ingredientUpdateSchema } from '@/lib/ingredients/schema'

async function authorize() {
  try {
    const { orgId } = await resolveOrgId()
    return { orgId }
  } catch (e) {
    return {
      error: NextResponse.json(
        { error: e instanceof Error ? e.message : 'auth_failed' },
        { status: 401 }
      ),
    }
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize()
  if ('error' in auth) return auth.error

  const { id } = await context.params
  const detail = await getIngredientDetail(auth.orgId, id)
  if (!detail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(detail)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize()
  if ('error' in auth) return auth.error

  const { id } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = ingredientUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Lock: kind cannot be changed once the ingredient has any lots —
  // retroactive flips would miscategorize historical inventory.
  if (parsed.data.kind !== undefined) {
    const { data: current } = await admin
      .from('ingredients')
      .select('kind')
      .eq('org_id', auth.orgId)
      .eq('id', id)
      .maybeSingle()
    if (!current) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (current.kind !== parsed.data.kind) {
      const { count } = await admin
        .from('lots')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', auth.orgId)
        .eq('ingredient_id', id)
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: 'cannot change kind: ingredient has lots' },
          { status: 409 }
        )
      }
    }
  }

  const { data, error } = await admin
    .from('ingredients')
    .update(parsed.data)
    .eq('org_id', auth.orgId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ ingredient: data })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize()
  if ('error' in auth) return auth.error

  const { id } = await context.params

  const blockers = await getDeletionBlockers(auth.orgId, id)
  if (blockers) {
    return NextResponse.json(
      { error: 'has_references', blockers },
      { status: 409 }
    )
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('ingredients')
    .delete()
    .eq('org_id', auth.orgId)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
