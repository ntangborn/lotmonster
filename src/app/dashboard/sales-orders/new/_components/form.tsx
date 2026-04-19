'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Save,
  CheckCircle2,
} from 'lucide-react'

import type { SellableSku } from '@/lib/sales-orders/queries'

interface Line {
  uid: string
  sku_id: string
  quantity: string
  unit: string
  unit_price: string
}

function newUid(): string {
  return Math.random().toString(36).slice(2, 10)
}
function blankLine(): Line {
  return {
    uid: newUid(),
    sku_id: '',
    quantity: '',
    unit: 'each',
    unit_price: '',
  }
}
function fmtNum(n: number, digits = 0): string {
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

export function NewSOForm({
  skus,
  customers,
  suggestedOrderNumber,
}: {
  skus: SellableSku[]
  customers: string[]
  suggestedOrderNumber: string
}) {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = useState(suggestedOrderNumber)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [expectedShip, setExpectedShip] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const skuMap = useMemo(() => {
    const m = new Map<string, SellableSku>()
    for (const s of skus) m.set(s.id, s)
    return m
  }, [skus])

  function updateLine(uid: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l))
    )
  }
  function addLine() {
    setLines((prev) => [...prev, blankLine()])
  }
  function removeLine(uid: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.uid !== uid)))
  }
  function selectSku(uid: string, id: string) {
    const s = skuMap.get(id)
    updateLine(uid, {
      sku_id: id,
      unit: 'each',
      unit_price:
        s?.retail_price != null ? String(s.retail_price) : '',
    })
  }

  const lineTotals = lines.map((l) => {
    const q = Number(l.quantity)
    const p = Number(l.unit_price)
    return q > 0 && p > 0 ? q * p : 0
  })
  const grandTotal = lineTotals.reduce((s, n) => s + n, 0)

  function validate(): string | null {
    if (!customerName.trim()) return 'Customer name is required'
    const filled = lines.filter((l) => l.sku_id && Number(l.quantity) > 0)
    if (filled.length === 0) {
      return 'Add at least one line with a SKU and quantity'
    }
    for (const l of lines) {
      if (l.sku_id && !(Number(l.quantity) > 0)) {
        return 'Each line must have a quantity > 0'
      }
      if (l.sku_id) {
        const sku = skuMap.get(l.sku_id)
        const need = Number(l.quantity) || 0
        if (sku && need > sku.on_hand) {
          return `${sku.name}: only ${sku.on_hand} on hand (need ${need})`
        }
      }
    }
    return null
  }

  async function submit(confirm: boolean) {
    const v = validate()
    if (v) {
      setErr(v)
      return
    }
    setSubmitting(true)
    setErr('')

    const body = {
      order_number: orderNumber.trim() || undefined,
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim() || null,
      expected_ship_date: expectedShip || null,
      notes: notes.trim() || null,
      confirm_now: confirm,
      lines: lines
        .filter((l) => l.sku_id && Number(l.quantity) > 0)
        .map((l) => ({
          sku_id: l.sku_id,
          quantity: Number(l.quantity),
          unit: l.unit?.trim() || 'each',
          unit_price:
            l.unit_price !== '' && Number(l.unit_price) >= 0
              ? Number(l.unit_price)
              : null,
        })),
    }

    const res = await fetch('/api/sales-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSubmitting(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setErr(
        e.error === 'validation_failed'
          ? e.issues?.[0]?.message ?? 'Validation failed'
          : e.error ?? 'Save failed'
      )
      return
    }
    const { so } = await res.json()
    router.replace(`/dashboard/sales-orders/${so.id}`)
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50'
  const selectCls = `${inputCls} bg-[#0D1B2A]`

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/sales-orders"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Sales Orders
      </Link>

      <h1 className="mb-6 text-2xl font-semibold text-white">New Sales Order</h1>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} />
          {err}
        </div>
      )}

      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/60">
          Header
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Order Number">
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className={`${inputCls} font-mono`}
            />
          </Field>
          <Field label="Customer Name" required>
            <input
              required
              list="so-customers"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={inputCls}
              placeholder="Acme Foods"
            />
            <datalist id="so-customers">
              {customers.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Customer Email">
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className={inputCls}
              placeholder="orders@acme.example"
            />
          </Field>
          <Field label="Expected Ship Date">
            <input
              type="date"
              value={expectedShip}
              onChange={(e) => setExpectedShip(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Notes" span={2}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Line Items
          </h2>
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            <Plus size={12} />
            Add Line
          </button>
        </div>

        {skus.length === 0 ? (
          <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
            No sellable SKUs yet. A SKU must be active, unit-kind, and linked
            to a recipe. Create one in{' '}
            <Link
              href="/dashboard/skus/new"
              className="underline hover:text-yellow-200"
            >
              SKUs
            </Link>{' '}
            before building a sales order.
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((l, idx) => {
              const total = lineTotals[idx]
              const sku = l.sku_id ? skuMap.get(l.sku_id) : null
              const need = Number(l.quantity) || 0
              const short =
                sku != null && need > 0 && need > sku.on_hand
              return (
                <div
                  key={l.uid}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                    short
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex-1 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <select
                        value={l.sku_id}
                        onChange={(e) => selectSku(l.uid, e.target.value)}
                        className={selectCls}
                      >
                        <option value="">Select a SKU…</option>
                        {skus.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {fmtNum(s.on_hand)} on hand
                            {s.retail_price != null
                              ? ` · ${fmtCost(s.retail_price)}`
                              : ''}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={l.quantity}
                        onChange={(e) =>
                          updateLine(l.uid, { quantity: e.target.value })
                        }
                        placeholder="Qty"
                        className={inputCls}
                      />
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={l.unit_price}
                        onChange={(e) =>
                          updateLine(l.uid, { unit_price: e.target.value })
                        }
                        placeholder="$/unit"
                        className={inputCls}
                      />
                      <div className="flex items-center justify-end rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-sm text-white/70">
                        {total > 0 ? fmtCost(total) : '—'}
                      </div>
                    </div>
                    {sku && (
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-white/40">
                          Fill:{' '}
                          <span className="font-mono text-white/60">
                            {sku.fill_quantity != null && sku.fill_unit
                              ? `${sku.fill_quantity} ${sku.fill_unit}`
                              : '—'}
                          </span>
                        </span>
                        <span
                          className={`font-mono ${
                            short ? 'text-red-300' : 'text-white/50'
                          }`}
                        >
                          On-hand: {fmtNum(sku.on_hand)}
                          {short && (
                            <span className="ml-1.5">
                              · short {fmtNum(need - sku.on_hand)}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(l.uid)}
                    disabled={lines.length === 1}
                    className="mt-1 rounded-md p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/40"
                    aria-label="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
          <div className="text-right">
            <p className="text-xs text-white/40">Order Total</p>
            <p className="font-mono text-xl font-semibold text-white">
              {fmtCost(grandTotal)}
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard/sales-orders"
          className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
        >
          Cancel
        </Link>
        <button
          onClick={() => submit(false)}
          disabled={submitting}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save as Draft
        </button>
        <button
          onClick={() => submit(true)}
          disabled={submitting}
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          Confirm Order
        </button>
      </div>
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
  span?: 2
  children: React.ReactNode
}) {
  return (
    <label className={`block ${span === 2 ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-white/50">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      {children}
    </label>
  )
}
