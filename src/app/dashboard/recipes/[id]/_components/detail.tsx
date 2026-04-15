'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Play,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import type { RecipeDetail } from '@/lib/recipes/queries'

type Tab = 'overview' | 'history'

function fmtCost(n: number | null, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`
}
function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

const STATUS_BADGE: Record<string, string> = {
  planned: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  in_progress: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-white/10 text-white/50 border-white/20',
}

export function RecipeDetailView({ initial }: { initial: RecipeDetail }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')

  const { recipe, lines, total_cost, cost_per_yield_unit, cost_known } =
    initial

  async function handleDelete() {
    if (
      !confirm(
        `Delete recipe "${recipe.name}"? This cannot be undone and will fail if production runs reference it.`
      )
    ) {
      return
    }
    setDeleting(true)
    setErr('')
    const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' })
    if (!res.ok) {
      setDeleting(false)
      const e = await res.json().catch(() => ({}))
      if (e.error === 'has_references' && e.production_runs) {
        setErr(
          `Cannot delete: ${e.production_runs} production run(s) reference this recipe.`
        )
      } else {
        setErr(e.error ?? 'Delete failed')
      }
      return
    }
    router.replace('/dashboard/recipes')
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/dashboard/recipes"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Recipes
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
            <h1 className="text-2xl font-semibold text-white">{recipe.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
              <span>
                Yield:{' '}
                <span className="font-mono text-white/80">
                  {fmtNum(Number(recipe.target_yield))} {recipe.target_yield_unit}
                </span>
              </span>
              <span>Version: v{recipe.version}</span>
              <span>{lines.length} ingredients</span>
            </div>
            {recipe.notes && (
              <p className="mt-3 text-sm text-white/50">{recipe.notes}</p>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            <Link
              href={`/dashboard/production-runs/new?recipe=${recipe.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400"
            >
              <Play size={14} />
              Start Production Run
            </Link>
            <Link
              href={`/dashboard/recipes/${recipe.id}/edit`}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
              aria-label="Edit"
              title="Edit (coming soon)"
            >
              <Pencil size={14} />
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-white/10">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          Production History ({initial.production_history.length})
        </TabButton>
      </div>

      {tab === 'overview' ? (
        <Overview
          lines={lines}
          totalCost={total_cost}
          costPerYield={cost_per_yield_unit}
          costKnown={cost_known}
          yieldUnit={recipe.target_yield_unit}
        />
      ) : (
        <History runs={initial.production_history} />
      )}
    </div>
  )
}

function Overview({
  lines,
  totalCost,
  costPerYield,
  costKnown,
  yieldUnit,
}: {
  lines: RecipeDetail['lines']
  totalCost: number | null
  costPerYield: number | null
  costKnown: boolean
  yieldUnit: string
}) {
  const unknownCount = lines.filter((l) => !l.has_stock).length

  return (
    <div className="space-y-4">
      {unknownCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>
            {unknownCount} ingredient{unknownCount === 1 ? '' : 's'}{' '}
            without available lots — recipe cost is partial.
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.02]">
            <tr className="text-xs uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 font-medium">Ingredient</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 font-medium">Unit</th>
              <th className="px-4 py-3 text-right font-medium">Avg Cost/Unit</th>
              <th className="px-4 py-3 text-right font-medium">Line Cost</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3 text-white/80">
                  <Link
                    href={`/dashboard/ingredients/${l.ingredient_id}`}
                    className="hover:text-teal-300"
                  >
                    {l.ingredient_name}
                  </Link>
                  {l.ingredient_sku && (
                    <span className="ml-1.5 text-xs text-white/40">
                      ({l.ingredient_sku})
                    </span>
                  )}
                  {!l.has_stock && (
                    <span className="ml-2 text-[10px] text-yellow-400/80">
                      no lots
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-white/80">
                  {fmtNum(Number(l.quantity))}
                </td>
                <td className="px-4 py-3 text-white/60">{l.unit}</td>
                <td className="px-4 py-3 text-right font-mono text-white/70">
                  {fmtCost(l.avg_cost_per_unit)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-white">
                  {l.avg_cost_per_unit != null
                    ? fmtCost(Number(l.quantity) * l.avg_cost_per_unit, 2)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-white/10 bg-white/[0.02]">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right text-white/60">
                Total Recipe Cost{!costKnown && ' (partial)'}
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-white">
                {fmtCost(totalCost, 2)}
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right text-white/60">
                Cost per {yieldUnit} of yield
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-white">
                {fmtCost(costPerYield, 4)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function History({ runs }: { runs: RecipeDetail['production_history'] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center text-sm text-white/40">
        No production runs yet. Click &quot;Start Production Run&quot; to begin.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-white/[0.02]">
          <tr className="text-xs uppercase tracking-wider text-white/40">
            <th className="px-4 py-3 font-medium">Run #</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Multiplier</th>
            <th className="px-4 py-3 text-right font-medium">Actual Yield</th>
            <th className="px-4 py-3 text-right font-medium">Total COGS</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Completed</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-white/5 last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/production-runs/${r.id}`}
                  className="font-mono text-teal-300 hover:text-teal-200"
                >
                  {r.run_number}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? 'bg-white/10 text-white/60 border-white/20'}`}
                >
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-white/80">
                {fmtNum(r.batch_multiplier)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-white/80">
                {fmtNum(r.actual_yield)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-white/80">
                {fmtCost(r.total_cogs, 2)}
              </td>
              <td className="px-4 py-3 text-white/60">{fmtDate(r.started_at)}</td>
              <td className="px-4 py-3 text-white/60">
                {fmtDate(r.completed_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-teal-400 text-teal-300'
          : 'border-transparent text-white/50 hover:text-white/80'
      }`}
    >
      {children}
    </button>
  )
}
