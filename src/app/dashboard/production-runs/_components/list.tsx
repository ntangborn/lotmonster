'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { RunListItem } from '@/lib/production/queries'

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

function fmtNum(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
function fmtCost(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

export function RunsList({ initial }: { initial: RunListItem[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('')

  const filtered = useMemo(() => {
    if (!statusFilter) return initial
    return initial.filter((r) => r.status === statusFilter)
  }, [initial, statusFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      planned: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    }
    for (const r of initial) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [initial])

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Production Runs</h1>
          <p className="mt-1 text-sm text-white/50">
            {initial.length} {initial.length === 1 ? 'run' : 'runs'}
            {counts.in_progress > 0 && (
              <>
                {' · '}
                <span className="text-yellow-300">
                  {counts.in_progress} in progress
                </span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/dashboard/production-runs/new"
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
        >
          <Plus size={16} />
          New Production Run
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip
          active={statusFilter === ''}
          onClick={() => setStatusFilter('')}
          count={initial.length}
        >
          All
        </FilterChip>
        {(['planned', 'in_progress', 'completed', 'cancelled'] as const).map(
          (s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              count={counts[s]}
            >
              {STATUS_LABEL[s]}
            </FilterChip>
          )
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.02]">
            <tr className="text-xs uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 font-medium">Run #</th>
              <th className="px-4 py-3 font-medium">Recipe</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Multiplier</th>
              <th className="px-4 py-3 text-right font-medium">Yield</th>
              <th className="px-4 py-3 text-right font-medium">Total COGS</th>
              <th className="px-4 py-3 font-medium">Started</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-white/40">
                  {initial.length === 0
                    ? 'No production runs yet.'
                    : 'No runs match this filter.'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.04]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/production-runs/${r.id}`}
                      className="font-mono text-teal-300 hover:text-teal-200"
                    >
                      {r.run_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white/80">{r.recipe_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? ''}`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/70">
                    {fmtNum(Number(r.batch_multiplier))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/80">
                    {r.actual_yield != null
                      ? fmtNum(Number(r.actual_yield))
                      : r.expected_yield != null
                        ? `~${fmtNum(Number(r.expected_yield))}`
                        : '—'}
                    {r.yield_unit && (
                      <span className="ml-1 text-xs text-white/40">
                        {r.yield_unit}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/80">
                    {fmtCost(
                      r.total_cogs != null ? Number(r.total_cogs) : null
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {fmtDate(r.started_at)}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {fmtDate(r.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-teal-400 bg-teal-500/15 text-teal-300'
          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
      }`}
    >
      {children}
      <span className={`text-[10px] ${active ? 'text-teal-200' : 'text-white/40'}`}>
        {count}
      </span>
    </button>
  )
}
