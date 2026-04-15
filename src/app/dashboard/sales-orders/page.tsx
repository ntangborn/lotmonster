export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { listSalesOrders } from '@/lib/sales-orders/queries'
import { SOList } from './_components/list'

export default async function SalesOrdersPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }
  const rows = await listSalesOrders(orgId)
  return (
    <div className="mx-auto max-w-7xl">
      <SOList initial={rows} />
    </div>
  )
}
