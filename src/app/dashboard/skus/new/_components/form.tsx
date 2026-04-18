'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { UNITS } from '@/lib/ingredients/schema'

type State = 'idle' | 'saving' | 'error'

interface Props {
  recipes: Array<{ id: string; name: string }>
}

export function NewSkuForm({ recipes }: Props) {
  const router = useRouter()
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const [name, setName] = useState('')
  const [kind] = useState<'unit' | 'case' | 'pallet'>('unit') // locked in phase 1
  const [recipeId, setRecipeId] = useState('')
  const [upc, setUpc] = useState('')
  const [fillQuantity, setFillQuantity] = useState('')
  const [fillUnit, setFillUnit] = useState<string>('fl_oz')
  const [shelfLifeDays, setShelfLifeDays] = useState('')
  const [retailPrice, setRetailPrice] = useState('')
  const [lotPrefix, setLotPrefix] = useState('')
  const [qboItemId, setQboItemId] = useState('')
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
      kind,
      recipe_id: recipeId || null,
      upc: upc.trim() || null,
      fill_quantity: toNumberOrNull(fillQuantity),
      fill_unit: fillQuantity.trim() ? fillUnit : null,
      shelf_life_days: toNumberOrNull(shelfLifeDays),
      retail_price: toNumberOrNull(retailPrice),
      lot_prefix: lotPrefix.trim() || null,
      qbo_item_id: qboItemId.trim() || null,
      notes: notes.trim() || null,
      active: true,
    }

    const res = await fetch('/api/skus', {
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
    router.replace(`/dashboard/skus/${data.sku.id}`)
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50'

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/skus"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to SKUs
      </Link>

      <h1 className="mb-6 text-2xl font-semibold text-white">New SKU</h1>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="Jalapeño Hot Sauce 16oz"
              />
            </Field>
            <Field label="Recipe (optional)">
              <select
                value={recipeId}
                onChange={(e) => setRecipeId(e.target.value)}
                disabled={state === 'saving'}
                className={`${inputCls} bg-[#0D1B2A]`}
              >
                <option value="">— no recipe (resale / merch) —</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-xs font-medium text-white/50">
              Kind
            </span>
            <div className="flex flex-wrap gap-2">
              <KindPill label="Unit" value="unit" selected disabled={false} />
              <KindPill
                label="Case"
                value="case"
                selected={false}
                disabled
                tooltip="Case SKUs — coming in phase 2"
              />
              <KindPill
                label="Pallet"
                value="pallet"
                selected={false}
                disabled
                tooltip="Pallet SKUs — coming in phase 2"
              />
            </div>
          </div>
        </Card>

        <Card title="Packaging & shelf life">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fill quantity">
              <input
                type="number"
                step="any"
                min="0"
                value={fillQuantity}
                onChange={(e) => setFillQuantity(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="16"
              />
            </Field>
            <Field label="Fill unit">
              <select
                value={fillUnit}
                onChange={(e) => setFillUnit(e.target.value)}
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
            <Field label="Shelf life (days)">
              <input
                type="number"
                step="1"
                min="0"
                value={shelfLifeDays}
                onChange={(e) => setShelfLifeDays(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="365"
              />
            </Field>
          </div>
        </Card>

        <Card title="Identifiers & pricing">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="UPC">
              <input
                value={upc}
                onChange={(e) => setUpc(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="012345678901"
              />
            </Field>
            <Field label="Retail price ($)">
              <input
                type="number"
                step="any"
                min="0"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="8.99"
              />
            </Field>
            <Field label="Lot prefix">
              <input
                value={lotPrefix}
                onChange={(e) => setLotPrefix(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="auto-derived from name"
              />
            </Field>
            <Field label="QBO item id (optional)">
              <input
                value={qboItemId}
                onChange={(e) => setQboItemId(e.target.value)}
                disabled={state === 'saving'}
                className={inputCls}
                placeholder="overrides org default"
              />
            </Field>
          </div>
        </Card>

        <Card title="Notes">
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={state === 'saving'}
              rows={3}
              className={inputCls}
            />
          </Field>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/dashboard/skus"
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
            Save SKU
          </button>
        </div>
      </form>
    </div>
  )
}

function KindPill({
  label,
  selected,
  disabled,
  tooltip,
}: {
  label: string
  value: 'unit' | 'case' | 'pallet'
  selected: boolean
  disabled: boolean
  tooltip?: string
}) {
  const base =
    'rounded-full border px-4 py-1.5 text-xs font-medium transition-colors'
  const cls = selected
    ? `${base} border-teal-400 bg-teal-500/20 text-teal-200`
    : disabled
      ? `${base} cursor-not-allowed border-white/10 bg-white/[0.03] text-white/30`
      : `${base} border-white/10 bg-white/5 text-white/70 hover:bg-white/10`
  return (
    <span className={cls} title={tooltip}>
      {label}
    </span>
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
