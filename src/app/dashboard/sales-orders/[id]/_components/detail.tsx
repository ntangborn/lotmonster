'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  CheckCircle2,
  Truck,
  Package,
  XCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Plus,
  X,
  Sparkles,
  GitBranch,
} from 'lucide-react'
import type { SODetail } from '@/lib/sales-orders/queries'

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

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
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
function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString()
}

export function SODetailView({ initial }: { initial: SODetail }) {
  const router = useRouter()
  const { so, lines, computed_total, allocated_lot_numbers } = initial
  const [busy, setBusy] = useState<null | string>(null)
  const [err, setErr] = useState('')
  const [shipOpen, setShipOpen] = useState(false)

  async function transition(to: 'confirmed' | 'cancelled' | 'closed') {
    setBusy(`status:${to}`)
    setErr('')
    const res = await fetch(`/api/sales-orders/${so.id}/status`, {
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
    if (!confirm(`Delete sales order ${so.order_number}?`)) return
    setBusy('delete')
    setErr('')
    const res = await fetch(`/api/sales-orders/${so.id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      setBusy(null)
      const e = await res.json().catch(() => ({}))
      setErr(e.error ?? 'Delete failed')
      return
    }
    router.replace('/dashboard/sales-orders')
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/sales-orders"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Sales Orders
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
                {so.order_number}
              </h1>
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[so.status] ?? ''}`}
              >
                {STATUS_LABEL[so.status] ?? so.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-white/70">
              Customer: <span className="text-white">{so.customer_name}</span>
              {so.customer_email && (
                <span className="ml-2 text-xs text-white/40">
                  ({so.customer_email})
                </span>
              )}
            </p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <Stat label="Total">{fmtCost(computed_total)}</Stat>
              <Stat label="Order Date">{fmtDate(so.created_at)}</Stat>
              <Stat label="Expected Ship">
                {fmtDate(so.expected_ship_date)}
              </Stat>
              <Stat label="Shipped">{fmtDateTime(so.shipped_at)}</Stat>
            </div>
            {so.notes && (
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-white/50">
                {so.notes}
              </pre>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            {so.status === 'draft' && (
              <>
                <button
                  onClick={() => transition('confirmed')}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
                >
                  {busy === 'status:confirmed' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  Confirm Order
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
            {(so.status === 'confirmed' || so.status === 'allocated') && (
              <>
                <button
                  onClick={() => setShipOpen(true)}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:opacity-50"
                >
                  <Truck size={14} />
                  Ship Order
                </button>
                <button
                  onClick={() => transition('cancelled')}
                  disabled={busy != null}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  <XCircle size={14} />
                  Cancel
                </button>
              </>
            )}
            {(so.status === 'shipped' || so.status === 'invoiced') && (
              <button
                onClick={() => transition('closed')}
                disabled={busy != null}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
              >
                {busy === 'status:closed' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Package size={14} />
                )}
                Mark Delivered
              </button>
            )}
            {(so.status === 'shipped' ||
              so.status === 'invoiced' ||
              so.status === 'closed') && (
              <Link
                href={`/dashboard/traceability?type=order&q=${encodeURIComponent(so.order_number)}`}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                <GitBranch size={14} />
                View Traceability
              </Link>
            )}
          </div>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">
          Line Items
        </h2>
        {lines.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/40">No lines.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02]">
                <tr className="text-xs uppercase tracking-wider text-white/40">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                  <th className="px-3 py-2 text-right font-medium">Line Total</th>
                  <th className="px-3 py-2 font-medium">Allocated Lots</th>
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
                        href={`/dashboard/recipes/${l.recipe_id}`}
                        className="hover:text-teal-300"
                      >
                        {l.recipe_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white/80">
                      {fmtNum(Number(l.quantity), 4)}
                    </td>
                    <td className="px-3 py-2 text-white/60">{l.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-white/70">
                      {fmtCost(
                        l.unit_price != null ? Number(l.unit_price) : null,
                        4
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white">
                      {fmtCost(l.line_total)}
                    </td>
                    <td className="px-3 py-2">
                      {(l.lot_numbers_allocated?.length ?? 0) === 0 ? (
                        <span className="text-xs text-white/30">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(l.lot_numbers_allocated ?? []).map((ln) => (
                            <span
                              key={ln}
                              className="inline-flex items-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70"
                            >
                              {ln}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/10 bg-white/[0.02]">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-white/60">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                    {fmtCost(computed_total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {(so.status === 'shipped' ||
        so.status === 'invoiced' ||
        so.status === 'closed') && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">
            Lot Traceability
          </h2>
          {allocated_lot_numbers.length === 0 ? (
            <p className="text-xs text-white/40">
              No lot numbers were recorded when this order was shipped.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-white/70">
                This order contains products from lots:
              </p>
              <div className="flex flex-wrap gap-2">
                {allocated_lot_numbers.map((ln) => (
                  <Link
                    key={ln}
                    href={`/dashboard/lots`}
                    className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-white/80 hover:bg-white/10 hover:text-teal-300"
                  >
                    {ln}
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {shipOpen && (
        <ShipModal
          soId={so.id}
          lines={lines}
          onClose={() => setShipOpen(false)}
          onShipped={() => {
            setShipOpen(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

interface ShipLineState {
  uid: string
  line_id: string
  product_name: string
  quantity: number
  unit: string
  lots: string[]
  pending: string
}

interface RunSuggestion {
  run_id: string
  run_number: string
  status: string
  actual_yield: number | null
  yield_unit: string | null
  completed_at: string | null
}

function ShipModal({
  soId,
  lines,
  onClose,
  onShipped,
}: {
  soId: string
  lines: SODetail['lines']
  onClose: () => void
  onShipped: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [shippedDate, setShippedDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [suggestions, setSuggestions] = useState<Record<string, RunSuggestion[]>>({})
  const [rows, setRows] = useState<ShipLineState[]>(() =>
    lines.map((l) => ({
      uid: l.id,
      line_id: l.id,
      product_name: l.recipe_name,
      quantity: Number(l.quantity),
      unit: l.unit,
      lots: [...(l.lot_numbers_allocated ?? [])],
      pending: '',
    }))
  )

  useEffect(() => {
    fetch(`/api/sales-orders/${soId}/suggestions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.suggestions) setSuggestions(d.suggestions)
      })
      .catch(() => {})
  }, [soId])

  function addSuggestion(uid: string, runNumber: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r
        if (r.lots.includes(runNumber)) return r
        return { ...r, lots: [...r.lots, runNumber] }
      })
    )
  }

  function update(uid: string, patch: Partial<ShipLineState>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }
  function addLot(uid: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r
        const v = r.pending.trim()
        if (!v) return r
        if (r.lots.includes(v)) return { ...r, pending: '' }
        return { ...r, lots: [...r.lots, v], pending: '' }
      })
    )
  }
  function removeLot(uid: string, lot: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.uid === uid ? { ...r, lots: r.lots.filter((l) => l !== lot) } : r
      )
    )
  }

  async function submit() {
    setBusy(true)
    setErr('')
    const body = {
      shipped_at: shippedDate
        ? new Date(shippedDate).toISOString()
        : undefined,
      lines: rows.map((r) => ({ line_id: r.line_id, lot_numbers: r.lots })),
      notes: notes.trim() || null,
    }
    const res = await fetch(`/api/sales-orders/${soId}/ship`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setErr(e.error ?? 'Ship failed')
      return
    }
    onShipped()
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0D1B2A] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Truck size={18} className="text-yellow-400" />
          <h3 className="text-lg font-semibold text-white">Ship Order</h3>
        </div>
        <p className="mb-4 text-xs text-white/50">
          Record which lot numbers were used to fulfill each line for forward
          traceability. Add the production-run number or finished-good lot # for
          each batch shipped.
        </p>

        {err && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle size={14} />
            {err}
          </div>
        )}

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/50">
              Shipped date
            </span>
            <input
              type="date"
              value={shippedDate}
              onChange={(e) => setShippedDate(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/50">
              Notes
            </span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
              placeholder="Carrier, tracking, etc."
            />
          </label>
        </div>

        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.uid}
              className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                  {r.product_name}
                </span>
                <span className="text-xs text-white/50">
                  Qty: <span className="font-mono">{r.quantity} {r.unit}</span>
                </span>
              </div>

              <div className="mb-2 flex flex-wrap gap-1.5">
                {r.lots.length === 0 ? (
                  <span className="text-xs text-white/30">No lots added</span>
                ) : (
                  r.lots.map((l) => (
                    <span
                      key={l}
                      className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs text-white/80"
                    >
                      {l}
                      <button
                        onClick={() => removeLot(r.uid, l)}
                        className="text-white/40 hover:text-red-300"
                        aria-label={`Remove ${l}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {(suggestions[r.line_id]?.length ?? 0) > 0 && (
                <div className="mb-2 rounded border border-teal-500/20 bg-teal-500/[0.04] p-2">
                  <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-teal-300">
                    <Sparkles size={10} />
                    Suggested runs (FEFO-allocated)
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {suggestions[r.line_id].map((s) => {
                      const already = r.lots.includes(s.run_number)
                      return (
                        <button
                          key={s.run_id}
                          type="button"
                          disabled={already}
                          onClick={() => addSuggestion(r.uid, s.run_number)}
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                            already
                              ? 'border-white/10 bg-white/5 text-white/30'
                              : 'border-teal-500/30 bg-teal-500/10 text-teal-200 hover:bg-teal-500/20'
                          }`}
                          title={
                            s.actual_yield != null
                              ? `${s.actual_yield} ${s.yield_unit ?? ''} · ${s.status}`
                              : s.status
                          }
                        >
                          {already ? '✓' : <Plus size={9} />}
                          {s.run_number}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={r.pending}
                  onChange={(e) => update(r.uid, { pending: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addLot(r.uid)
                    }
                  }}
                  placeholder="Or add custom lot # (e.g. HOT-20260415-001)"
                  className={`${inputCls} font-mono`}
                />
                <button
                  type="button"
                  onClick={() => addLot(r.uid)}
                  disabled={!r.pending.trim()}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 disabled:opacity-40"
                >
                  <Plus size={12} />
                  Add
                </button>
              </div>
            </div>
          ))}
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
            onClick={submit}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Confirm Shipment
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
