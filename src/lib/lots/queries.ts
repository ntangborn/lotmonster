import { createAdminClient } from '@/lib/supabase/admin'
import { computeDisplayStatus, type DisplayStatus } from './schema'
import type { Database } from '@/types/database'

type LotRow = Database['public']['Tables']['lots']['Row']

export interface LotWithIngredient extends LotRow {
  ingredient_name: string
  ingredient_sku: string | null
  display_status: DisplayStatus
}

/**
 * Suggest next lot number: {INGPREFIX}-{YYYYMMDD}-{NNN}
 * where NNN is the next sequence number for this ingredient on this date.
 */
export async function suggestLotNumber(
  orgId: string,
  ingredientId: string,
  date: Date = new Date()
): Promise<string> {
  const admin = createAdminClient()

  const { data: ing } = await admin
    .from('ingredients')
    .select('name, sku')
    .eq('org_id', orgId)
    .eq('id', ingredientId)
    .maybeSingle()
  if (!ing) return ''

  const prefixRaw = (ing.sku?.trim() || ing.name)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  const prefix = prefixRaw.slice(0, 3) || 'ING'

  const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`

  const likePattern = `${prefix}-${yyyymmdd}-%`
  const { data: existing } = await admin
    .from('lots')
    .select('lot_number')
    .eq('org_id', orgId)
    .ilike('lot_number', likePattern)

  let maxSeq = 0
  for (const r of existing ?? []) {
    const m = r.lot_number.match(/-(\d+)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > maxSeq) maxSeq = n
    }
  }

  const seq = String(maxSeq + 1).padStart(3, '0')
  return `${prefix}-${yyyymmdd}-${seq}`
}

export async function listLots(
  orgId: string,
  opts: {
    ingredientId?: string
    status?: string
    expiryWithinDays?: number
  } = {}
): Promise<LotWithIngredient[]> {
  const admin = createAdminClient()

  let q = admin
    .from('lots')
    .select('*, ingredients(name, sku)')
    .eq('org_id', orgId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .order('received_date', { ascending: true })

  if (opts.ingredientId) q = q.eq('ingredient_id', opts.ingredientId)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const rows: LotWithIngredient[] = (data ?? []).map((r) => {
    const ing = (r as unknown as { ingredients: { name: string; sku: string | null } | null }).ingredients
    return {
      ...(r as LotRow),
      ingredient_name: ing?.name ?? 'Unknown',
      ingredient_sku: ing?.sku ?? null,
      display_status: computeDisplayStatus(
        Number(r.quantity_remaining) || 0,
        r.expiry_date,
        r.status
      ),
    }
  })

  return rows
}
