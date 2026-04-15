'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { SOListItem } from '@/lib/sales-orders/queries'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-white/10 text-white/60 border-white/20',
  confirmed: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  allocated: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  shipped: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  invoiced: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  closed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-red-500/10 text-red-300 border-red-500/30',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  allocated: 'Allocated',
  shipped: 'Shipped',
  invoiced: 'Invoiced',
  closed: 'Closed',
  cancelled: 'Cancelled',
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

export function SOList({ initial }: { initial: SOListItem[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('')

  const filtered = useMemo(() => {
    if (!statusFilter) return initial
    return initial.filter((r) => r.status === statusFilter)
  }, [initial, statusFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      draft: 0,
      confirmed: 0,
      shipped: 0,
      closed: 0,
      cancelled: 0,
    }
    for (const r of initial) {
      const k = r.status === 'allocated' ? 'confirmed' : r.status
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [initial])

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sales Orders</h1>
          <p className="mt-1 text-sm text-white/50">
            {initial.length} {initial.length === 1 ? 'order' : 'orders'}
            {counts.confirmed > 0 && (
              <>
                {' · '}
                <span className="text-blue-300">
                  {counts.confirmed} ready to ship
                </span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/dashboard/sales-orders/new"
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
        >
          <Plus size={16} />
          New Sales Order
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip
          active={!statusFilter}
          onClick={() => setStatusFilter('')}
          count={initial.length}
        >
          All
        </Chip>
        {(['draft', 'confirmed', 'shipped', 'closed', 'cancelled'] as const).map(
          (s) => (
            <Chip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              count={counts[s] ?? 0}
            >
              {STATUS_LABEL[s]}
            </Chip>
          )
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.02]">
            <tr className="text-xs uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 font-medium">Order #</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Order Date</th>
              <th className="px-4 py-3 font-medium">Expected Ship</th>
              <th className="px-4 py-3 text-right font-medium">Lines</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-white/40">
                  {initial.length === 0
                    ? 'No sales orders yet.'
                    : 'No orders match this filter.'}
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.04]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/sales-orders/${o.id}`}
                      className="font-mono text-teal-300 hover:text-teal-200"
                    >
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white/80">{o.customer_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[o.status] ?? ''}`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/80">
                    {fmtCost(o.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {fmtDate(o.created_at)}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {fmtDate(o.expected_ship_date)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/60">
                    {o.line_count}
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

function Chip({
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
