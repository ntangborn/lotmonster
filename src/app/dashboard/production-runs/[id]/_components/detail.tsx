'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import type { RunDetail, AllocationPreview } from '@/lib/production/queries'

const STATUS_BADGE: Record<string, string> = {
  planned: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  in_progress: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-white/10 text-white/50 border-white/20',
}
const STATUS_LABEL: Record<string, string> = {
  planned: 'Draft',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}
function fmtCost(n: number | null, digits = 2): string {
  if (n == null) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`
}
function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString()
}

export function RunDetailView({
  initial,
  planPreview,
}: {
  initial: RunDetail
  planPreview: AllocationPreview | null
}) {
  const router = useRouter()
  const { run, recipe, consumed, total_cogs_observed } = initial
  const [busy, setBusy] = useState<null | 'start' | 'complete' | 'cancel'>(null)
  const [err, setErr] = useState('')
  const [completeOpen, setCompleteOpen] = useState(false)
  const [actualYield, setActualYield] = useState(
    run.expected_yield != null ? String(Number(run.expected_yield)) : ''
  )
  const [completeNotes, setCompleteNotes] = useState('')

  async function action(
    kind: 'start' | 'complete' | 'cancel',
    body?: unknown
  ) {
    setBusy(kind)
    setErr('')
    const res = await fetch(`/api/production-runs/${run.id}/${kind}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
    setBusy(null)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      if (e.error === 'insufficient_stock') {
        setErr(
          `Insufficient stock: needed ${fmtNum(e.needed)}, only ${fmtNum(e.available)} available`
        )
      } else {
        setErr(e.error ?? `${kind} failed`)
      }
      return false
    }
    router.refresh()
    return true
  }

  async function handleComplete() {
    const y = Number(actualYield)
    if (!(y >= 0)) {
      setErr('Actual yield must be 0 or greater')
      return
    }
    const ok = await action('complete', {
      actual_yield: y,
      notes: completeNotes.trim() || null,
    })
    if (ok) setCompleteOpen(false)
  }

  async function handleCancel() {
    if (
      !confirm(
        run.status === 'in_progress'
          ? 'Cancel this run and return allocated quantities to lots?'
          : 'Cancel this draft run?'
      )
    ) {
      return
    }
    await action('cancel')
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/production-runs"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Production Runs
      </Link>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} />
          {err}
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold text-white">
                {run.run_number}
              </h1>
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[run.status] ?? ''}`}
              >
                {STATUS_LABEL[run.status] ?? run.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-white/70">
              <Link
                href={`/dashboard/recipes/${recipe.id}`}
                className="text-teal-300 hover:text-teal-200"
              >
                {recipe.name}
              </Link>
              <span className="ml-2 text-xs text-white/40">
                v{recipe.version}
              </span>
            </p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <Stat label="Multiplier">
                ×{fmtNum(Number(run.batch_multiplier), 4)}
              </Stat>
              <Stat label="Expected Yield">
                {run.expected_yield != null
                  ? `${fmtNum(Number(run.expected_yield))} ${run.yield_unit ?? ''}`
                  : '—'}
              </Stat>
              <Stat label="Actual Yield">
                {run.actual_yield != null
                  ? `${fmtNum(Number(run.actual_yield))} ${run.yield_unit ?? ''}`
                  : '—'}
              </Stat>
              <Stat label="Total COGS">
                {fmtCost(
                  run.total_cogs != null ? Number(run.total_cogs) : null
                )}
              </Stat>
            </div>
            {run.notes && (
              <p className="mt-3 text-sm text-white/50">{run.notes}</p>
            )}
            <div className="mt-3 flex gap-4 text-xs text-white/40">
              <span>Created: {fmtDateTime(run.created_at)}</span>
              {run.started_at && (
                <span>Started: {fmtDateTime(run.started_at)}</span>
              )}
              {run.completed_at && (
                <span>Completed: {fmtDateTime(run.completed_at)}</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            {run.status === 'planned' && (
              <>
                <button
                  onClick={() => action('start')}
                  disabled={
                    busy != null ||
                    (planPreview != null && !planPreview.all_ok)
                  }
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
                  title={
                    planPreview != null && !planPreview.all_ok
                      ? 'Insufficient stock'
                      : undefined
                  }
                >
                  {busy === 'start' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Play size={14} />
                  )}
                  Start Production
                </button>
                <button
                  onClick={handleCancel}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  <XCircle size={14} />
                  Cancel
                </button>
              </>
            )}
            {run.status === 'in_progress' && (
              <>
                <button
                  onClick={() => setCompleteOpen(true)}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
                >
                  {busy === 'complete' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  Complete Production
                </button>
                <button
                  onClick={handleCancel}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  {busy === 'cancel' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <XCircle size={14} />
                  )}
                  Cancel & Return Stock
                </button>
              </>
            )}
            {(run.status === 'completed' || run.status === 'cancelled') && (
              <span className="text-xs text-white/40">
                {run.waste_pct != null && (
                  <>Waste: {fmtNum(Number(run.waste_pct))}%</>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {run.status === 'planned' && planPreview && (
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">
            Planned FEFO Allocation
          </h2>
          {planPreview.demands.length === 0 ? (
            <p className="text-xs text-white/40">No ingredient lines.</p>
          ) : (
            <div className="space-y-2">
              {planPreview.demands.map((d) => (
                <div
                  key={d.ingredient_id}
                  className={`rounded-lg border px-3 py-2 ${
                    d.ok
                      ? 'border-white/10 bg-white/[0.02]'
                      : 'border-red-500/30 bg-red-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/80">{d.ingredient_name}</span>
                    <span className="font-mono text-xs text-white/60">
                      need {fmtNum(d.required_qty, 4)} {d.unit}
                      {' · '}
                      have{' '}
                      <span
                        className={
                          d.ok ? 'text-emerald-300' : 'text-red-300'
                        }
                      >
                        {fmtNum(d.available_qty, 4)}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">
          Ingredients Consumed
        </h2>
        {consumed.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/40">
            {run.status === 'planned'
              ? 'Lots will be allocated when production starts.'
              : 'No consumption recorded.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02]">
                <tr className="text-xs uppercase tracking-wider text-white/40">
                  <th className="px-3 py-2 font-medium">Ingredient</th>
                  <th className="px-3 py-2 font-medium">Lot Number</th>
                  <th className="px-3 py-2 text-right font-medium">Qty Used</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Unit Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Line Cost</th>
                </tr>
              </thead>
              <tbody>
                {consumed.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="px-3 py-2 text-white/80">
                      <Link
                        href={`/dashboard/ingredients/${c.ingredient_id}`}
                        className="hover:text-teal-300"
                      >
                        {c.ingredient_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-white/70">
                      {c.lot_number}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white/80">
                      {fmtNum(c.quantity_used, 4)}
                    </td>
                    <td className="px-3 py-2 text-white/60">{c.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-white/70">
                      {fmtCost(c.unit_cost_at_use, 4)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white">
                      {fmtCost(c.line_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/10 bg-white/[0.02]">
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-right text-white/60">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                    {fmtCost(total_cogs_observed)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {completeOpen && (
        <CompleteModal
          actualYield={actualYield}
          setActualYield={setActualYield}
          notes={completeNotes}
          setNotes={setCompleteNotes}
          expectedYield={
            run.expected_yield != null ? Number(run.expected_yield) : null
          }
          yieldUnit={run.yield_unit}
          busy={busy === 'complete'}
          onSubmit={handleComplete}
          onClose={() => setCompleteOpen(false)}
        />
      )}
    </div>
  )
}

function CompleteModal({
  actualYield,
  setActualYield,
  notes,
  setNotes,
  expectedYield,
  yieldUnit,
  busy,
  onSubmit,
  onClose,
}: {
  actualYield: string
  setActualYield: (s: string) => void
  notes: string
  setNotes: (s: string) => void
  expectedYield: number | null
  yieldUnit: string | null
  busy: boolean
  onSubmit: () => void
  onClose: () => void
}) {
  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'
  const yieldNum = Number(actualYield)
  const wasteHint =
    expectedYield != null && expectedYield > 0 && yieldNum >= 0
      ? Math.max(0, ((expectedYield - yieldNum) / expectedYield) * 100)
      : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0D1B2A] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold text-white">
          Complete Production
        </h3>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/50">
              Actual yield {yieldUnit ? `(${yieldUnit})` : ''}{' '}
              <span className="text-red-400">*</span>
            </span>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={actualYield}
              onChange={(e) => setActualYield(e.target.value)}
              className={inputCls}
              autoFocus
            />
            {expectedYield != null && (
              <p className="mt-1 text-xs text-white/40">
                Expected:{' '}
                <span className="font-mono">
                  {expectedYield.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
                {wasteHint != null && wasteHint > 0 && (
                  <span className="ml-2 text-yellow-400/80">
                    waste: {wasteHint.toFixed(1)}%
                  </span>
                )}
              </p>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/50">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={busy || actualYield === ''}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Complete
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-xs text-white/40">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-white/90">{children}</p>
    </div>
  )
}
