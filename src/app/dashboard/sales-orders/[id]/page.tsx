export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getSODetail } from '@/lib/sales-orders/queries'
import { SODetailView } from './_components/detail'

export default async function SODetailPage({
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
  const detail = await getSODetail(orgId, id)
  if (!detail) notFound()
  return <SODetailView initial={detail} />
}
