export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { TraceSearch } from './_components/search'

export default async function TraceabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>
}) {
  try {
    await resolveOrgId()
  } catch {
    redirect('/login')
  }
  const sp = await searchParams
  const initialQuery = (sp.q ?? '').trim()
  const initialType = (sp.type as 'lot' | 'run' | 'order' | undefined) ?? 'lot'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Traceability</h1>
        <p className="mt-1 text-sm text-white/50">
          Lot genealogy across the whole supply chain — for recall response,
          customer audits, and root-cause investigations.
        </p>
      </div>
      <TraceSearch initialQuery={initialQuery} initialType={initialType} />
    </div>
  )
}
