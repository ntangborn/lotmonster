import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { previewAllocation, type LotAllocation } from '@/lib/fefo'

export interface ShipPreviewLine {
  line_id: string
  sku_id: string | null
  sku_name: string
  needed: number
  available: number
  shortage: number
  ok: boolean
  allocations: LotAllocation[]
}

export interface ShipPreviewResponse {
  all_ok: boolean
  lines: ShipPreviewLine[]
}

/**
 * Per-line FEFO preview for the Ship modal. For each SO line, calls
 * previewAllocation({ kind: 'sku', id: line.sku_id }, quantity, orgId)
 * and returns availability + the FEFO plan. Does NOT mutate.
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
    .select('id, sku_id, quantity, skus(name)')
    .eq('org_id', orgId)
    .eq('sales_order_id', id)
    .order('created_at', { ascending: true })

  const out: ShipPreviewLine[] = []
  for (const l of lines ?? []) {
    const sku = (
      l as unknown as { skus: { name: string } | null }
    ).skus
    const needed = Number(l.quantity) || 0

    if (!l.sku_id) {
      out.push({
        line_id: l.id,
        sku_id: null,
        sku_name: sku?.name ?? 'unlinked line',
        needed,
        available: 0,
        shortage: needed,
        ok: false,
        allocations: [],
      })
      continue
    }

    const preview = await previewAllocation(
      { kind: 'sku', id: l.sku_id },
      needed,
      orgId
    )
    if (preview.ok) {
      const used = preview.allocations.reduce(
        (s, a) => s + a.quantityUsed,
        0
      )
      out.push({
        line_id: l.id,
        sku_id: l.sku_id,
        sku_name: sku?.name ?? 'unknown SKU',
        needed,
        available: used,
        shortage: 0,
        ok: true,
        allocations: preview.allocations,
      })
    } else {
      out.push({
        line_id: l.id,
        sku_id: l.sku_id,
        sku_name: sku?.name ?? 'unknown SKU',
        needed,
        available: preview.available,
        shortage: preview.needed - preview.available,
        ok: false,
        allocations: [],
      })
    }
  }

  const response: ShipPreviewResponse = {
    all_ok: out.length > 0 && out.every((l) => l.ok),
    lines: out,
  }
  return NextResponse.json(response)
}
