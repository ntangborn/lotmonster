export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { listRuns } from '@/lib/production/queries'
import { RunsList } from './_components/list'

export default async function ProductionRunsPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }
  const rows = await listRuns(orgId)
  return (
    <div className="mx-auto max-w-7xl">
      <RunsList initial={rows} />
    </div>
  )
}
