export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { listLots } from '@/lib/lots/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { LotsList } from './_components/list'

export default async function LotsPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }

  const [lots, ingredients] = await Promise.all([
    listLots(orgId),
    (async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('ingredients')
        .select('id, name, sku, unit')
        .eq('org_id', orgId)
        .order('name', { ascending: true })
      return data ?? []
    })(),
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <LotsList initialLots={lots} ingredients={ingredients} />
    </div>
  )
}
