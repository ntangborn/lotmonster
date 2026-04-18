'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { UNITS, INGREDIENT_KINDS, type IngredientKind } from '@/lib/ingredients/schema'

type State = 'idle' | 'saving' | 'error'

export default function NewIngredientPage() {
  const router = useRouter()
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [kind, setKind] = useState<IngredientKind>('raw')
  const [unit, setUnit] = useState<string>('oz')
  const [category, setCategory] = useState('')
  const [lowStockThreshold, setLowStockThreshold] = useState('')
  const [costPerUnit, setCostPerUnit] = useState('')
  const [bulkUnit, setBulkUnit] = useState('')
  const [bulkFactor, setBulkFactor] = useState('')
  const [costPerBulkUnit, setCostPerBulkUnit] = useState('')
  const [defaultSupplier, setDefaultSupplier] = useState('')
  const [storageNotes, setStorageNotes] = useState('')
  const [notes, setNotes] = useState('')

  function toNumberOrNull(v: string): number | null {
    const s = v.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setState('saving')
    setErrorMsg('')

    const body = {
      name: name.trim(),
      sku: sku.trim() || null,
      unit,
      kind,
      category: category.trim() || null,
      low_stock_threshold: toNumberOrNull(lowStockThreshold),
      cost_per_unit: toNumberOrNull(costPerUnit),
      bulk_unit: bulkUnit.trim() || null,
      bulk_to_unit_factor: toNumberOrNull(bulkFactor),
      cost_per_bulk_unit: toNumberOrNull(costPerBulkUnit),
      default_supplier: defaultSupplier.trim() || null,
      storage_notes: storageNotes.trim() || null,
      notes: notes.trim() || null,
    }

    const res = await fetch('/api/ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setErrorMsg(err.error ?? `Request failed (${res.status})`)
      setState('error')
      return
    }

    const data = await res.json()
    router.replace(`/dashboard/ingredients/${data.ingredient.id}`)
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50'

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/ingredients"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Ingredients
      </Link>

      <h1 className="mb-6 text-2xl font-semibold text-white">Add Ingredient</h1>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card title="Basics">
          <div className="mb-4">
            <span className="mb-2 block text-xs font-medium text-white/50">
              Kind <span className="ml-1 text-red-400">*</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {INGREDIENT_KINDS.map((k) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                    kind === k
                      ? 'border-teal-400 bg-teal-500/20 text-teal-200'
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k}
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    disabled={state === 'saving'}
                    className="sr-only"
                  />
                  {k === 'raw' ? 'Raw' : 'Packaging'}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-white/30">
              Raw goes into recipes. Packaging (bottles, caps, labels) goes on
              SKU BOMs.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="Cayenne pepper"
              />
            </Field>
            <Field label="SKU">
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="CAY-01"
              />
            </Field>
            <Field label="Unit" required>
              <select
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                disabled={state === 'saving'}
                className={`${inputCls} bg-[#0D1B2A]`}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="Spice"
              />
            </Field>
            <Field label="Low stock threshold">
              <input
                type="number"
                step="any"
                min="0"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="10"
              />
            </Field>
            <Field label="Cost per unit ($)">
              <input
                type="number"
                step="any"
                min="0"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="0.25"
              />
            </Field>
          </div>
        </Card>

        <Card title="Bulk purchasing (optional)">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Bulk unit">
              <input
                value={bulkUnit}
                onChange={(e) => setBulkUnit(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="case"
              />
            </Field>
            <Field label="Units per bulk">
              <input
                type="number"
                step="any"
                min="0"
                value={bulkFactor}
                onChange={(e) => setBulkFactor(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="24"
              />
            </Field>
            <Field label="Cost per bulk unit ($)">
              <input
                type="number"
                step="any"
                min="0"
                value={costPerBulkUnit}
                onChange={(e) => setCostPerBulkUnit(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="48"
              />
            </Field>
          </div>
        </Card>

        <Card title="Supplier & notes">
          <div className="grid gap-4">
            <Field label="Default supplier">
              <input
                value={defaultSupplier}
                onChange={(e) => setDefaultSupplier(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="Sysco"
              />
            </Field>
            <Field label="Storage notes">
              <input
                value={storageNotes}
                onChange={(e) => setStorageNotes(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="Refrigerate after opening"
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={state === 'saving'}
                rows={3}
                className={inputCls}
              />
            </Field>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/dashboard/ingredients"
            className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={state === 'saving' || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
          >
            {state === 'saving' && <Loader2 size={14} className="animate-spin" />}
            Save ingredient
          </button>
        </div>
      </form>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/60">
        {title}
      </h2>
      {children}
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
