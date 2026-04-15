export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getIngredientAvgCosts } from '@/lib/recipes/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { RecipeBuilder, type IngredientChoice } from './_components/builder'

export default async function NewRecipePage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }

  const admin = createAdminClient()
  const { data: ingredients } = await admin
    .from('ingredients')
    .select('id, name, sku, unit')
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  const ingredientList = ingredients ?? []
  const avgCosts = await getIngredientAvgCosts(
    orgId,
    ingredientList.map((i) => i.id)
  )

  const choices: IngredientChoice[] = ingredientList.map((i) => ({
    id: i.id,
    name: i.name,
    sku: i.sku,
    unit: i.unit,
    avg_cost_per_unit: avgCosts.get(i.id) ?? null,
  }))

  return <RecipeBuilder ingredients={choices} />
}
