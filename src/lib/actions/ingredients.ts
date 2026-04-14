'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export interface IngredientRow {
  name: string
  sku?: string
  unit: string
  category?: string
  low_stock_threshold?: number | null
  cost_per_unit?: number | null
}

export async function bulkInsertIngredients(
  rows: IngredientRow[]
): Promise<{ count: number }> {
  // 1. Verify authenticated session
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  // 2. Look up org_id from org_members (don't trust JWT app_metadata —
  //    it may not be set until the user refreshes their session after signup)
  const { data: member } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) throw new Error('No organization found for this user.')

  // 3. Bulk insert via admin client (bypasses RLS; org_id is verified above)
  const admin = createAdminClient()
  const payload = rows.map((r) => ({
    org_id: member.org_id,
    name: r.name.trim(),
    sku: r.sku?.trim() || null,
    unit: r.unit,
    category: r.category || null,
    low_stock_threshold: r.low_stock_threshold ?? null,
    cost_per_unit: r.cost_per_unit ?? null,
  }))

  const { error } = await admin.from('ingredients').insert(payload)
  if (error) throw new Error(error.message)

  return { count: payload.length }
}
