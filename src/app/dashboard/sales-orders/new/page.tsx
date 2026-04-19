export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import {
  suggestSONumber,
  listCustomers,
  listSellableSkus,
} from '@/lib/sales-orders/queries'
import { NewSOForm } from './_components/form'

export default async function NewSalesOrderPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }

  const [suggested, customers, skus] = await Promise.all([
    suggestSONumber(orgId),
    listCustomers(orgId),
    listSellableSkus(orgId),
  ])

  return (
    <NewSOForm
      skus={skus}
      customers={customers}
      suggestedOrderNumber={suggested}
    />
  )
}
