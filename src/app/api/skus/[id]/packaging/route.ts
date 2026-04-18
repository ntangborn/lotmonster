import { NextResponse, type NextRequest } from 'next/server'
import { setPackagingBOM } from '@/lib/skus/actions'

export async function PUT(
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

  const entries =
    body && typeof body === 'object' && 'entries' in body
      ? (body as { entries: unknown }).entries
      : body

  try {
    const result = await setPackagingBOM(id, entries as never)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'bom_save_failed'
    const status =
      msg === 'unauthenticated' || msg === 'no_org'
        ? 401
        : msg === 'SKU not found'
          ? 404
          : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
