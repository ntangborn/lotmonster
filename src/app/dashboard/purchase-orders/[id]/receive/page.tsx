export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getPODetail } from '@/lib/purchase-orders/queries'
import { suggestLotNumber } from '@/lib/lots/queries'
import { ReceiveForm, type ReceiveLineSeed } from './_components/form'

export default async function ReceivePOPage({
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

  const receivable =
    detail.po.status === 'sent' ||
    detail.po.status === 'partially_received'

  const today = new Date()
  const seeds: ReceiveLineSeed[] = await Promise.all(
    detail.lines.map(async (l) => {
      const suggested =
        l.qty_outstanding > 0
          ? await suggestLotNumber(orgId, l.ingredient_id, today)
          : ''
      return {
        line_id: l.id,
        ingredient_id: l.ingredient_id,
        ingredient_name: l.ingredient_name,
        ingredient_sku: l.ingredient_sku,
        unit: l.unit,
        qty_ordered: Number(l.qty_ordered),
        qty_previously_received: Number(l.qty_received ?? 0),
        qty_remaining: l.qty_outstanding,
        unit_cost: Number(l.unit_cost),
        suggested_lot_number: suggested,
      }
    })
  )

  return (
    <ReceiveForm
      poId={detail.po.id}
      poNumber={detail.po.po_number}
      supplier={detail.po.supplier}
      poStatus={detail.po.status}
      receivable={receivable}
      seeds={seeds}
    />
  )
}
