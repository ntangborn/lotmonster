export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getServerClaims } from '@/lib/supabase/claims'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from './_components/shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth guard — fast JWT decode, no network call
  const claims = await getServerClaims()
  if (!claims) redirect('/login')

  // Fetch org name — one DB query, RLS ensures we only see our own org
  const supabase = await createClient()
  const { data: org } = await supabase
    .from('orgs')
    .select('name')
    .eq('id', claims.org_id)
    .maybeSingle()

  const orgName = org?.name ?? 'My Company'

  return (
    <DashboardShell orgName={orgName} userEmail={claims.email}>
      {children}
    </DashboardShell>
  )
}
