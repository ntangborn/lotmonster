import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { listRecipes } from '@/lib/recipes/queries'
import { recipeCreateSchema } from '@/lib/recipes/schema'

export async function GET() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'auth_failed' },
      { status: 401 }
    )
  }

  try {
    const rows = await listRecipes(orgId)
    return NextResponse.json({ rows })
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'auth_failed' },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = recipeCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const { name, target_yield, target_yield_unit, notes, lines } = parsed.data

  const admin = createAdminClient()

  const ingIds = Array.from(new Set(lines.map((l) => l.ingredient_id)))
  const { data: validIngs } = await admin
    .from('ingredients')
    .select('id')
    .eq('org_id', orgId)
    .in('id', ingIds)
  if ((validIngs?.length ?? 0) !== ingIds.length) {
    return NextResponse.json(
      { error: 'invalid_ingredient' },
      { status: 400 }
    )
  }

  const { data: recipe, error } = await admin
    .from('recipes')
    .insert({
      org_id: orgId,
      name: name.trim(),
      target_yield,
      target_yield_unit: target_yield_unit.trim(),
      notes: notes?.trim() || null,
    })
    .select('*')
    .single()

  if (error || !recipe) {
    return NextResponse.json(
      { error: error?.message ?? 'insert_failed' },
      { status: 500 }
    )
  }

  const linePayload = lines.map((l, i) => ({
    org_id: orgId,
    recipe_id: recipe.id,
    ingredient_id: l.ingredient_id,
    quantity: l.quantity,
    unit: l.unit,
    sort_order: i,
  }))

  const { error: linesError } = await admin
    .from('recipe_lines')
    .insert(linePayload)

  if (linesError) {
    await admin.from('recipes').delete().eq('id', recipe.id)
    return NextResponse.json(
      { error: linesError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ recipe }, { status: 201 })
}
