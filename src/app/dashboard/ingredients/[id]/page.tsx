export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getIngredientDetail, resolveOrgId } from '@/lib/ingredients/queries'
import { IngredientDetail } from './_components/detail'

export default async function IngredientDetailPage({
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

  const detail = await getIngredientDetail(orgId, id)
  if (!detail) notFound()

  return <IngredientDetail initial={detail} />
}
