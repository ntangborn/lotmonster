export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { listPurchaseOrders } from '@/lib/purchase-orders/queries'
import { POList } from './_components/list'

export default async function PurchaseOrdersPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }
  const rows = await listPurchaseOrders(orgId)
  return (
    <div className="mx-auto max-w-7xl">
      <POList initial={rows} />
    </div>
  )
}
