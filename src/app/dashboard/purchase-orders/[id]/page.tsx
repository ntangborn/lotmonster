export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getPODetail } from '@/lib/purchase-orders/queries'
import { PODetailView } from './_components/detail'

export default async function PODetailPage({
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
  const detail = await getPODetail(orgId, id)
  if (!detail) notFound()
  return <PODetailView initial={detail} />
}
