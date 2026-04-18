import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeStockStatus, type StockStatus } from './schema'
import type { Database } from '@/types/database'

type IngredientRow = Database['public']['Tables']['ingredients']['Row']
type LotRow = Database['public']['Tables']['lots']['Row']

export interface IngredientWithAggregates extends IngredientRow {
  current_stock: number
  avg_cost: number | null
  status: StockStatus
}

/**
 * Resolves the caller's org_id. Throws if unauthenticated or not a member
 * of any org. Always prefer this over claims.org_id for writes, since new
 * signups may not have the JWT claim populated yet.
 */
export async function resolveOrgId(): Promise<{ orgId: string; userId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('unauthenticated')

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member?.org_id) throw new Error('no_org')

  return { orgId: member.org_id, userId: user.id }
}

export interface ListParams {
  search?: string
  category?: string
  limit?: number
  offset?: number
}

export async function listIngredients(
  orgId: string,
  params: ListParams = {}
): Promise<{ rows: IngredientWithAggregates[]; total: number }> {
  const admin = createAdminClient()
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
  const offset = Math.max(params.offset ?? 0, 0)

  let q = admin
    .from('ingredients')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  if (params.search?.trim()) {
    const term = params.search.trim()
    q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
  }
  if (params.category?.trim()) {
    q = q.eq('category', params.category.trim())
  }

  const { data: ingredients, count, error } = await q.range(
    offset,
    offset + limit - 1
  )
  if (error) throw new Error(error.message)
  if (!ingredients || ingredients.length === 0) {
    return { rows: [], total: count ?? 0 }
  }

  const ids = ingredients.map((i) => i.id)
  const { data: lots } = await admin
    .from('lots')
    .select('ingredient_id, quantity_remaining, unit_cost')
    .eq('org_id', orgId)
    .eq('status', 'available')
    .in('ingredient_id', ids)

  const agg = new Map<string, { stock: number; costSum: number }>()
  for (const lot of (lots ?? []) as Pick<
    LotRow,
    'ingredient_id' | 'quantity_remaining' | 'unit_cost'
  >[]) {
    if (!lot.ingredient_id) continue
    const cur = agg.get(lot.ingredient_id) ?? { stock: 0, costSum: 0 }
    const qty = Number(lot.quantity_remaining) || 0
    const cost = Number(lot.unit_cost) || 0
    cur.stock += qty
    cur.costSum += qty * cost
    agg.set(lot.ingredient_id, cur)
  }

  const rows: IngredientWithAggregates[] = ingredients.map((ing) => {
    const a = agg.get(ing.id)
    const currentStock = a?.stock ?? 0
    const avgCost = a && a.stock > 0 ? a.costSum / a.stock : null
    return {
      ...ing,
      current_stock: currentStock,
      avg_cost: avgCost,
      status: computeStockStatus(currentStock, ing.low_stock_threshold),
    }
  })

  return { rows, total: count ?? rows.length }
}

export async function listCategories(orgId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('ingredients')
    .select('category')
    .eq('org_id', orgId)
    .not('category', 'is', null)
  const set = new Set<string>()
  for (const r of data ?? []) {
    if (r.category) set.add(r.category)
  }
  return Array.from(set).sort()
}

export interface IngredientDetail {
  ingredient: IngredientWithAggregates
  lots: Array<
    Pick<
      LotRow,
      | 'id'
      | 'lot_number'
      | 'supplier_lot_number'
      | 'quantity_received'
      | 'quantity_remaining'
      | 'unit'
      | 'unit_cost'
      | 'received_date'
      | 'expiry_date'
      | 'status'
    >
  >
  usedIn: Array<{
    recipe_id: string
    recipe_name: string
    quantity: number
    unit: string
  }>
  purchaseHistory: Array<{
    po_id: string
    po_number: string
    supplier: string
    status: string
    qty_ordered: number
    qty_received: number
    unit: string
    unit_cost: number
    created_at: string
  }>
}

export async function getIngredientDetail(
  orgId: string,
  id: string
): Promise<IngredientDetail | null> {
  const admin = createAdminClient()

  const { data: ing } = await admin
    .from('ingredients')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!ing) return null

  const { data: lots } = await admin
    .from('lots')
    .select(
      'id, lot_number, supplier_lot_number, quantity_received, quantity_remaining, unit, unit_cost, received_date, expiry_date, status'
    )
    .eq('org_id', orgId)
    .eq('ingredient_id', id)
    .order('received_date', { ascending: false })

  const available = (lots ?? []).filter((l) => l.status === 'available')
  const currentStock = available.reduce(
    (s, l) => s + (Number(l.quantity_remaining) || 0),
    0
  )
  const costSum = available.reduce(
    (s, l) =>
      s + (Number(l.quantity_remaining) || 0) * (Number(l.unit_cost) || 0),
    0
  )
  const avgCost = currentStock > 0 ? costSum / currentStock : null

  const { data: recipeLines } = await admin
    .from('recipe_lines')
    .select('recipe_id, quantity, unit, recipes(name)')
    .eq('org_id', orgId)
    .eq('ingredient_id', id)
  const usedIn = (recipeLines ?? []).map((r) => ({
    recipe_id: r.recipe_id,
    recipe_name:
      (r as unknown as { recipes: { name: string } | null }).recipes?.name ??
      'Unknown',
    quantity: Number(r.quantity) || 0,
    unit: r.unit,
  }))

  const { data: poLines } = await admin
    .from('purchase_order_lines')
    .select(
      'po_id, qty_ordered, qty_received, unit, unit_cost, created_at, purchase_orders(po_number, supplier, status)'
    )
    .eq('org_id', orgId)
    .eq('ingredient_id', id)
    .order('created_at', { ascending: false })
  const purchaseHistory = (poLines ?? []).map((line) => {
    const po = (
      line as unknown as {
        purchase_orders: {
          po_number: string
          supplier: string
          status: string
        } | null
      }
    ).purchase_orders
    return {
      po_id: line.po_id,
      po_number: po?.po_number ?? '',
      supplier: po?.supplier ?? '',
      status: po?.status ?? '',
      qty_ordered: Number(line.qty_ordered) || 0,
      qty_received: Number(line.qty_received) || 0,
      unit: line.unit,
      unit_cost: Number(line.unit_cost) || 0,
      created_at: line.created_at,
    }
  })

  return {
    ingredient: {
      ...ing,
      current_stock: currentStock,
      avg_cost: avgCost,
      status: computeStockStatus(currentStock, ing.low_stock_threshold),
    },
    lots: lots ?? [],
    usedIn,
    purchaseHistory,
  }
}

/**
 * Returns the FK reference counts blocking deletion, or null if safe.
 */
export async function getDeletionBlockers(
  orgId: string,
  id: string
): Promise<{ lots: number; recipes: number; purchaseOrders: number } | null> {
  const admin = createAdminClient()
  const [{ count: lots }, { count: recipes }, { count: pos }] =
    await Promise.all([
      admin
        .from('lots')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('ingredient_id', id),
      admin
        .from('recipe_lines')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('ingredient_id', id),
      admin
        .from('purchase_order_lines')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('ingredient_id', id),
    ])
  const any = (lots ?? 0) + (recipes ?? 0) + (pos ?? 0)
  if (any === 0) return null
  return {
    lots: lots ?? 0,
    recipes: recipes ?? 0,
    purchaseOrders: pos ?? 0,
  }
}
