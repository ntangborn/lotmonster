'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  AlertCircle,
  PackageCheck,
  Loader2,
} from 'lucide-react'

export interface ReceiveLineSeed {
  line_id: string
  ingredient_id: string
  ingredient_name: string
  ingredient_sku: string | null
  unit: string
  qty_ordered: number
  qty_previously_received: number
  qty_remaining: number
  unit_cost: number
  suggested_lot_number: string
}

interface ReceiveLineState {
  uid: string
  line_id: string
  ingredient_name: string
  ingredient_sku: string | null
  unit: string
  qty_ordered: number
  qty_previously_received: number
  qty_remaining: number
  receiving_now: string
  lot_number: string
  supplier_lot: string
  expiry: string
  unit_cost: string
}

function fmtNum(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}
function fmtCost(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`
}

export function ReceiveForm({
  poId,
  poNumber,
  supplier,
  poStatus,
  receivable,
  seeds,
}: {
  poId: string
  poNumber: string
  supplier: string
  poStatus: string
  receivable: boolean
  seeds: ReceiveLineSeed[]
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [receivedDate, setReceivedDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [rows, setRows] = useState<ReceiveLineState[]>(() =>
    seeds.map((s) => ({
      uid: s.line_id,
      line_id: s.line_id,
      ingredient_name: s.ingredient_name,
      ingredient_sku: s.ingredient_sku,
      unit: s.unit,
      qty_ordered: s.qty_ordered,
      qty_previously_received: s.qty_previously_received,
      qty_remaining: s.qty_remaining,
      receiving_now: s.qty_remaining > 0 ? String(s.qty_remaining) : '',
      lot_number: s.suggested_lot_number,
      supplier_lot: '',
      expiry: '',
      unit_cost: String(s.unit_cost),
    }))
  )

  function update(uid: string, patch: Partial<ReceiveLineState>) {
    setRows((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r))
    )
  }

  function lineErrorFor(r: ReceiveLineState): string | null {
    const qty = Number(r.receiving_now)
    if (!r.receiving_now || qty === 0) return null
    if (!Number.isFinite(qty) || qty < 0)
      return 'Receiving qty must be a number ≥ 0'
    if (qty > r.qty_remaining)
      return `Cannot receive more than remaining (${fmtNum(r.qty_remaining)})`
    if (!r.lot_number.trim()) return 'Lot number is required'
    const cost = Number(r.unit_cost)
    if (!(cost > 0)) return 'Unit cost must be greater than 0'
    return null
  }

  function validate(): string | null {
    const filled = rows.filter((r) => Number(r.receiving_now) > 0)
    if (filled.length === 0) return 'Enter a receiving quantity for at least one line'
    for (const r of filled) {
      const e = lineErrorFor(r)
      if (e) return `${r.ingredient_name}: ${e}`
    }
    return null
  }

  async function submit() {
    if (!receivable) return
    const v = validate()
    if (v) {
      setErr(v)
      return
    }
    setBusy(true)
    setErr('')

    const filled = rows.filter((r) => Number(r.receiving_now) > 0)
    const body = {
      lines: filled.map((r) => ({
        line_id: r.line_id,
        quantity_received: Number(r.receiving_now),
        lot_number: r.lot_number.trim(),
        supplier_lot_number: r.supplier_lot.trim() || null,
        expiry_date: r.expiry || null,
        received_date: receivedDate || today,
        unit_cost_override: Number(r.unit_cost),
      })),
      notes: notes.trim() || null,
    }

    const res = await fetch(`/api/purchase-orders/${poId}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)

    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setErr(
        e.error === 'validation_failed'
          ? e.issues?.[0]?.message ?? 'Validation failed'
          : e.error ?? 'Receive failed'
      )
      return
    }
    router.replace(`/dashboard/purchase-orders/${poId}`)
    router.refresh()
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50'

  const totalReceiving = rows.reduce((s, r) => {
    const q = Number(r.receiving_now)
    const c = Number(r.unit_cost)
    return q > 0 && c > 0 ? s + q * c : s
  }, 0)

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={`/dashboard/purchase-orders/${poId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to {poNumber}
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <PackageCheck size={22} className="text-emerald-400" />
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Receive Delivery
          </h1>
          <p className="mt-0.5 text-sm text-white/50">
            <span className="font-mono">{poNumber}</span>
            <span className="mx-2 text-white/30">·</span>
            <span>{supplier}</span>
          </p>
        </div>
      </div>

      {!receivable && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          <AlertCircle size={14} />
          This PO is in state &quot;{poStatus}&quot; and can&apos;t be received.
          Mark it as Sent first.
        </div>
      )}

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} />
          {err}
        </div>
      )}

      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/60">
          Receipt Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Received date">
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              className={inputCls}
              disabled={!receivable}
            />
          </Field>
          <Field label="Notes">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
              placeholder="Damage, partial pallet, etc."
              disabled={!receivable}
            />
          </Field>
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/60">
          Line Items
        </h2>

        <div className="space-y-3">
          {rows.map((r) => {
            const isFullyReceived = r.qty_remaining === 0
            const lineErr = receivable ? lineErrorFor(r) : null
            const receiving = Number(r.receiving_now)
            const lineTotal =
              receiving > 0 && Number(r.unit_cost) > 0
                ? receiving * Number(r.unit_cost)
                : 0

            return (
              <div
                key={r.uid}
                className={`rounded-xl border p-4 ${
                  isFullyReceived
                    ? 'border-white/5 bg-white/[0.01] opacity-60'
                    : lineErr
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <Link
                      href={`/dashboard/ingredients/${r.line_id}`}
                      className="text-sm font-semibold text-white hover:text-teal-300"
                    >
                      {r.ingredient_name}
                    </Link>
                    {r.ingredient_sku && (
                      <span className="ml-2 text-xs text-white/40">
                        ({r.ingredient_sku})
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                    <Stat label="Ordered">
                      {fmtNum(r.qty_ordered)} {r.unit}
                    </Stat>
                    <Stat label="Previously Received">
                      {fmtNum(r.qty_previously_received)} {r.unit}
                    </Stat>
                    <Stat
                      label="Remaining"
                      tone={
                        r.qty_remaining > 0 ? 'yellow' : 'muted'
                      }
                    >
                      {fmtNum(r.qty_remaining)} {r.unit}
                    </Stat>
                  </div>
                </div>

                {isFullyReceived ? (
                  <p className="text-xs text-white/40">
                    Fully received — nothing to do.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Field
                        label={`Receiving Now (${r.unit})`}
                        required
                      >
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={r.qty_remaining}
                          value={r.receiving_now}
                          onChange={(e) =>
                            update(r.uid, { receiving_now: e.target.value })
                          }
                          className={inputCls}
                          disabled={!receivable}
                        />
                      </Field>
                      <Field label="Lot Number" required>
                        <input
                          value={r.lot_number}
                          onChange={(e) =>
                            update(r.uid, { lot_number: e.target.value })
                          }
                          className={`${inputCls} font-mono`}
                          disabled={!receivable}
                          placeholder="auto-suggested"
                        />
                      </Field>
                      <Field label="Expiry Date">
                        <input
                          type="date"
                          value={r.expiry}
                          onChange={(e) =>
                            update(r.uid, { expiry: e.target.value })
                          }
                          className={inputCls}
                          disabled={!receivable}
                        />
                      </Field>
                      <Field label="Actual Unit Cost ($)" required>
                        <input
                          type="number"
                          step="any"
                          min="0.000001"
                          value={r.unit_cost}
                          onChange={(e) =>
                            update(r.uid, { unit_cost: e.target.value })
                          }
                          className={inputCls}
                          disabled={!receivable}
                        />
                      </Field>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div>
                        <Field label="Supplier Lot #">
                          <input
                            value={r.supplier_lot}
                            onChange={(e) =>
                              update(r.uid, { supplier_lot: e.target.value })
                            }
                            className={`${inputCls} max-w-xs`}
                            disabled={!receivable}
                            placeholder="Optional"
                          />
                        </Field>
                      </div>
                      {receiving > 0 && (
                        <div className="ml-4 text-right">
                          <p className="text-xs text-white/40">Line Total</p>
                          <p className="font-mono text-sm font-semibold text-white">
                            {fmtCost(lineTotal)}
                          </p>
                        </div>
                      )}
                    </div>
                    {lineErr && (
                      <p className="mt-2 text-xs text-red-300">{lineErr}</p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
          <div className="text-right">
            <p className="text-xs text-white/40">Total Receipt Value</p>
            <p className="font-mono text-xl font-semibold text-white">
              {fmtCost(totalReceiving)}
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <Link
          href={`/dashboard/purchase-orders/${poId}`}
          className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
        >
          Cancel
        </Link>
        <button
          onClick={submit}
          disabled={!receivable || busy}
          className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <PackageCheck size={14} />
          )}
          Confirm Receipt
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-white/50">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      {children}
    </label>
  )
}

function Stat({
  label,
  tone,
  children,
}: {
  label: string
  tone?: 'yellow' | 'muted'
  children: React.ReactNode
}) {
  return (
    <span>
      <span className="text-white/40">{label}: </span>
      <span
        className={`font-mono ${
          tone === 'yellow'
            ? 'text-yellow-300'
            : tone === 'muted'
              ? 'text-white/40'
              : 'text-white/80'
        }`}
      >
        {children}
      </span>
    </span>
  )
}
