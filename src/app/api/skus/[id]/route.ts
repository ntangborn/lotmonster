import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { getSkuDetail } from '@/lib/skus/queries'
import { updateSku, deleteSku } from '@/lib/skus/actions'

async function authorize() {
  try {
    const { orgId } = await resolveOrgId()
    return { orgId }
  } catch (e) {
    return {
      error: NextResponse.json(
        { error: e instanceof Error ? e.message : 'auth_failed' },
        { status: 401 }
      ),
    }
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize()
  if ('error' in auth) return auth.error

  const { id } = await context.params
  const detail = await getSkuDetail(auth.orgId, id)
  if (!detail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(detail)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    await updateSku(id, body as never)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'update_failed'
    const status =
      msg === 'unauthenticated' || msg === 'no_org'
        ? 401
        : msg === 'SKU not found'
          ? 404
          : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  try {
    await deleteSku(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete_failed'
    const status =
      msg === 'unauthenticated' || msg === 'no_org'
        ? 401
        : msg === 'SKU not found'
          ? 404
          : msg.startsWith('Cannot delete:')
            ? 409
            : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
