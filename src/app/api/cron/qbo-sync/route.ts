/**
 * GET /api/cron/qbo-sync
 *
 * Vercel Cron dispatcher for QBO syncs. Runs on schedule (e.g. every 15
 * min on Vercel Pro), drains the qbo_sync_log queue by POSTing to the
 * internal per-entity sync routes, and bookkeeps attempt_count /
 * last_attempted_at / error_message on each row.
 *
 * Vercel Cron only issues GET requests, so this is GET-only. Auth is
 * `Authorization: Bearer ${CRON_SECRET}` — the same mechanism the
 * per-entity sync routes already accept.
 *
 * Queue scan:
 *   - qbo_sync_log WHERE status IN ('pending', 'failed')
 *                    AND attempt_count < 5
 *                    ORDER BY created_at ASC LIMIT 25
 *   - oldest first (FIFO) so long-pending rows don't starve behind new ones
 *   - capped at 5 attempts so permanent failures stop consuming budget
 *   - capped at 25 rows per run so one invocation can't blow the Vercel
 *     function timeout even if each QBO call is slow
 *
 * Per-row flow:
 *   1. Fetch orgs.qbo_realm_id. If absent → mark row `failed` with
 *      error_message='QBO not connected', bump attempt_count, skip.
 *   2. Map entity_type → internal route + id field:
 *        journal_entry → /api/qbo/sync/journal-entry  (run_id)
 *        invoice       → /api/qbo/sync/invoice         (sales_order_id)
 *        bill          → /api/qbo/sync/bill            (po_id)
 *      Unknown entity_type → mark failed, bump, move on.
 *   3. POST to the internal route with { <id-field>: entity_id, org_id }
 *      and the same Authorization: Bearer CRON_SECRET header. The inner
 *      route already updates status + qbo_doc_id + synced_at via its
 *      markSyncLog helper. This dispatcher is responsible ONLY for the
 *      attempt_count / last_attempted_at bookkeeping on every attempt,
 *      and for setting status='failed' + error_message on non-2xx
 *      responses or network errors.
 *
 * Returns `{ attempted, succeeded, failed, skipped }` — succeeded and
 * failed are mutually exclusive and cover ROUTE-call outcomes; skipped
 * counts rows that never reached the route (no QBO connection).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const BATCH_LIMIT = 25
const MAX_ATTEMPTS = 5

type EntityType = 'journal_entry' | 'invoice' | 'bill'

const ROUTE_MAP: Record<EntityType, { path: string; idField: string }> = {
  journal_entry: {
    path: '/api/qbo/sync/journal-entry',
    idField: 'run_id',
  },
  invoice: {
    path: '/api/qbo/sync/invoice',
    idField: 'sales_order_id',
  },
  bill: {
    path: '/api/qbo/sync/bill',
    idField: 'po_id',
  },
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── 1. Auth ───────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin

  // ── 2. Queue scan ────────────────────────────────────────────────
  const { data: rows, error: queryErr } = await admin
    .from('qbo_sync_log')
    .select('id, org_id, entity_type, entity_id, attempt_count')
    .in('status', ['pending', 'failed'])
    .lt('attempt_count', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (queryErr) {
    return NextResponse.json(
      { error: queryErr.message },
      { status: 500 }
    )
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    })
  }

  let attempted = 0
  let succeeded = 0
  let failed = 0
  let skipped = 0

  // ── 3. Per-row dispatch (sequential; QBO rate-limit friendly) ────
  for (const row of rows) {
    attempted++
    const now = new Date().toISOString()
    const nextAttemptCount = (row.attempt_count ?? 0) + 1

    // 3a. Org QBO connection check
    const { data: org } = await admin
      .from('orgs')
      .select('qbo_realm_id')
      .eq('id', row.org_id)
      .maybeSingle()

    if (!org?.qbo_realm_id) {
      await admin
        .from('qbo_sync_log')
        .update({
          status: 'failed',
          error_message: 'QBO not connected',
          attempt_count: nextAttemptCount,
          last_attempted_at: now,
        })
        .eq('id', row.id)
      skipped++
      continue
    }

    // 3b. Map entity_type → route
    const mapping = ROUTE_MAP[row.entity_type as EntityType]
    if (!mapping) {
      await admin
        .from('qbo_sync_log')
        .update({
          status: 'failed',
          error_message: `unsupported_entity_type: ${row.entity_type}`,
          attempt_count: nextAttemptCount,
          last_attempted_at: now,
        })
        .eq('id', row.id)
      failed++
      continue
    }

    // 3c. Fire the internal sync route
    let ok = false
    let errMsg: string | null = null
    try {
      const res = await fetch(`${origin}${mapping.path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [mapping.idField]: row.entity_id,
          org_id: row.org_id,
        }),
        // No keepalive — we want the fetch to complete before the next row.
      })
      if (res.ok) {
        ok = true
      } else {
        const body = (await res
          .json()
          .catch(() => ({}))) as { error?: string; message?: string }
        errMsg =
          body.error ??
          body.message ??
          `http_${res.status}`
      }
    } catch (e) {
      errMsg = e instanceof Error ? e.message : 'fetch_failed'
    }

    if (ok) {
      // Inner sync route already set status + qbo_doc_id + synced_at on
      // success via its markSyncLog helper. We only stamp the dispatcher
      // bookkeeping columns here.
      await admin
        .from('qbo_sync_log')
        .update({
          attempt_count: nextAttemptCount,
          last_attempted_at: now,
        })
        .eq('id', row.id)
      succeeded++
    } else {
      await admin
        .from('qbo_sync_log')
        .update({
          status: 'failed',
          error_message: (errMsg ?? 'sync_failed').slice(0, 500),
          attempt_count: nextAttemptCount,
          last_attempted_at: now,
        })
        .eq('id', row.id)
      failed++
    }
  }

  return NextResponse.json({ attempted, succeeded, failed, skipped })
}
