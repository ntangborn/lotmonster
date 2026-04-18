export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import {
  getRunDetail,
  previewProductionRun,
  getCompleteRunContext,
} from '@/lib/production/queries'
import { RunDetailView } from './_components/detail'

export default async function RunDetailPage({
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

  const detail = await getRunDetail(orgId, id)
  if (!detail) notFound()

  const planPreview =
    detail.run.status === 'planned'
      ? await previewProductionRun(
          orgId,
          detail.recipe.id,
          Number(detail.run.batch_multiplier) || 1
        )
      : null

  const completeContext =
    detail.run.status === 'in_progress'
      ? await getCompleteRunContext(orgId, id)
      : null

  return (
    <RunDetailView
      initial={detail}
      planPreview={planPreview}
      completeContext={completeContext}
    />
  )
}
