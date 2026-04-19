import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'
import type { SOStatus } from './schema'

type SORow = Database['public']['Tables']['sales_orders']['Row']
type SOLineRow = Database['public']['Tables']['sales_order_lines']['Row']

export interface SOListItem extends SORow {
  line_count: number
  total_amount: number
}

export interface SOLineWithRecipe extends SOLineRow {
  recipe_name: string
  sku_name: string | null
  line_total: number
}

export interface SODetail {
  so: SORow
  lines: SOLineWithRecipe[]
  computed_total: number
  // De-duped flat list of all lot numbers across all lines (for forward trace).
  allocated_lot_numbers: string[]
}

/**
 * Generate next SO number: SO-{YYYY}-{NNN}, scoped per org per year.
 */
export async function suggestSONumber(orgId: string): Promise<string> {
  const admin = createAdminClient()
  const year = new Date().getFullYear()
  const prefix = `SO-${year}-`
  const { data } = await admin
    .from('sales_orders')
    .select('order_number')
    .eq('org_id', orgId)
    .ilike('order_number', `${prefix}%`)

  let max = 0
  for (const r of data ?? []) {
    const m = r.order_number.match(/-(\d+)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

/**
 * Distinct customer names (for autocomplete).
 */
export async function listCustomers(orgId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('sales_orders')
    .select('customer_name')
    .eq('org_id', orgId)
  const set = new Set<string>()
  for (const r of data ?? []) {
    const n = r.customer_name?.trim()
    if (n) set.add(n)
  }
  return Array.from(set).sort()
}

export async function listSalesOrders(
  orgId: string,
  status?: SOStatus
): Promise<SOListItem[]> {
  const admin = createAdminClient()

  let q = admin
    .from('sales_orders')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)

  const { data: orders, error } = await q
  if (error) throw new Error(error.message)
  if (!orders || orders.length === 0) return []

  const ids = orders.map((o) => o.id)
  const { data: lines } = await admin
    .from('sales_order_lines')
    .select('sales_order_id, quantity, unit_price')
    .eq('org_id', orgId)
    .in('sales_order_id', ids)

  const counts = new Map<string, number>()
  const totals = new Map<string, number>()
  for (const l of lines ?? []) {
    counts.set(l.sales_order_id, (counts.get(l.sales_order_id) ?? 0) + 1)
    const lineTotal =
      Number(l.quantity) * Number(l.unit_price ?? 0)
    totals.set(
      l.sales_order_id,
      (totals.get(l.sales_order_id) ?? 0) + lineTotal
    )
  }

  return orders.map((o) => ({
    ...o,
    line_count: counts.get(o.id) ?? 0,
    total_amount: totals.get(o.id) ?? 0,
  }))
}

export async function getSODetail(
  orgId: string,
  id: string
): Promise<SODetail | null> {
  const admin = createAdminClient()

  const { data: so } = await admin
    .from('sales_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!so) return null

  const { data: lines } = await admin
    .from('sales_order_lines')
    .select('*, recipes(name), skus(name)')
    .eq('org_id', orgId)
    .eq('sales_order_id', id)
    .order('created_at', { ascending: true })

  let computed = 0
  const lotSet = new Set<string>()
  const linesOut: SOLineWithRecipe[] = (lines ?? []).map((l) => {
    const recipe = (
      l as unknown as { recipes: { name: string } | null }
    ).recipes
    const sku = (
      l as unknown as { skus: { name: string } | null }
    ).skus
    const lineTotal = Number(l.quantity) * Number(l.unit_price ?? 0)
    computed += lineTotal
    for (const ln of (l.lot_numbers_allocated ?? []) as string[]) {
      if (ln?.trim()) lotSet.add(ln.trim())
    }
    return {
      ...(l as SOLineRow),
      recipe_name: recipe?.name ?? 'Unknown',
      sku_name: sku?.name ?? null,
      line_total: lineTotal,
    }
  })

  return {
    so,
    lines: linesOut,
    computed_total: computed,
    allocated_lot_numbers: Array.from(lotSet).sort(),
  }
}

export interface SellableSku {
  id: string
  name: string
  recipe_id: string
  fill_quantity: number | null
  fill_unit: string | null
  retail_price: number | null
  on_hand: number
}

/**
 * Active unit-kind SKUs that can be added to a sales order line.
 * Requires a linked recipe_id because sales_order_lines.recipe_id is
 * still NOT NULL (migration 008 will relax it). Includes on-hand
 * quantity aggregated from available finished-goods lots.
 */
export async function listSellableSkus(
  orgId: string
): Promise<SellableSku[]> {
  const admin = createAdminClient()

  const { data: skus } = await admin
    .from('skus')
    .select(
      'id, name, recipe_id, fill_quantity, fill_unit, retail_price'
    )
    .eq('org_id', orgId)
    .eq('kind', 'unit')
    .eq('active', true)
    .not('recipe_id', 'is', null)
    .order('name', { ascending: true })

  const rows = skus ?? []
  if (rows.length === 0) return []

  const ids = rows.map((s) => s.id)
  const { data: lots } = await admin
    .from('lots')
    .select('sku_id, quantity_remaining')
    .eq('org_id', orgId)
    .eq('status', 'available')
    .in('sku_id', ids)

  const onHand = new Map<string, number>()
  for (const l of lots ?? []) {
    if (!l.sku_id) continue
    onHand.set(
      l.sku_id,
      (onHand.get(l.sku_id) ?? 0) + (Number(l.quantity_remaining) || 0)
    )
  }

  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    recipe_id: s.recipe_id as string,
    fill_quantity:
      s.fill_quantity != null ? Number(s.fill_quantity) : null,
    fill_unit: s.fill_unit,
    retail_price:
      s.retail_price != null ? Number(s.retail_price) : null,
    on_hand: onHand.get(s.id) ?? 0,
  }))
}
