'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import type { LotWithIngredient } from '@/lib/lots/queries'
import { computeDisplayStatus } from '@/lib/lots/schema'
import { UNITS } from '@/lib/ingredients/schema'

export interface IngredientOption {
  id: string
  name: string
  sku: string | null
  unit: string
}

interface Props {
  open: boolean
  onClose: () => void
  ingredients: IngredientOption[]
  onCreated: (lot: LotWithIngredient) => void
}

export function CreateLotModal({ open, onClose, ingredients, onCreated }: Props) {
  const [ingredientId, setIngredientId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [quantityReceived, setQuantityReceived] = useState('')
  const [unit, setUnit] = useState('oz')
  const [unitCost, setUnitCost] = useState('')
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [expiryDate, setExpiryDate] = useState('')
  const [supplierLot, setSupplierLot] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const initialized = useRef(false)

  useEffect(() => {
    if (!open) {
      setErr('')
      initialized.current = false
      return
    }
    if (!initialized.current) {
      setIngredientId('')
      setSearchTerm('')
      setLotNumber('')
      setQuantityReceived('')
      setUnitCost('')
      setReceivedDate(new Date().toISOString().slice(0, 10))
      setExpiryDate('')
      setSupplierLot('')
      setNotes('')
      setErr('')
      initialized.current = true
    }
  }, [open])

  useEffect(() => {
    if (!ingredientId) {
      setLotNumber('')
      return
    }
    const selected = ingredients.find((i) => i.id === ingredientId)
    if (selected) setUnit(selected.unit)

    let cancelled = false
    fetch(`/api/lots?suggest_for=${ingredientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.lot_number) setLotNumber(d.lot_number)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [ingredientId, ingredients])

  if (!open) return null

  const term = searchTerm.trim().toLowerCase()
  const filteredIngredients = term
    ? ingredients.filter(
        (i) =>
          i.name.toLowerCase().includes(term) ||
          (i.sku ?? '').toLowerCase().includes(term)
      )
    : ingredients

  const qtyNum = Number(quantityReceived)
  const costNum = Number(unitCost)
  const totalCost =
    Number.isFinite(qtyNum) &&
    Number.isFinite(costNum) &&
    qtyNum > 0 &&
    costNum > 0
      ? qtyNum * costNum
      : null

  const selected = ingredients.find((i) => i.id === ingredientId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ingredientId || !lotNumber.trim() || qtyNum <= 0 || costNum <= 0) return

    setSaving(true)
    setErr('')

    const body = {
      ingredient_id: ingredientId,
      lot_number: lotNumber.trim(),
      supplier_lot_number: supplierLot.trim() || null,
      quantity_received: qtyNum,
      unit,
      unit_cost: costNum,
      received_date: receivedDate,
      expiry_date: expiryDate || null,
      notes: notes.trim() || null,
    }

    const res = await fetch('/api/lots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)

    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setErr(
        e.error === 'validation_failed'
          ? e.issues?.[0]?.message ?? 'Validation failed'
          : e.error ?? 'Create failed'
      )
      return
    }

    const { lot } = await res.json()
    const chosen = ingredients.find((i) => i.id === lot.ingredient_id)
    const created: LotWithIngredient = {
      ...lot,
      ingredient_name: chosen?.name ?? 'Unknown',
      ingredient_sku: chosen?.sku ?? null,
      display_status: computeDisplayStatus(
        Number(lot.quantity_remaining) || 0,
        lot.expiry_date,
        lot.status
      ),
    }
    onCreated(created)
    onClose()
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50'
  const selectCls = `${inputCls} bg-[#0D1B2A]`
  const canSubmit =
    !!ingredientId &&
    lotNumber.trim().length > 0 &&
    qtyNum > 0 &&
    costNum > 0 &&
    !saving

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10 md:pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0D1B2A] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Create Lot</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {err && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            <AlertCircle size={14} />
            {err}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Ingredient" required>
            {ingredients.length > 10 && (
              <input
                type="text"
                placeholder="Search ingredients…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${inputCls} mb-2`}
              />
            )}
            <select
              required
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              className={selectCls}
            >
              <option value="">Select an ingredient…</option>
              {filteredIngredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.sku ? ` (${i.sku})` : ''}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lot Number" required>
              <input
                required
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                className={inputCls}
                placeholder="CAY-20260415-001"
              />
            </Field>

            <Field label="Supplier Lot #">
              <input
                value={supplierLot}
                onChange={(e) => setSupplierLot(e.target.value)}
                className={inputCls}
                placeholder="Optional"
              />
            </Field>

            <Field label="Quantity Received" required>
              <input
                required
                type="number"
                step="any"
                min="0"
                value={quantityReceived}
                onChange={(e) => setQuantityReceived(e.target.value)}
                className={inputCls}
                placeholder="0"
              />
            </Field>

            <Field label="Unit">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={selectCls}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {selected && selected.unit !== unit && (
                <p className="mt-1 text-xs text-yellow-400/80">
                  Ingredient default: {selected.unit}
                </p>
              )}
            </Field>

            <Field label="Unit Cost ($)" required>
              <input
                required
                type="number"
                step="any"
                min="0.000001"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className={`${inputCls} ${costNum === 0 && unitCost ? 'border-red-500/60' : ''}`}
                placeholder="0.00"
              />
              {unitCost && costNum <= 0 && (
                <p className="mt-1 text-xs text-red-400">
                  Unit cost must be greater than 0
                </p>
              )}
            </Field>

            <Field label="Total Cost">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-sm text-white/70">
                {totalCost != null
                  ? `$${totalCost.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}`
                  : '—'}
              </div>
            </Field>

            <Field label="Received Date">
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Expiry Date">
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Create Lot
            </button>
          </div>
        </form>
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
