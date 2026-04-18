export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { listSkus } from '@/lib/skus/queries'
import { SkusList } from './_components/list'

export default async function SkusPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }

  const { rows, total } = await listSkus(orgId, { limit: 200 })

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">SKUs</h1>
          <p className="mt-1 text-sm text-white/50">
            {total} {total === 1 ? 'SKU' : 'SKUs'}
          </p>
        </div>
        <Link
          href="/dashboard/skus/new"
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
        >
          <Plus size={16} />
          New SKU
        </Link>
      </div>

      <SkusList initialRows={rows} />
    </div>
  )
}
