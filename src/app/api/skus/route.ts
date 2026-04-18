import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { listSkus } from '@/lib/skus/queries'
import { createSku } from '@/lib/skus/actions'
import { SKU_KINDS } from '@/lib/skus/schema'

export async function GET(request: NextRequest) {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'auth_failed' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? undefined
  const kindRaw = searchParams.get('kind')
  const kind =
    kindRaw && (SKU_KINDS as readonly string[]).includes(kindRaw)
      ? (kindRaw as (typeof SKU_KINDS)[number])
      : undefined
  const activeRaw = searchParams.get('active')
  const active =
    activeRaw === '1' ? true : activeRaw === '0' ? false : undefined
  const limit = Number(searchParams.get('limit') ?? 200)
  const offset = Number(searchParams.get('offset') ?? 0)

  try {
    const { rows, total } = await listSkus(orgId, {
      search,
      kind,
      active,
      limit,
      offset,
    })
    return NextResponse.json({ rows, total })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'query_failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const { id } = await createSku(body as never)
    return NextResponse.json({ sku: { id } }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'create_failed'
    const status = msg === 'unauthenticated' || msg === 'no_org' ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
