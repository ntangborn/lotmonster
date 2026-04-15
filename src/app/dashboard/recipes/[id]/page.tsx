export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getRecipeDetail } from '@/lib/recipes/queries'
import { RecipeDetailView } from './_components/detail'

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }

  const detail = await getRecipeDetail(orgId, id)
  if (!detail) notFound()

  return <RecipeDetailView initial={detail} />
}
