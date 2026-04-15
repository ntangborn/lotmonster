import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import {
  listSalesOrders,
  suggestSONumber,
} from '@/lib/sales-orders/queries'
import { soCreateSchema, type SOStatus } from '@/lib/sales-orders/schema'

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
  const status = (searchParams.get('status') as SOStatus | null) ?? undefined
  try {
    const rows = await listSalesOrders(orgId, status ?? undefined)
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
  const parsed = soCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const input = parsed.data
  const admin = createAdminClient()

  const recipeIds = Array.from(new Set(input.lines.map((l) => l.recipe_id)))
  const { data: validRecipes } = await admin
    .from('recipes')
    .select('id')
    .eq('org_id', orgId)
    .in('id', recipeIds)
  if ((validRecipes?.length ?? 0) !== recipeIds.length) {
    return NextResponse.json({ error: 'invalid_recipe' }, { status: 400 })
  }

  const orderNumber =
    input.order_number?.trim() || (await suggestSONumber(orgId))

  const { data: so, error } = await admin
    .from('sales_orders')
    .insert({
      org_id: orgId,
      order_number: orderNumber,
      customer_name: input.customer_name.trim(),
      customer_email: input.customer_email?.trim() || null,
      status: input.confirm_now ? 'confirmed' : 'draft',
      expected_ship_date: input.expected_ship_date || null,
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single()

  if (error || !so) {
    const status = error?.code === '23505' ? 409 : 500
    return NextResponse.json(
      { error: error?.message ?? 'insert_failed' },
      { status }
    )
  }

  const linePayload = input.lines.map((l) => ({
    org_id: orgId,
    sales_order_id: so.id,
    recipe_id: l.recipe_id,
    quantity: l.quantity,
    unit: l.unit?.trim() || 'unit',
    unit_price: l.unit_price ?? null,
  }))

  const { error: linesError } = await admin
    .from('sales_order_lines')
    .insert(linePayload)

  if (linesError) {
    await admin.from('sales_orders').delete().eq('id', so.id)
    return NextResponse.json({ error: linesError.message }, { status: 500 })
  }

  return NextResponse.json({ so }, { status: 201 })
}
