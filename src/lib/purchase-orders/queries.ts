import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'
import type { POStatus } from './schema'

type PORow = Database['public']['Tables']['purchase_orders']['Row']
type POLineRow = Database['public']['Tables']['purchase_order_lines']['Row']

export interface POListItem extends PORow {
  line_count: number
}

export interface POLineWithIngredient extends POLineRow {
  ingredient_name: string
  ingredient_sku: string | null
  line_total: number
  qty_outstanding: number
}

export interface PODetail {
  po: PORow
  lines: POLineWithIngredient[]
  computed_total: number
}

/**
 * Generate next PO number: PO-{YYYY}-{NNN}, scoped per org per year.
 */
export async function suggestPONumber(orgId: string): Promise<string> {
  const admin = createAdminClient()
  const year = new Date().getFullYear()
  const prefix = `PO-${year}-`
  const { data } = await admin
    .from('purchase_orders')
    .select('po_number')
    .eq('org_id', orgId)
    .ilike('po_number', `${prefix}%`)

  let max = 0
  for (const r of data ?? []) {
    const m = r.po_number.match(/-(\d+)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

/**
 * Distinct supplier names from existing POs (for autocomplete).
 */
export async function listSuppliers(orgId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('purchase_orders')
    .select('supplier')
    .eq('org_id', orgId)
  const set = new Set<string>()
  for (const r of data ?? []) {
    const s = r.supplier?.trim()
    if (s) set.add(s)
  }
  return Array.from(set).sort()
}

export async function listPurchaseOrders(
  orgId: string,
  status?: POStatus
): Promise<POListItem[]> {
  const admin = createAdminClient()
  let q = admin
    .from('purchase_orders')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)

  const { data: pos, error } = await q
  if (error) throw new Error(error.message)
  if (!pos || pos.length === 0) return []

  const ids = pos.map((p) => p.id)
  const { data: lines } = await admin
    .from('purchase_order_lines')
    .select('po_id')
    .eq('org_id', orgId)
    .in('po_id', ids)

  const counts = new Map<string, number>()
  for (const l of lines ?? []) {
    counts.set(l.po_id, (counts.get(l.po_id) ?? 0) + 1)
  }

  return pos.map((p) => ({ ...p, line_count: counts.get(p.id) ?? 0 }))
}

export async function getPODetail(
  orgId: string,
  id: string
): Promise<PODetail | null> {
  const admin = createAdminClient()

  const { data: po } = await admin
    .from('purchase_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!po) return null

  const { data: lines } = await admin
    .from('purchase_order_lines')
    .select('*, ingredients(name, sku)')
    .eq('org_id', orgId)
    .eq('po_id', id)
    .order('created_at', { ascending: true })

  let computed = 0
  const linesOut: POLineWithIngredient[] = (lines ?? []).map((l) => {
    const ing = (
      l as unknown as {
        ingredients: { name: string; sku: string | null } | null
      }
    ).ingredients
    const lineTotal = Number(l.qty_ordered) * Number(l.unit_cost)
    computed += lineTotal
    return {
      ...(l as POLineRow),
      ingredient_name: ing?.name ?? 'Unknown',
      ingredient_sku: ing?.sku ?? null,
      line_total: lineTotal,
      qty_outstanding:
        Number(l.qty_ordered) - Number(l.qty_received ?? 0),
    }
  })

  return { po, lines: linesOut, computed_total: computed }
}

/**
 * Find ingredients below their low_stock_threshold for the "Add from
 * Low Stock" button on the PO builder.
 */
export interface LowStockSuggestion {
  ingredient_id: string
  name: string
  sku: string | null
  unit: string
  current_stock: number
  threshold: number
  suggested_qty: number
  last_unit_cost: number | null
}

export async function getLowStockSuggestions(
  orgId: string
): Promise<LowStockSuggestion[]> {
  const admin = createAdminClient()
  const { data: ingredients } = await admin
    .from('ingredients')
    .select('id, name, sku, unit, low_stock_threshold, cost_per_unit')
    .eq('org_id', orgId)
    .not('low_stock_threshold', 'is', null)

  if (!ingredients || ingredients.length === 0) return []
  const ids = ingredients.map((i) => i.id)

  const { data: lots } = await admin
    .from('lots')
    .select('ingredient_id, quantity_remaining, unit_cost, received_date')
    .eq('org_id', orgId)
    .eq('status', 'available')
    .in('ingredient_id', ids)
    .order('received_date', { ascending: false })

  const stock = new Map<string, number>()
  const lastCost = new Map<string, number>()
  for (const l of lots ?? []) {
    if (!l.ingredient_id) continue
    stock.set(
      l.ingredient_id,
      (stock.get(l.ingredient_id) ?? 0) +
        (Number(l.quantity_remaining) || 0)
    )
    if (!lastCost.has(l.ingredient_id)) {
      lastCost.set(l.ingredient_id, Number(l.unit_cost) || 0)
    }
  }

  const out: LowStockSuggestion[] = []
  for (const ing of ingredients) {
    const threshold = Number(ing.low_stock_threshold) || 0
    const current = stock.get(ing.id) ?? 0
    if (current >= threshold) continue
    // Suggest enough to reach 2x threshold (one threshold buffer).
    const suggested = Math.max(threshold * 2 - current, threshold)
    out.push({
      ingredient_id: ing.id,
      name: ing.name,
      sku: ing.sku,
      unit: ing.unit,
      current_stock: current,
      threshold,
      suggested_qty: suggested,
      last_unit_cost:
        lastCost.get(ing.id) ??
        (ing.cost_per_unit != null ? Number(ing.cost_per_unit) : null),
    })
  }
  out.sort((a, b) => a.current_stock / a.threshold - b.current_stock / b.threshold)
  return out
}
