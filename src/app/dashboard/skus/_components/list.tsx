'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import type { SkuWithStock } from '@/lib/skus/queries'
import { SKU_KINDS, type SkuKind } from '@/lib/skus/schema'

interface Props {
  initialRows: SkuWithStock[]
}

const KIND_BADGE: Record<SkuKind, string> = {
  unit: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
  case: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  pallet: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

function fmtPrice(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function SkusList({ initialRows }: Props) {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'' | SkuKind>('')
  const [onlyActive, setOnlyActive] = useState(true)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return initialRows.filter((r) => {
      if (onlyActive && !r.active) return false
      if (kind && r.kind !== kind) return false
      if (!term) return true
      return (
        r.name.toLowerCase().includes(term) ||
        (r.upc ?? '').toLowerCase().includes(term)
      )
    })
  }, [initialRows, search, kind, onlyActive])

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            type="text"
            placeholder="Search by name or UPC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as '' | SkuKind)}
          className="rounded-lg border border-white/10 bg-[#0D1B2A] px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">All kinds</option>
          {SKU_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-white/60">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500"
          />
          Active only
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.02]">
            <tr className="text-xs uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Kind</th>
              <th className="px-4 py-3 font-medium">UPC</th>
              <th className="px-4 py-3 font-medium">Fill</th>
              <th className="px-4 py-3 text-right font-medium">Retail</th>
              <th className="px-4 py-3 text-right font-medium">On-hand</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-white/40">
                  {initialRows.length === 0
                    ? 'No SKUs yet. Click "New SKU" to create one.'
                    : 'No SKUs match your filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const fill =
                  r.fill_quantity != null && r.fill_unit
                    ? `${fmtNum(Number(r.fill_quantity))} ${r.fill_unit}`
                    : '—'
                const kindClass =
                  KIND_BADGE[r.kind as SkuKind] ??
                  'bg-white/5 text-white/60 border-white/10'
                return (
                  <tr
                    key={r.id}
                    className="group border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/skus/${r.id}`}
                        className="font-medium text-white hover:text-teal-300"
                      >
                        {r.name}
                      </Link>
                      {!r.active && (
                        <span className="ml-2 text-xs text-white/30">
                          inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${kindClass}`}
                      >
                        {r.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-white/60">
                      {r.upc ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-white/70">{fill}</td>
                    <td className="px-4 py-3 text-right font-mono text-white/80">
                      {fmtPrice(
                        r.retail_price != null ? Number(r.retail_price) : null
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white/80">
                      {fmtNum(r.on_hand)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
