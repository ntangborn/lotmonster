export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  NewRunForm,
  type RecipeOption,
  type SkuHint,
} from './_components/form'

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

  const [recipesRes, skusRes] = await Promise.all([
    admin
      .from('recipes')
      .select('id, name, target_yield, target_yield_unit')
      .eq('org_id', orgId)
      .order('name', { ascending: true }),
    admin
      .from('skus')
      .select(
        'id, name, recipe_id, fill_quantity, fill_unit, shelf_life_days'
      )
      .eq('org_id', orgId)
      .eq('kind', 'unit')
      .eq('active', true)
      .not('recipe_id', 'is', null)
      .order('name', { ascending: true }),
  ])

  const recipes: RecipeOption[] = (recipesRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    target_yield: Number(r.target_yield),
    target_yield_unit: r.target_yield_unit,
  }))

  const skusByRecipe: Record<string, SkuHint[]> = {}
  for (const s of skusRes.data ?? []) {
    if (!s.recipe_id) continue
    const list = (skusByRecipe[s.recipe_id] ??= [])
    list.push({
      id: s.id,
      name: s.name,
      fill_quantity:
        s.fill_quantity != null ? Number(s.fill_quantity) : null,
      fill_unit: s.fill_unit,
      shelf_life_days:
        s.shelf_life_days != null ? Number(s.shelf_life_days) : null,
    })
  }

  return (
    <NewRunForm
      recipes={recipes}
      skusByRecipe={skusByRecipe}
      preselectedRecipe={sp.recipe}
    />
  )
}
