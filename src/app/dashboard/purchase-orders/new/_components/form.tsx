'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Save,
  Send,
  AlertTriangle,
} from 'lucide-react'
import { UNITS } from '@/lib/ingredients/schema'
import type { LowStockSuggestion } from '@/lib/purchase-orders/queries'

export interface IngredientChoice {
  id: string
  name: string
  sku: string | null
  unit: string
  default_unit_cost: number | null
}

interface Line {
  uid: string
  ingredient_id: string
  qty: string
  unit: string
  unit_cost: string
}

function newUid(): string {
  return Math.random().toString(36).slice(2, 10)
}
function blankLine(): Line {
  return { uid: newUid(), ingredient_id: '', qty: '', unit: 'oz', unit_cost: '' }
}
function fmtCost(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`
}

export function NewPOForm({
  ingredients,
  suppliers,
  suggestedPoNumber,
  lowStock,
  preselectedIngredient,
}: {
  ingredients: IngredientChoice[]
  suppliers: string[]
  suggestedPoNumber: string
  lowStock: LowStockSuggestion[]
  preselectedIngredient?: string
}) {
  const router = useRouter()
  const [poNumber, setPoNumber] = useState(suggestedPoNumber)
  const [supplier, setSupplier] = useState('')
  const [expected, setExpected] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>(() => {
    const base = blankLine()
    if (preselectedIngredient) {
      const ing = ingredients.find((i) => i.id === preselectedIngredient)
      if (ing) {
        base.ingredient_id = ing.id
        base.unit = ing.unit
        if (ing.default_unit_cost != null) {
          base.unit_cost = String(ing.default_unit_cost)
        }
      }
    }
    return [base]
  })
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const ingredientMap = useMemo(() => {
    const m = new Map<string, IngredientChoice>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

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
  function selectIngredient(uid: string, id: string) {
    const ing = ingredientMap.get(id)
    updateLine(uid, {
      ingredient_id: id,
      unit: ing?.unit ?? 'oz',
      unit_cost:
        ing?.default_unit_cost != null
          ? String(ing.default_unit_cost)
          : '',
    })
  }

  function addLowStockSuggestions() {
    setLines((prev) => {
      const existingIds = new Set(prev.map((l) => l.ingredient_id))
      const additions: Line[] = []
      for (const s of lowStock) {
        if (existingIds.has(s.ingredient_id)) continue
        additions.push({
          uid: newUid(),
          ingredient_id: s.ingredient_id,
          qty: String(s.suggested_qty),
          unit: s.unit,
          unit_cost: s.last_unit_cost != null ? String(s.last_unit_cost) : '',
        })
      }
      // Drop the first line if it's still blank to keep the list tidy.
      const firstBlank =
        prev.length === 1 && !prev[0].ingredient_id && !prev[0].qty
      const next = firstBlank ? additions : [...prev, ...additions]
      return next.length > 0 ? next : prev
    })
  }

  const lineTotals = lines.map((l) => {
    const q = Number(l.qty)
    const c = Number(l.unit_cost)
    return q > 0 && c > 0 ? q * c : 0
  })
  const grandTotal = lineTotals.reduce((s, n) => s + n, 0)

  function validate(): string | null {
    if (!supplier.trim()) return 'Supplier is required'
    const filled = lines.filter(
      (l) => l.ingredient_id && Number(l.qty) > 0 && Number(l.unit_cost) > 0
    )
    if (filled.length === 0) {
      return 'Add at least one valid line (ingredient + qty + cost)'
    }
    for (const l of lines) {
      if (l.ingredient_id) {
        if (!(Number(l.qty) > 0))
          return 'Each line must have a quantity > 0'
        if (!(Number(l.unit_cost) > 0))
          return 'Each line must have a unit cost > 0'
      }
    }
    const seen = new Set<string>()
    for (const l of filled) {
      if (seen.has(l.ingredient_id))
        return 'Each ingredient can only appear once'
      seen.add(l.ingredient_id)
    }
    return null
  }

  async function submit(markSent: boolean) {
    const v = validate()
    if (v) {
      setErr(v)
      return
    }
    setSubmitting(true)
    setErr('')

    const body = {
      po_number: poNumber.trim() || undefined,
      supplier: supplier.trim(),
      expected_delivery_date: expected || null,
      notes: notes.trim() || null,
      mark_sent: markSent,
      lines: lines
        .filter(
          (l) => l.ingredient_id && Number(l.qty) > 0 && Number(l.unit_cost) > 0
        )
        .map((l) => ({
          ingredient_id: l.ingredient_id,
          qty_ordered: Number(l.qty),
          unit: l.unit,
          unit_cost: Number(l.unit_cost),
        })),
    }

    const res = await fetch('/api/purchase-orders', {
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
    const { po } = await res.json()
    router.replace(`/dashboard/purchase-orders/${po.id}`)
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50'
  const selectCls = `${inputCls} bg-[#0D1B2A]`

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/purchase-orders"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Purchase Orders
      </Link>

      <h1 className="mb-6 text-2xl font-semibold text-white">
        New Purchase Order
      </h1>

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
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="PO Number">
            <input
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className={`${inputCls} font-mono`}
            />
          </Field>
          <Field label="Supplier" required>
            <input
              required
              list="po-suppliers"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className={inputCls}
              placeholder="Sysco"
            />
            <datalist id="po-suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Expected delivery">
            <input
              type="date"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
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

      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Line Items
          </h2>
          <div className="flex gap-2">
            {lowStock.length > 0 && (
              <button
                type="button"
                onClick={addLowStockSuggestions}
                className="flex items-center gap-1 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs font-medium text-yellow-300 hover:bg-yellow-500/20"
                title={`${lowStock.length} ingredient(s) below threshold`}
              >
                <AlertTriangle size={12} />
                Add from Low Stock ({lowStock.length})
              </button>
            )}
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
            >
              <Plus size={12} />
              Add Line
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {lines.map((l, idx) => {
            const total = lineTotals[idx]
            return (
              <div
                key={l.uid}
                className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <select
                    value={l.ingredient_id}
                    onChange={(e) => selectIngredient(l.uid, e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Select an ingredient…</option>
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                        {i.sku ? ` (${i.sku})` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.qty}
                    onChange={(e) => updateLine(l.uid, { qty: e.target.value })}
                    placeholder="Qty"
                    className={inputCls}
                  />
                  <select
                    value={l.unit}
                    onChange={(e) => updateLine(l.uid, { unit: e.target.value })}
                    className={selectCls}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.unit_cost}
                    onChange={(e) =>
                      updateLine(l.uid, { unit_cost: e.target.value })
                    }
                    placeholder="$/unit"
                    className={inputCls}
                  />
                  <div className="flex items-center justify-end rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-sm text-white/70">
                    {total > 0 ? fmtCost(total) : '—'}
                  </div>
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

        <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
          <div className="text-right">
            <p className="text-xs text-white/40">PO Total</p>
            <p className="font-mono text-xl font-semibold text-white">
              {fmtCost(grandTotal)}
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard/purchase-orders"
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
            <Send size={14} />
          )}
          Save &amp; Mark Sent
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
  span?: 3
  children: React.ReactNode
}) {
  return (
    <label className={`block ${span === 3 ? 'sm:col-span-3' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-white/50">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      {children}
    </label>
  )
}
