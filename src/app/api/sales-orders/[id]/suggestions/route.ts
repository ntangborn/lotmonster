import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { suggestRunsForOrderLine } from '@/lib/traceability'

/**
 * Per-line production-run suggestions for the Ship modal:
 * { line_id: [{ run_number, ... }, ...] }
 */
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

  const admin = createAdminClient()
  const { data: lines } = await admin
    .from('sales_order_lines')
    .select('id, recipe_id')
    .eq('org_id', orgId)
    .eq('sales_order_id', id)

  if (!lines || lines.length === 0) {
    return NextResponse.json({ suggestions: {} })
  }

  const recipeIds = Array.from(
    new Set(
      lines
        .map((l) => l.recipe_id)
        .filter((r): r is string => r !== null)
    )
  )
  const byRecipe = new Map<
    string,
    Awaited<ReturnType<typeof suggestRunsForOrderLine>>
  >()
  await Promise.all(
    recipeIds.map(async (rid) => {
      const runs = await suggestRunsForOrderLine(orgId, rid, 10)
      byRecipe.set(rid, runs)
    })
  )

  const out: Record<string, ReturnType<typeof suggestRunsForOrderLine> extends Promise<infer T> ? T : never> = {}
  for (const l of lines) {
    out[l.id] = l.recipe_id ? byRecipe.get(l.recipe_id) ?? [] : []
  }
  return NextResponse.json({ suggestions: out })
}
