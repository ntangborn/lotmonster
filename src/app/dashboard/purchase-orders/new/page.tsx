export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  listSuppliers,
  suggestPONumber,
  getLowStockSuggestions,
} from '@/lib/purchase-orders/queries'
import { NewPOForm, type IngredientChoice } from './_components/form'

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ ingredient?: string }>
}) {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }
  const sp = await searchParams

  const admin = createAdminClient()
  const [suppliers, suggestedPo, lowStock, ingredientsRes] = await Promise.all([
    listSuppliers(orgId),
    suggestPONumber(orgId),
    getLowStockSuggestions(orgId),
    admin
      .from('ingredients')
      .select('id, name, sku, unit, cost_per_unit')
      .eq('org_id', orgId)
      .order('name', { ascending: true }),
  ])

  const ingredients: IngredientChoice[] = (ingredientsRes.data ?? []).map(
    (i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      unit: i.unit,
      default_unit_cost:
        i.cost_per_unit != null ? Number(i.cost_per_unit) : null,
    })
  )

  return (
    <NewPOForm
      ingredients={ingredients}
      suppliers={suppliers}
      suggestedPoNumber={suggestedPo}
      lowStock={lowStock}
      preselectedIngredient={sp.ingredient}
    />
  )
}
