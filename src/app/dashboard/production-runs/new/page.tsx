export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { NewRunForm, type RecipeOption } from './_components/form'

export default async function NewProductionRunPage({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string }>
}) {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }
  const sp = await searchParams
  const admin = createAdminClient()
  const { data } = await admin
    .from('recipes')
    .select('id, name, target_yield, target_yield_unit')
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  const recipes: RecipeOption[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    target_yield: Number(r.target_yield),
    target_yield_unit: r.target_yield_unit,
  }))

  return <NewRunForm recipes={recipes} preselectedRecipe={sp.recipe} />
}
