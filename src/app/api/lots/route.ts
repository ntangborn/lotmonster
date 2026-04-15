import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { lotCreateSchema } from '@/lib/lots/schema'
import { suggestLotNumber } from '@/lib/lots/queries'

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

  const parsed = lotCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const input = parsed.data

  const admin = createAdminClient()

  const { data: ing } = await admin
    .from('ingredients')
    .select('id')
    .eq('org_id', orgId)
    .eq('id', input.ingredient_id)
    .maybeSingle()
  if (!ing) {
    return NextResponse.json({ error: 'ingredient_not_found' }, { status: 404 })
  }

  const payload = {
    org_id: orgId,
    ingredient_id: input.ingredient_id,
    lot_number: input.lot_number.trim(),
    supplier_lot_number: input.supplier_lot_number?.trim() || null,
    quantity_received: input.quantity_received,
    quantity_remaining: input.quantity_received,
    unit: input.unit,
    unit_cost: input.unit_cost,
    received_date: input.received_date || new Date().toISOString().slice(0, 10),
    expiry_date: input.expiry_date || null,
    notes: input.notes?.trim() || null,
    status: 'available' as const,
  }

  const { data, error } = await admin
    .from('lots')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    const status = error.code === '23505' ? 409 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ lot: data }, { status: 201 })
}

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
  const suggest = searchParams.get('suggest_for')
  if (suggest) {
    const lotNumber = await suggestLotNumber(orgId, suggest)
    return NextResponse.json({ lot_number: lotNumber })
  }

  return NextResponse.json({ error: 'not_implemented' }, { status: 400 })
}
