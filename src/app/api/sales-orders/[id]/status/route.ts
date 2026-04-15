import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'

const transitionSchema = z.object({
  to: z.enum(['confirmed', 'closed', 'cancelled']),
})

const ALLOWED: Record<string, Set<string>> = {
  draft: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['cancelled']),
  shipped: new Set(['closed']),
  invoiced: new Set(['closed']),
}

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
  const parsed = transitionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: so } = await admin
    .from('sales_orders')
    .select('status')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!so) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (!ALLOWED[so.status]?.has(parsed.data.to)) {
    return NextResponse.json(
      { error: 'invalid_transition', from: so.status, to: parsed.data.to },
      { status: 409 }
    )
  }

  const { error } = await admin
    .from('sales_orders')
    .update({ status: parsed.data.to })
    .eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
