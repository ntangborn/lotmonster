'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Save,
  Play,
} from 'lucide-react'
import type { AllocationPreview } from '@/lib/production/queries'

export interface RecipeOption {
  id: string
  name: string
  target_yield: number
  target_yield_unit: string
}

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}
function fmtCost(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`
}

export function NewRunForm({
  recipes,
  preselectedRecipe,
}: {
  recipes: RecipeOption[]
  preselectedRecipe?: string
}) {
  const router = useRouter()
  const [recipeId, setRecipeId] = useState<string>(preselectedRecipe ?? '')
  const [multiplier, setMultiplier] = useState('1')
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState<AllocationPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const previewVersion = useRef(0)

  useEffect(() => {
    if (!recipeId) {
      setPreview(null)
      return
    }
    const m = Number(multiplier)
    if (!(m > 0)) {
      setPreview(null)
      return
    }
    const myVersion = ++previewVersion.current
    setPreviewLoading(true)
    const params = new URLSearchParams({
      recipe_id: recipeId,
      multiplier: String(m),
    })
    fetch(`/api/production-runs/preview?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (myVersion !== previewVersion.current) return
        setPreview(d)
      })
      .catch(() => {})
      .finally(() => {
        if (myVersion === previewVersion.current) setPreviewLoading(false)
      })
  }, [recipeId, multiplier])

  async function submit(start: boolean) {
    if (!recipeId) {
      setErr('Select a recipe')
      return
    }
    const m = Number(multiplier)
    if (!(m > 0)) {
      setErr('Batch multiplier must be greater than 0')
      return
    }
    if (start && preview && !preview.all_ok) {
      setErr('Cannot start: insufficient stock for one or more ingredients')
      return
    }

    setSubmitting(true)
    setErr('')

    const res = await fetch('/api/production-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipe_id: recipeId,
        batch_multiplier: m,
        notes: notes.trim() || null,
        start_immediately: start,
      }),
    })
    setSubmitting(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.error === 'insufficient_stock') {
        setErr(
          `Insufficient stock: needed ${fmtNum(body.needed)}, only ${fmtNum(body.available)} available`
        )
      } else {
        setErr(
          body.error === 'validation_failed'
            ? body.issues?.[0]?.message ?? 'Validation failed'
            : body.error ?? 'Save failed'
        )
      }
      return
    }
    const { run } = await res.json()
    router.replace(`/dashboard/production-runs/${run.id}`)
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50'
  const selectCls = `${inputCls} bg-[#0D1B2A]`

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/production-runs"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Production Runs
      </Link>

      <h1 className="mb-6 text-2xl font-semibold text-white">
        New Production Run
      </h1>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} />
          {err}
        </div>
      )}

      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/60">
          Run Setup
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Recipe" required span={2}>
            <select
              required
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              className={selectCls}
            >
              <option value="">Select a recipe…</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {fmtNum(r.target_yield)} {r.target_yield_unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Batch Multiplier">
            <input
              type="number"
              step="any"
              min="0"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Notes" span={3}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      {recipeId && (
        <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
              FEFO Allocation Preview
            </h2>
            {preview && (
              <span className="text-xs text-white/50">
                Expected yield:{' '}
                <span className="font-mono text-white/80">
                  {fmtNum(preview.expected_yield)} {preview.target_yield_unit}
                </span>
              </span>
            )}
          </div>

          {previewLoading && !preview ? (
            <p className="py-6 text-center text-xs text-white/40">
              Computing allocation…
            </p>
          ) : !preview ? (
            <p className="py-6 text-center text-xs text-white/40">—</p>
          ) : preview.demands.length === 0 ? (
            <p className="py-6 text-center text-xs text-white/40">
              This recipe has no ingredient lines.
            </p>
          ) : (
            <>
              {!preview.all_ok && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Insufficient stock — one or more ingredients can&apos;t be
                    fully allocated. You can save as draft, but starting
                    production will fail.
                  </span>
                </div>
              )}
              <div className="space-y-3">
                {preview.demands.map((d) => (
                  <DemandRow key={d.ingredient_id} demand={d} />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard/production-runs"
          className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
        >
          Cancel
        </Link>
        <button
          onClick={() => submit(false)}
          disabled={submitting || !recipeId}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Create as Draft
        </button>
        <button
          onClick={() => submit(true)}
          disabled={
            submitting || !recipeId || (preview != null && !preview.all_ok)
          }
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          Start Production
        </button>
      </div>
    </div>
  )
}

function DemandRow({
  demand,
}: {
  demand: AllocationPreview['demands'][number]
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        demand.ok
          ? 'border-white/10 bg-white/[0.02]'
          : 'border-red-500/30 bg-red-500/5'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-medium text-white">{demand.ingredient_name}</span>
          {demand.ingredient_sku && (
            <span className="ml-1.5 text-xs text-white/40">
              ({demand.ingredient_sku})
            </span>
          )}
          <div className="mt-0.5 text-xs text-white/50">
            Required:{' '}
            <span className="font-mono text-white/80">
              {fmtNum(demand.required_qty, 4)} {demand.unit}
            </span>
            {' · '}
            Available:{' '}
            <span
              className={`font-mono ${demand.ok ? 'text-emerald-300' : 'text-red-300'}`}
            >
              {fmtNum(demand.available_qty, 4)} {demand.unit}
            </span>
            {!demand.ok && (
              <span className="ml-2 text-red-300">
                short by {fmtNum(demand.shortage, 4)} {demand.unit}
              </span>
            )}
          </div>
        </div>
      </div>
      {demand.ok && demand.allocations.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-white/5 pt-2">
          {demand.allocations.map((a) => (
            <div
              key={a.lotId}
              className="flex items-center justify-between text-xs"
            >
              <span className="font-mono text-white/60">{a.lotNumber}</span>
              <span className="text-white/50">
                {a.expiryDate
                  ? `exp ${new Date(a.expiryDate).toLocaleDateString()}`
                  : 'no expiry'}
              </span>
              <span className="font-mono text-white/70">
                {fmtNum(a.quantityUsed, 4)} {demand.unit}
              </span>
              <span className="font-mono text-white/60">
                {fmtCost(a.unitCost)}/{demand.unit}
              </span>
              <span className="w-20 text-right font-mono text-white">
                {fmtCost(a.quantityUsed * a.unitCost, 2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  required,
  span,
  children,
}: {
  label: string
  required?: boolean
  span?: 2 | 3
  children: React.ReactNode
}) {
  return (
    <label
      className={`block ${span === 2 ? 'sm:col-span-2' : span === 3 ? 'sm:col-span-3' : ''}`}
    >
      <span className="mb-1 block text-xs font-medium text-white/50">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      {children}
    </label>
  )
}
