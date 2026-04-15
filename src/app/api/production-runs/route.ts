import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import {
  listRuns,
  suggestRunNumber,
} from '@/lib/production/queries'
import { productionCreateSchema, type RunStatus } from '@/lib/production/schema'
import { startRun, RunStateError } from '@/lib/production/actions'
import { InsufficientStockError } from '@/lib/fefo'

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
  const status = (searchParams.get('status') as RunStatus | null) ?? undefined
  try {
    const rows = await listRuns(orgId, status ?? undefined)
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
  const parsed = productionCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const input = parsed.data
  const admin = createAdminClient()

  const { data: recipe } = await admin
    .from('recipes')
    .select('id, version, target_yield, target_yield_unit')
    .eq('org_id', orgId)
    .eq('id', input.recipe_id)
    .maybeSingle()
  if (!recipe) {
    return NextResponse.json({ error: 'recipe_not_found' }, { status: 404 })
  }

  const runNumber = await suggestRunNumber(orgId)
  const expectedYield = Number(recipe.target_yield) * input.batch_multiplier

  const { data: run, error } = await admin
    .from('production_runs')
    .insert({
      org_id: orgId,
      recipe_id: recipe.id,
      recipe_version: recipe.version,
      run_number: runNumber,
      status: 'planned',
      batch_multiplier: input.batch_multiplier,
      expected_yield: expectedYield,
      yield_unit: recipe.target_yield_unit,
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single()

  if (error || !run) {
    const status = error?.code === '23505' ? 409 : 500
    return NextResponse.json(
      { error: error?.message ?? 'insert_failed' },
      { status }
    )
  }

  if (input.start_immediately) {
    try {
      await startRun(orgId, run.id)
    } catch (e) {
      if (e instanceof InsufficientStockError) {
        return NextResponse.json(
          {
            error: 'insufficient_stock',
            needed: e.needed,
            available: e.available,
            run_id: run.id,
          },
          { status: 409 }
        )
      }
      if (e instanceof RunStateError) {
        return NextResponse.json(
          { error: e.message, run_id: run.id },
          { status: 409 }
        )
      }
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : 'start_failed',
          run_id: run.id,
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ run }, { status: 201 })
}
