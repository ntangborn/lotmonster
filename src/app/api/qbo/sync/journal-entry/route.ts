/**
 * POST /api/qbo/sync/journal-entry
 *
 * Posts a balanced journal entry for a completed production run:
 *   Debit  Cost of Goods Sold      (total_cogs)
 *   Credit Raw Materials Inventory (total_cogs)
 *
 * Idempotent: if production_runs.qbo_journal_entry_id is already
 * populated, returns the existing JE id without re-posting.
 *
 * Auth modes:
 *   1. Cron — Authorization: Bearer ${CRON_SECRET}; org_id required in body
 *   2. User — authenticated session; org_id resolved from org_members
 *
 * Body: { run_id: string, org_id?: string }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { qboJson, QBOTokenExpiredError, QBONotConnectedError } from '@/lib/qbo'
import type { Database } from '@/types/database'

const bodySchema = z.object({
  run_id: z.uuid(),
  org_id: z.uuid().optional(),
})

interface JournalEntryResponse {
  JournalEntry: {
    Id: string
    SyncToken: string
    DocNumber?: string
    TxnDate: string
  }
  time?: string
}

async function authorize(
  request: NextRequest,
  bodyOrgId: string | undefined
): Promise<{ orgId: string } | { error: NextResponse }> {
  const auth = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    if (!bodyOrgId) {
      return {
        error: NextResponse.json(
          { error: 'org_id required for cron requests' },
          { status: 400 }
        ),
      }
    }
    return { orgId: bodyOrgId }
  }

  try {
    const { orgId } = await resolveOrgId()
    return { orgId }
  } catch {
    return {
      error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const { run_id, org_id: bodyOrg } = parsed.data

  const auth = await authorize(request, bodyOrg)
  if ('error' in auth) return auth.error
  const { orgId } = auth

  const admin = createAdminClient()

  // Load org account mapping
  const { data: org } = await admin
    .from('orgs')
    .select(
      'qbo_realm_id, qbo_cogs_account_id, qbo_inventory_account_id'
    )
    .eq('id', orgId)
    .maybeSingle()
  if (!org?.qbo_realm_id) {
    return NextResponse.json(
      { error: 'qbo_not_connected', message: 'Connect QuickBooks first' },
      { status: 409 }
    )
  }
  if (!org.qbo_cogs_account_id || !org.qbo_inventory_account_id) {
    return NextResponse.json(
      {
        error: 'accounts_not_mapped',
        message:
          'Configure QBO COGS and Raw Materials Inventory accounts in Settings',
      },
      { status: 409 }
    )
  }

  // Load the run
  const { data: run } = await admin
    .from('production_runs')
    .select(
      'id, run_number, status, total_cogs, completed_at, qbo_journal_entry_id'
    )
    .eq('org_id', orgId)
    .eq('id', run_id)
    .maybeSingle()
  if (!run) {
    return NextResponse.json({ error: 'run_not_found' }, { status: 404 })
  }
  if (run.status !== 'completed') {
    return NextResponse.json(
      {
        error: 'run_not_completed',
        message: 'Only completed runs can be posted to QBO',
      },
      { status: 409 }
    )
  }

  // Idempotent: already posted
  if (run.qbo_journal_entry_id) {
    await markSyncLog(orgId, run_id, 'success', run.qbo_journal_entry_id, null)
    return NextResponse.json({
      ok: true,
      qbo_journal_entry_id: run.qbo_journal_entry_id,
      idempotent: true,
    })
  }

  const total = Number(run.total_cogs ?? 0)
  if (!(total > 0)) {
    return NextResponse.json(
      {
        error: 'zero_cogs',
        message: 'total_cogs must be > 0 to post a journal entry',
      },
      { status: 409 }
    )
  }

  const txnDate = (run.completed_at ?? new Date().toISOString()).slice(0, 10)
  const description = `COGS for production run ${run.run_number}`
  const credDescription = `Raw materials consumed in run ${run.run_number}`

  const payload = {
    TxnDate: txnDate,
    DocNumber: run.run_number,
    PrivateNote: `Lotmonster production run ${run.run_number}`,
    Line: [
      {
        Description: description,
        Amount: round2(total),
        DetailType: 'JournalEntryLineDetail',
        JournalEntryLineDetail: {
          PostingType: 'Debit',
          AccountRef: { value: org.qbo_cogs_account_id },
        },
      },
      {
        Description: credDescription,
        Amount: round2(total),
        DetailType: 'JournalEntryLineDetail',
        JournalEntryLineDetail: {
          PostingType: 'Credit',
          AccountRef: { value: org.qbo_inventory_account_id },
        },
      },
    ],
  }

  let resp: JournalEntryResponse
  try {
    resp = await qboJson<JournalEntryResponse>(orgId, 'journalentry', {
      method: 'POST',
      body: payload,
    })
  } catch (e) {
    const msg =
      e instanceof QBOTokenExpiredError
        ? 'qbo_disconnected'
        : e instanceof QBONotConnectedError
          ? 'qbo_not_connected'
          : e instanceof Error
            ? e.message
            : 'qbo_request_failed'
    await markSyncLog(orgId, run_id, 'failed', null, msg.slice(0, 500))
    const status =
      e instanceof QBOTokenExpiredError ? 401 :
      e instanceof QBONotConnectedError ? 409 : 502
    return NextResponse.json({ error: msg }, { status })
  }

  const jeId = resp?.JournalEntry?.Id
  if (!jeId) {
    await markSyncLog(orgId, run_id, 'failed', null, 'missing_id_in_response')
    return NextResponse.json(
      { error: 'missing_id_in_response', raw: resp },
      { status: 502 }
    )
  }

  // Persist
  const { error: updErr } = await admin
    .from('production_runs')
    .update({ qbo_journal_entry_id: jeId })
    .eq('org_id', orgId)
    .eq('id', run_id)
  if (updErr) {
    // The JE was posted to QBO but we couldn't store the ID locally —
    // log it loudly so the cron can reconcile by DocNumber.
    await markSyncLog(
      orgId,
      run_id,
      'failed',
      jeId,
      `posted_but_local_update_failed: ${updErr.message}`.slice(0, 500)
    )
    return NextResponse.json(
      { error: 'local_persist_failed', qbo_journal_entry_id: jeId },
      { status: 500 }
    )
  }

  await markSyncLog(orgId, run_id, 'success', jeId, null)

  return NextResponse.json({ ok: true, qbo_journal_entry_id: jeId })
}

async function markSyncLog(
  orgId: string,
  runId: string,
  status: 'success' | 'failed' | 'pending' | 'retrying',
  qboDocId: string | null,
  errorMessage: string | null
): Promise<void> {
  const admin = createAdminClient()

  // Find the most-recent log row for this run+entity_type, or create one
  const { data: existing } = await admin
    .from('qbo_sync_log')
    .select('id, retry_count')
    .eq('org_id', orgId)
    .eq('entity_type', 'journal_entry')
    .eq('entity_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const update: Database['public']['Tables']['qbo_sync_log']['Update'] = {
      status,
      qbo_doc_id: qboDocId,
      error_message: errorMessage,
    }
    if (status === 'success') {
      update.synced_at = new Date().toISOString()
    } else if (status === 'failed') {
      update.retry_count = (existing.retry_count ?? 0) + 1
    }
    await admin.from('qbo_sync_log').update(update).eq('id', existing.id)
  } else {
    await admin.from('qbo_sync_log').insert({
      org_id: orgId,
      entity_type: 'journal_entry',
      entity_id: runId,
      status,
      qbo_doc_id: qboDocId,
      error_message: errorMessage,
      synced_at: status === 'success' ? new Date().toISOString() : null,
    })
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
