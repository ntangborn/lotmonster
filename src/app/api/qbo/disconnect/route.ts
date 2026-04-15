import { NextResponse } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { disconnectQBO } from '@/lib/qbo'

export async function POST() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  await disconnectQBO(orgId)
  return NextResponse.json({ ok: true })
}
