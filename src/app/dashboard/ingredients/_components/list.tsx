'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import type { IngredientWithAggregates } from '@/lib/ingredients/queries'
import type { StockStatus } from '@/lib/ingredients/schema'

interface Props {
  initialRows: IngredientWithAggregates[]
  categories: string[]
}

const STATUS_BADGE: Record<StockStatus, string> = {
  in_stock: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  low_stock: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  out_of_stock: 'bg-red-500/10 text-red-300 border-red-500/30',
}
const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null) return '—'
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

function fmtCost(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`
}

export function IngredientsList({ initialRows, categories }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return initialRows.filter((r) => {
      if (category && r.category !== category) return false
      if (!term) return true
      return (
        r.name.toLowerCase().includes(term) ||
        (r.sku ?? '').toLowerCase().includes(term)
      )
    })
  }, [initialRows, search, category])

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            type="text"
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0D1B2A] px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.02]">
            <tr className="text-xs uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Unit</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
              <th className="px-4 py-3 text-right font-medium">Avg Cost</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-white/40">
                  {initialRows.length === 0
                    ? 'No ingredients yet. Click "Add Ingredient" to create one.'
                    : 'No ingredients match your filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="group border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.04]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/ingredients/${r.id}`}
                      className="font-medium text-white hover:text-teal-300"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white/60">{r.sku ?? '—'}</td>
                  <td className="px-4 py-3 text-white/60">{r.unit}</td>
                  <td className="px-4 py-3 text-white/60">
                    {r.category ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/80">
                    {fmtNum(r.current_stock)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/80">
                    {fmtCost(r.avg_cost)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
