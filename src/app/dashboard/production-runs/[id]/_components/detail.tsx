'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type {
  RunDetail,
  AllocationPreview,
  CompleteRunContext,
} from '@/lib/production/queries'

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
  completeContext,
}: {
  initial: RunDetail
  planPreview: AllocationPreview | null
  completeContext: CompleteRunContext | null
}) {
  const router = useRouter()
  const { run, recipe, consumed, total_cogs_observed } = initial
  const [busy, setBusy] = useState<null | 'start' | 'complete' | 'cancel'>(null)
  const [err, setErr] = useState('')
  const [completeOpen, setCompleteOpen] = useState(false)

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

  async function submitComplete(body: {
    outputs: Array<{
      skuId: string
      quantity: number
      expiryDate: string | null
      liquidPctOverride: number | null
    }>
    notes: string | null
  }) {
    const ok = await action('complete', body)
    if (ok) setCompleteOpen(false)
    return ok
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

      {completeOpen && completeContext && (
        <CompleteModal
          context={completeContext}
          busy={busy === 'complete'}
          onSubmit={submitComplete}
          onClose={() => setCompleteOpen(false)}
        />
      )}
    </div>
  )
}

interface OutputDraft {
  quantity: string
  expiryDate: string
  overridePct: string // as percentage string (e.g. "50")
}

function CompleteModal({
  context,
  busy,
  onSubmit,
  onClose,
}: {
  context: CompleteRunContext
  busy: boolean
  onSubmit: (body: {
    outputs: Array<{
      skuId: string
      quantity: number
      expiryDate: string | null
      liquidPctOverride: number | null
    }>
    notes: string | null
  }) => Promise<boolean>
  onClose: () => void
}) {
  const todayIso = new Date().toISOString().slice(0, 10)

  function defaultExpiry(shelfLifeDays: number | null): string {
    if (shelfLifeDays == null) return ''
    const d = new Date()
    d.setDate(d.getDate() + shelfLifeDays)
    return d.toISOString().slice(0, 10)
  }

  const [drafts, setDrafts] = useState<Record<string, OutputDraft>>(() => {
    const seed: Record<string, OutputDraft> = {}
    for (const s of context.skus) {
      seed[s.id] = {
        quantity: '',
        expiryDate: defaultExpiry(s.shelf_life_days),
        overridePct: '',
      }
    }
    return seed
  })
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [notes, setNotes] = useState('')

  function patch(skuId: string, p: Partial<OutputDraft>) {
    setDrafts((cur) => ({ ...cur, [skuId]: { ...cur[skuId], ...p } }))
  }

  // ── derived state: cost preview + shortfall ───────────────────────
  const preview = useMemo(() => {
    const rows = context.skus.map((s) => {
      const d = drafts[s.id]
      const qty = Number(d?.quantity || '0')
      const fill = s.fill_quantity ?? 0
      const volumeWeight = fill * qty
      const packagingCogs = s.boms.reduce((sum, b) => {
        const stockInfo = context.packagingStock[b.ingredient_id]
        const avgCost = stockInfo?.avg_unit_cost ?? 0
        return sum + b.quantity_per_unit * qty * avgCost
      }, 0)
      return { sku: s, qty, volumeWeight, packagingCogs }
    })

    const totalWeight = rows.reduce((s, r) => s + r.volumeWeight, 0)
    const defaultPcts = rows.map((r) =>
      totalWeight > 0 ? r.volumeWeight / totalWeight : 0
    )

    // Override pct (all-or-none): if any row has an override string,
    // it's "all required" below.
    const overrideStrs = rows.map((_, i) =>
      context.skus[i] ? drafts[context.skus[i].id]?.overridePct ?? '' : ''
    )
    const anyOverride = overrideStrs.some((s) => s.trim() !== '')
    const allOverride = overrideStrs.every((s) => s.trim() !== '')
    let overridePcts: number[] | null = null
    let overrideError: string | null = null
    if (anyOverride && !allOverride) {
      overrideError =
        'Enter an override percentage for every SKU (or clear all to revert to default split).'
    } else if (allOverride) {
      const parsed = overrideStrs.map((s) => Number(s))
      if (parsed.some((n) => !Number.isFinite(n) || n < 0 || n > 100)) {
        overrideError =
          'Override percentages must be between 0 and 100.'
      } else {
        const sum = parsed.reduce((a, b) => a + b, 0)
        if (Math.abs(sum - 100) > 0.05) {
          overrideError = `Override percentages must sum to 100% (currently ${sum.toFixed(2)}%).`
        } else {
          overridePcts = parsed.map((n) => n / 100)
        }
      }
    }

    const effectivePcts =
      overridePcts ??
      (totalWeight > 0 ? defaultPcts : rows.map(() => 0))

    const computed = rows.map((r, i) => {
      const pct = effectivePcts[i]
      const liquidCogs = context.liquidTotal * pct
      const allocatedTotal = liquidCogs + r.packagingCogs
      const unitCogs = r.qty > 0 ? allocatedTotal / r.qty : 0
      return {
        sku: r.sku,
        qty: r.qty,
        pct,
        defaultPct: defaultPcts[i],
        liquidCogs,
        packagingCogs: r.packagingCogs,
        allocatedTotal,
        unitCogs,
      }
    })

    // Shortfall — aggregate need by ingredient across all outputs.
    const needByIngredient = new Map<string, number>()
    for (const r of rows) {
      for (const b of r.sku.boms) {
        const need = b.quantity_per_unit * r.qty
        if (need <= 0) continue
        needByIngredient.set(
          b.ingredient_id,
          (needByIngredient.get(b.ingredient_id) ?? 0) + need
        )
      }
    }
    const shortfalls: Array<{
      ingredientId: string
      ingredientName: string
      need: number
      available: number
    }> = []
    const ingredientNames = new Map<string, string>()
    for (const r of rows) {
      for (const b of r.sku.boms) {
        if (!ingredientNames.has(b.ingredient_id)) {
          ingredientNames.set(b.ingredient_id, b.ingredient_name)
        }
      }
    }
    for (const [id, need] of needByIngredient) {
      const stock = context.packagingStock[id]
      const available = stock?.available ?? 0
      if (need > available + 1e-9) {
        shortfalls.push({
          ingredientId: id,
          ingredientName: ingredientNames.get(id) ?? '?',
          need,
          available,
        })
      }
    }

    const totalCogs = computed.reduce((s, c) => s + c.allocatedTotal, 0)

    return {
      computed,
      shortfalls,
      overrideError,
      totalCogs,
    }
  }, [context, drafts])

  const anyQty = context.skus.some(
    (s) => Number(drafts[s.id]?.quantity || '0') > 0
  )
  const canSubmit =
    !busy &&
    anyQty &&
    preview.shortfalls.length === 0 &&
    preview.overrideError == null

  async function handleSubmit() {
    const outputs = context.skus
      .map((s) => {
        const d = drafts[s.id]
        const qty = Number(d?.quantity || '0')
        if (!(qty > 0)) return null
        const pctStr = d?.overridePct?.trim() ?? ''
        const hasOverride = pctStr !== ''
        return {
          skuId: s.id,
          quantity: qty,
          expiryDate: d?.expiryDate?.trim() || null,
          liquidPctOverride: hasOverride ? Number(pctStr) / 100 : null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (outputs.length === 0) return
    await onSubmit({
      outputs,
      notes: notes.trim() || null,
    })
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

  if (context.skus.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-20"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0D1B2A] p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="mb-3 text-lg font-semibold text-white">
            Complete Production
          </h3>
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
            <p className="font-medium">No SKUs linked to this recipe.</p>
            <p className="mt-1 text-yellow-300/80">
              Create a SKU first — it needs a fill quantity (e.g. 16 fl_oz per
              bottle) so the completed run can be packaged and costed.
            </p>
            <Link
              href="/dashboard/skus/new"
              className="mt-3 inline-block rounded-lg bg-yellow-500/20 px-3 py-1.5 text-xs font-semibold text-yellow-200 hover:bg-yellow-500/30"
            >
              New SKU
            </Link>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0D1B2A] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-semibold text-white">
          Complete Production
        </h3>
        <p className="mb-5 text-xs text-white/40">
          Liquid COGS so far:{' '}
          <span className="font-mono text-white/70">
            {fmtCost(context.liquidTotal)}
          </span>
          {' · allocated across outputs by volume share (or operator override).'}
        </p>

        {/* ── Section 1: SKU yields + expiry ────────────────────────── */}
        <ModalSection title="1. SKU yields">
          <div className="space-y-2">
            {context.skus.map((s) => {
              const d = drafts[s.id]
              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white/90">
                        {s.name}
                      </p>
                      <p className="mt-0.5 text-xs text-white/40">
                        Fill:{' '}
                        {s.fill_quantity != null && s.fill_unit
                          ? `${s.fill_quantity} ${s.fill_unit}`
                          : <span className="text-red-300">no fill_quantity set</span>}
                        {s.shelf_life_days != null && (
                          <> · shelf life {s.shelf_life_days}d</>
                        )}
                      </p>
                    </div>
                    <div className="w-28">
                      <span className="mb-1 block text-xs font-medium text-white/50">
                        Quantity
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={d.quantity}
                        onChange={(e) => patch(s.id, { quantity: e.target.value })}
                        className={inputCls}
                        placeholder="0"
                      />
                    </div>
                    <div className="w-44">
                      <span className="mb-1 block text-xs font-medium text-white/50">
                        Expiry date
                      </span>
                      <input
                        type="date"
                        min={todayIso}
                        value={d.expiryDate}
                        onChange={(e) => patch(s.id, { expiryDate: e.target.value })}
                        className={`${inputCls} bg-[#0D1B2A]`}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </ModalSection>

        {/* ── Section 2: Live cost-split preview ────────────────────── */}
        <ModalSection title="2. Cost preview">
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02]">
                <tr className="text-xs uppercase tracking-wider text-white/40">
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Liquid %</th>
                  <th className="px-3 py-2 text-right font-medium">Liquid $</th>
                  <th className="px-3 py-2 text-right font-medium">Packaging $</th>
                  <th className="px-3 py-2 text-right font-medium">Total $</th>
                  <th className="px-3 py-2 text-right font-medium">Unit COGS</th>
                </tr>
              </thead>
              <tbody>
                {preview.computed.map((c) => (
                  <tr
                    key={c.sku.id}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="px-3 py-2 text-white/80">{c.sku.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-white/80">
                      {fmtNum(c.qty)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white/70">
                      {(c.pct * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white/80">
                      {fmtCost(c.liquidCogs)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white/80">
                      {fmtCost(c.packagingCogs)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white/80">
                      {fmtCost(c.allocatedTotal)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white">
                      {fmtCost(c.unitCogs, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/10 bg-white/[0.02]">
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-2 text-right text-xs uppercase tracking-wider text-white/40"
                  >
                    Total COGS
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                    {fmtCost(preview.totalCogs)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-white/30">
            Preview uses weighted-average packaging cost. Final COGS are
            computed from FEFO-allocated lots at submit.
          </p>
        </ModalSection>

        {/* ── Section 3: Shortfall warning ──────────────────────────── */}
        {preview.shortfalls.length > 0 && (
          <ModalSection title="Packaging shortfall" tone="danger">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <div className="flex items-start gap-2 text-sm text-red-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">
                    Not enough packaging stock to complete this run.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-red-300/90">
                    {preview.shortfalls.map((s) => (
                      <li key={s.ingredientId} className="font-mono">
                        {s.ingredientName}: need {fmtNum(s.need, 4)}, have{' '}
                        {fmtNum(s.available, 4)} (short{' '}
                        <span className="font-bold">
                          {fmtNum(s.need - s.available, 4)}
                        </span>
                        )
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-red-300/70">
                    Receive more stock via a purchase order, or reduce the
                    yield before completing.
                  </p>
                </div>
              </div>
            </div>
          </ModalSection>
        )}

        {/* ── Section 4: Override panel ─────────────────────────────── */}
        <ModalSection>
          <button
            type="button"
            onClick={() => setOverrideOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                4. Override liquid split
              </span>
              <span className="text-xs text-white/40">
                (advanced — sums must equal 100%)
              </span>
            </span>
            {overrideOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {overrideOpen && (
            <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <p className="text-xs text-white/50">
                Leave all empty to use the default volume-share split shown
                above. To override, enter a value for every SKU.
              </p>
              {context.skus.map((s, i) => {
                const d = drafts[s.id]
                const defaultPct = preview.computed[i]?.defaultPct ?? 0
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.02] px-2 py-1.5"
                  >
                    <span className="flex-1 truncate text-sm text-white/70">
                      {s.name}
                    </span>
                    <span className="font-mono text-xs text-white/40">
                      default {(defaultPct * 100).toFixed(2)}%
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max="100"
                        value={d.overridePct}
                        onChange={(e) =>
                          patch(s.id, { overridePct: e.target.value })
                        }
                        placeholder="—"
                        className={`${inputCls} w-20 text-right`}
                      />
                      <span className="text-sm text-white/40">%</span>
                    </div>
                  </div>
                )
              })}
              {preview.overrideError && (
                <p className="text-xs text-red-300">
                  {preview.overrideError}
                </p>
              )}
            </div>
          )}
        </ModalSection>

        {/* ── Section 5: Notes ──────────────────────────────────────── */}
        <ModalSection title="5. Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any observations from this run (waste, tweaks, equipment issues…)"
            className={inputCls}
          />
        </ModalSection>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
            title={
              preview.shortfalls.length > 0
                ? 'Cannot complete — packaging short'
                : preview.overrideError
                  ? preview.overrideError
                  : !anyQty
                    ? 'Enter a quantity for at least one SKU'
                    : undefined
            }
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Complete
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalSection({
  title,
  tone,
  children,
}: {
  title?: string
  tone?: 'danger'
  children: React.ReactNode
}) {
  return (
    <section className="mb-5">
      {title && (
        <h4
          className={`mb-2 text-xs font-semibold uppercase tracking-wider ${
            tone === 'danger' ? 'text-red-300' : 'text-white/50'
          }`}
        >
          {title}
        </h4>
      )}
      {children}
    </section>
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
