import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'
import type { SkuKind } from './schema'

type SkuRow = Database['public']['Tables']['skus']['Row']
type LotRow = Database['public']['Tables']['lots']['Row']

export interface SkuWithStock extends SkuRow {
  on_hand: number
  lot_count: number
}

export interface ListParams {
  search?: string
  kind?: SkuKind
  active?: boolean
  limit?: number
  offset?: number
}

export async function listSkus(
  orgId: string,
  params: ListParams = {}
): Promise<{ rows: SkuWithStock[]; total: number }> {
  const admin = createAdminClient()
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
  const offset = Math.max(params.offset ?? 0, 0)

  let q = admin
    .from('skus')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  if (params.search?.trim()) {
    const term = params.search.trim()
    q = q.or(`name.ilike.%${term}%,upc.ilike.%${term}%`)
  }
  if (params.kind) q = q.eq('kind', params.kind)
  if (params.active !== undefined) q = q.eq('active', params.active)

  const { data: skus, count, error } = await q.range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)
  if (!skus || skus.length === 0) {
    return { rows: [], total: count ?? 0 }
  }

  const ids = skus.map((s) => s.id)
  const { data: lots } = await admin
    .from('lots')
    .select('sku_id, quantity_remaining')
    .eq('org_id', orgId)
    .eq('status', 'available')
    .in('sku_id', ids)

  const stock = new Map<string, { onHand: number; lotCount: number }>()
  for (const l of (lots ?? []) as Pick<LotRow, 'sku_id' | 'quantity_remaining'>[]) {
    if (!l.sku_id) continue
    const cur = stock.get(l.sku_id) ?? { onHand: 0, lotCount: 0 }
    cur.onHand += Number(l.quantity_remaining) || 0
    cur.lotCount += 1
    stock.set(l.sku_id, cur)
  }

  const rows: SkuWithStock[] = skus.map((s) => {
    const a = stock.get(s.id)
    return {
      ...s,
      on_hand: a?.onHand ?? 0,
      lot_count: a?.lotCount ?? 0,
    }
  })

  return { rows, total: count ?? rows.length }
}

export interface SkuDetail {
  sku: SkuWithStock
  recipe: { id: string; name: string } | null
  packaging: Array<{
    id: string
    ingredient_id: string
    ingredient_name: string
    ingredient_unit: string
    quantity: number
    unit: string | null
    notes: string | null
  }>
  finishedLots: Array<
    Pick<
      LotRow,
      | 'id'
      | 'lot_number'
      | 'quantity_received'
      | 'quantity_remaining'
      | 'unit'
      | 'unit_cost'
      | 'received_date'
      | 'expiry_date'
      | 'status'
      | 'production_run_id'
    >
  >
}

export async function getSkuDetail(
  orgId: string,
  id: string
): Promise<SkuDetail | null> {
  const admin = createAdminClient()

  const { data: sku } = await admin
    .from('skus')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!sku) return null

  const [recipeRes, bomRes, lotsRes] = await Promise.all([
    sku.recipe_id
      ? admin
          .from('recipes')
          .select('id, name')
          .eq('org_id', orgId)
          .eq('id', sku.recipe_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('sku_packaging')
      .select(
        'id, ingredient_id, quantity, unit, notes, ingredients(name, unit)'
      )
      .eq('org_id', orgId)
      .eq('sku_id', id),
    admin
      .from('lots')
      .select(
        'id, lot_number, quantity_received, quantity_remaining, unit, unit_cost, received_date, expiry_date, status, production_run_id'
      )
      .eq('org_id', orgId)
      .eq('sku_id', id)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('received_date', { ascending: true }),
  ])

  const recipe = recipeRes.data
    ? { id: recipeRes.data.id, name: recipeRes.data.name }
    : null

  const packaging = (bomRes.data ?? []).map((row) => {
    const ing = (
      row as unknown as { ingredients: { name: string; unit: string } | null }
    ).ingredients
    return {
      id: row.id,
      ingredient_id: row.ingredient_id,
      ingredient_name: ing?.name ?? 'Unknown',
      ingredient_unit: ing?.unit ?? '',
      quantity: Number(row.quantity) || 0,
      unit: row.unit,
      notes: row.notes,
    }
  })

  const finishedLots = lotsRes.data ?? []
  const available = finishedLots.filter((l) => l.status === 'available')
  const onHand = available.reduce(
    (s, l) => s + (Number(l.quantity_remaining) || 0),
    0
  )

  return {
    sku: { ...sku, on_hand: onHand, lot_count: available.length },
    recipe,
    packaging,
    finishedLots,
  }
}

/**
 * Returns the FK reference counts blocking deletion, or null if safe.
 */
export async function getSkuDeletionBlockers(
  orgId: string,
  id: string
): Promise<{
  lots: number
  outputs: number
  salesOrderLines: number
  children: number
  packaging: number
} | null> {
  const admin = createAdminClient()
  const [
    { count: lots },
    { count: outputs },
    { count: salesOrderLines },
    { count: children },
    { count: packaging },
  ] = await Promise.all([
    admin
      .from('lots')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('sku_id', id),
    admin
      .from('production_run_outputs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('sku_id', id),
    admin
      .from('sales_order_lines')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('sku_id', id),
    admin
      .from('skus')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('parent_sku_id', id),
    admin
      .from('sku_packaging')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('sku_id', id),
  ])

  const total =
    (lots ?? 0) +
    (outputs ?? 0) +
    (salesOrderLines ?? 0) +
    (children ?? 0) +
    (packaging ?? 0)

  if (total === 0) return null
  return {
    lots: lots ?? 0,
    outputs: outputs ?? 0,
    salesOrderLines: salesOrderLines ?? 0,
    children: children ?? 0,
    packaging: packaging ?? 0,
  }
}
