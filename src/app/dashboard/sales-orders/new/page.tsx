export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  suggestSONumber,
  listCustomers,
} from '@/lib/sales-orders/queries'
import { NewSOForm, type RecipeChoice } from './_components/form'

export default async function NewSalesOrderPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }

  const admin = createAdminClient()
  const [suggested, customers, recipesRes] = await Promise.all([
    suggestSONumber(orgId),
    listCustomers(orgId),
    admin
      .from('recipes')
      .select('id, name, target_yield_unit')
      .eq('org_id', orgId)
      .order('name', { ascending: true }),
  ])

  const recipes: RecipeChoice[] = (recipesRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    yield_unit: r.target_yield_unit,
  }))

  return (
    <NewSOForm
      recipes={recipes}
      customers={customers}
      suggestedOrderNumber={suggested}
    />
  )
}
