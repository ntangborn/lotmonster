'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Send,
  Truck,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
} from 'lucide-react'
import type { PODetail } from '@/lib/purchase-orders/queries'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-white/10 text-white/60 border-white/20',
  sent: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  partially_received: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  received: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  closed: 'bg-white/5 text-white/40 border-white/10',
  cancelled: 'bg-red-500/10 text-red-300 border-red-500/30',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_received: 'Partially Received',
  received: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

function fmtNum(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}
function fmtCost(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

export function PODetailView({ initial }: { initial: PODetail }) {
  const router = useRouter()
  const { po, lines, computed_total } = initial
  const [busy, setBusy] = useState<null | string>(null)
  const [err, setErr] = useState('')

  async function transition(to: 'sent' | 'cancelled' | 'closed') {
    setBusy(`status:${to}`)
    setErr('')
    const res = await fetch(`/api/purchase-orders/${po.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    })
    setBusy(null)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setErr(e.error ?? 'Status change failed')
      return
    }
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm(`Delete PO ${po.po_number}? This cannot be undone.`)) return
    setBusy('delete')
    setErr('')
    const res = await fetch(`/api/purchase-orders/${po.id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setBusy(null)
      setErr(e.error ?? 'Delete failed')
      return
    }
    router.replace('/dashboard/purchase-orders')
  }

  const canReceive =
    po.status === 'sent' || po.status === 'partially_received'
  const hasOutstanding = lines.some((l) => l.qty_outstanding > 0)

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/purchase-orders"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Purchase Orders
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
                {po.po_number}
              </h1>
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[po.status] ?? ''}`}
              >
                {STATUS_LABEL[po.status] ?? po.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-white/70">
              Supplier: <span className="text-white">{po.supplier}</span>
            </p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <Stat label="Total">
                {fmtCost(
                  po.total_amount != null
                    ? Number(po.total_amount)
                    : computed_total
                )}
              </Stat>
              <Stat label="Order Date">{fmtDate(po.created_at)}</Stat>
              <Stat label="Expected">{fmtDate(po.expected_delivery_date)}</Stat>
              <Stat label="Lines">{lines.length}</Stat>
            </div>
            {po.notes && (
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-white/50">
                {po.notes}
              </pre>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            {po.status === 'draft' && (
              <>
                <button
                  onClick={() => transition('sent')}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
                >
                  {busy === 'status:sent' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Mark as Sent
                </button>
                <button
                  onClick={() => transition('cancelled')}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  <XCircle size={14} />
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </>
            )}
            {(po.status === 'sent' ||
              po.status === 'partially_received') && (
              <>
                {hasOutstanding && (
                  <Link
                    href={`/dashboard/purchase-orders/${po.id}/receive`}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                  >
                    <Truck size={14} />
                    Receive Delivery
                  </Link>
                )}
                <button
                  onClick={() => transition('cancelled')}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  <XCircle size={14} />
                  Cancel PO
                </button>
              </>
            )}
            {(po.status === 'received' || po.status === 'partially_received') && (
              <button
                onClick={() => transition('closed')}
                disabled={busy != null}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                Close PO
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">
          Line Items
        </h2>
        {lines.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/40">
            No line items.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02]">
                <tr className="text-xs uppercase tracking-wider text-white/40">
                  <th className="px-3 py-2 font-medium">Ingredient</th>
                  <th className="px-3 py-2 text-right font-medium">Ordered</th>
                  <th className="px-3 py-2 text-right font-medium">Received</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Outstanding
                  </th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Unit Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="px-3 py-2 text-white/80">
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
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white/80">
                      {fmtNum(Number(l.qty_ordered))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white/80">
                      {fmtNum(Number(l.qty_received ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span
                        className={
                          l.qty_outstanding > 0
                            ? 'text-yellow-300'
                            : 'text-white/40'
                        }
                      >
                        {fmtNum(l.qty_outstanding)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white/60">{l.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-white/70">
                      {fmtCost(Number(l.unit_cost), 4)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white">
                      {fmtCost(l.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/10 bg-white/[0.02]">
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-right text-white/60">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                    {fmtCost(computed_total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

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
