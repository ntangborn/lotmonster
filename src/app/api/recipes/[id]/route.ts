import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getRecipeDetail } from '@/lib/recipes/queries'
import { recipeUpdateSchema } from '@/lib/recipes/schema'
import type { Database } from '@/types/database'

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
  const detail = await getRecipeDetail(auth.orgId, id)
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

  const parsed = recipeUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { lines, ...recipePatch } = parsed.data

  if (Object.keys(recipePatch).length > 0) {
    const update: Database['public']['Tables']['recipes']['Update'] = {}
    if (recipePatch.name !== undefined) update.name = recipePatch.name.trim()
    if (recipePatch.target_yield !== undefined)
      update.target_yield = recipePatch.target_yield
    if (recipePatch.target_yield_unit !== undefined)
      update.target_yield_unit = recipePatch.target_yield_unit.trim()
    if (recipePatch.notes !== undefined)
      update.notes = recipePatch.notes?.trim() || null

    const { error } = await admin
      .from('recipes')
      .update(update)
      .eq('org_id', auth.orgId)
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (lines) {
    const ingIds = Array.from(new Set(lines.map((l) => l.ingredient_id)))
    if (ingIds.length > 0) {
      const { data: validIngs } = await admin
        .from('ingredients')
        .select('id')
        .eq('org_id', auth.orgId)
        .in('id', ingIds)
      if ((validIngs?.length ?? 0) !== ingIds.length) {
        return NextResponse.json(
          { error: 'invalid_ingredient' },
          { status: 400 }
        )
      }
    }

    const { error: delErr } = await admin
      .from('recipe_lines')
      .delete()
      .eq('org_id', auth.orgId)
      .eq('recipe_id', id)
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    if (lines.length > 0) {
      const payload = lines.map((l, i) => ({
        org_id: auth.orgId,
        recipe_id: id,
        ingredient_id: l.ingredient_id,
        quantity: l.quantity,
        unit: l.unit,
        sort_order: i,
      }))
      const { error: insErr } = await admin
        .from('recipe_lines')
        .insert(payload)
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }
  }

  const detail = await getRecipeDetail(auth.orgId, id)
  return NextResponse.json(detail)
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize()
  if ('error' in auth) return auth.error
  const { id } = await context.params

  const admin = createAdminClient()

  const { count: runCount } = await admin
    .from('production_runs')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', auth.orgId)
    .eq('recipe_id', id)

  if ((runCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'has_references', production_runs: runCount },
      { status: 409 }
    )
  }

  await admin
    .from('recipe_lines')
    .delete()
    .eq('org_id', auth.orgId)
    .eq('recipe_id', id)

  const { error } = await admin
    .from('recipes')
    .delete()
    .eq('org_id', auth.orgId)
    .eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
