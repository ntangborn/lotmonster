import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import {
  traceForward,
  traceReverse,
  traceRun,
} from '@/lib/traceability'

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
  const lot = searchParams.get('lot')
  const run = searchParams.get('run')
  const order = searchParams.get('order')

  try {
    if (lot) {
      const result = await traceForward(orgId, lot)
      return NextResponse.json({ kind: 'lot', result })
    }
    if (run) {
      const result = await traceRun(orgId, run)
      return NextResponse.json({ kind: 'run', result })
    }
    if (order) {
      const result = await traceReverse(orgId, order)
      return NextResponse.json({ kind: 'order', result })
    }
    return NextResponse.json(
      { error: 'missing_query', hint: 'Pass ?lot= or ?run= or ?order=' },
      { status: 400 }
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'trace_failed' },
      { status: 500 }
    )
  }
}
