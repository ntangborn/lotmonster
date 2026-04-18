export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { listRecipesForSelect } from '@/lib/skus/queries'
import { NewSkuForm } from './_components/form'

export default async function NewSkuPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }

  const recipes = await listRecipesForSelect(orgId)

  return <NewSkuForm recipes={recipes} />
}
