export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import {
  getSkuDetail,
  listPackagingIngredients,
  listRecipesForSelect,
} from '@/lib/skus/queries'
import { SkuDetailView } from './_components/detail'

export default async function SkuDetailPage({
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

  const [detail, packagingIngredients, recipes] = await Promise.all([
    getSkuDetail(orgId, id),
    listPackagingIngredients(orgId),
    listRecipesForSelect(orgId),
  ])
  if (!detail) notFound()

  return (
    <SkuDetailView
      initial={detail}
      packagingIngredients={packagingIngredients}
      recipes={recipes}
    />
  )
}
