'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Plus,
  Trash2,
  GripVertical,
  AlertCircle,
  Loader2,
  Search,
} from 'lucide-react'
import { UNITS } from '@/lib/ingredients/schema'

export interface IngredientChoice {
  id: string
  name: string
  sku: string | null
  unit: string
  avg_cost_per_unit: number | null
}

interface Line {
  uid: string
  ingredient_id: string
  quantity: string
  unit: string
}

type SaveMode = 'save' | 'save_and_run'

function newUid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function blankLine(): Line {
  return { uid: newUid(), ingredient_id: '', quantity: '', unit: 'oz' }
}

function fmtCost(n: number | null, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`
}

export function RecipeBuilder({
  ingredients,
}: {
  ingredients: IngredientChoice[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [targetYield, setTargetYield] = useState('')
  const [yieldUnit, setYieldUnit] = useState('bottles')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const ingredientMap = useMemo(() => {
    const m = new Map<string, IngredientChoice>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const filteredIngredients = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return ingredients
    return ingredients.filter(
      (i) =>
        i.name.toLowerCase().includes(term) ||
        (i.sku ?? '').toLowerCase().includes(term)
    )
  }, [ingredients, search])

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

  function onDragStart(idx: number) {
    setDragIndex(idx)
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
  }
  function onDrop(idx: number) {
    if (dragIndex == null || dragIndex === idx) {
      setDragIndex(null)
      return
    }
    setLines((prev) => {
      const next = prev.slice()
      const [moved] = next.splice(dragIndex, 1)
      next.splice(idx, 0, moved)
      return next
    })
    setDragIndex(null)
  }

  function handleIngredientSelect(uid: string, ingredient_id: string) {
    const ing = ingredientMap.get(ingredient_id)
    updateLine(uid, {
      ingredient_id,
      unit: ing?.unit ?? 'oz',
    })
  }

  const costRows = useMemo(
    () =>
      lines.map((l) => {
        const ing = ingredientMap.get(l.ingredient_id)
        const qty = Number(l.quantity) || 0
        const avg = ing?.avg_cost_per_unit ?? null
        const lineCost =
          avg != null && qty > 0 ? qty * avg : null
        return {
          uid: l.uid,
          name: ing?.name ?? '—',
          sku: ing?.sku ?? null,
          qty,
          unit: l.unit,
          avgCost: avg,
          lineCost,
          hasStock: avg != null,
          hasIngredient: !!ing,
        }
      }),
    [lines, ingredientMap]
  )

  const knownCostSum = costRows.reduce(
    (s, r) => s + (r.lineCost ?? 0),
    0
  )
  const unknownCount = costRows.filter(
    (r) => r.hasIngredient && !r.hasStock
  ).length
  const yieldNum = Number(targetYield)
  const costPerYield =
    yieldNum > 0 && costRows.every((r) => r.hasStock || !r.hasIngredient)
      ? knownCostSum / yieldNum
      : null

  function validate(): string | null {
    if (!name.trim()) return 'Name is required'
    if (yieldNum <= 0) return 'Target yield must be greater than 0'
    if (!yieldUnit.trim()) return 'Yield unit is required'
    const filled = lines.filter((l) => l.ingredient_id && Number(l.quantity) > 0)
    if (filled.length === 0) return 'Add at least one ingredient with a quantity'
    for (const l of lines) {
      if (l.ingredient_id && !(Number(l.quantity) > 0)) {
        return 'Each ingredient must have a quantity greater than 0'
      }
    }
    const idSet = new Set<string>()
    for (const l of filled) {
      if (idSet.has(l.ingredient_id)) {
        return 'Each ingredient can only appear once'
      }
      idSet.add(l.ingredient_id)
    }
    return null
  }

  async function save(mode: SaveMode) {
    const e = validate()
    if (e) {
      setErr(e)
      return
    }
    setSaving(true)
    setErr('')

    const payload = {
      name: name.trim(),
      target_yield: yieldNum,
      target_yield_unit: yieldUnit.trim(),
      notes: notes.trim() || null,
      lines: lines
        .filter((l) => l.ingredient_id && Number(l.quantity) > 0)
        .map((l) => ({
          ingredient_id: l.ingredient_id,
          quantity: Number(l.quantity),
          unit: l.unit,
        })),
    }

    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setErr(
        body.error === 'validation_failed'
          ? body.issues?.[0]?.message ?? 'Validation failed'
          : body.error ?? 'Save failed'
      )
      return
    }
    const { recipe } = await res.json()
    if (mode === 'save_and_run') {
      router.replace(
        `/dashboard/production-runs/new?recipe=${recipe.id}`
      )
    } else {
      router.replace(`/dashboard/recipes/${recipe.id}`)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50'
  const selectCls = `${inputCls} bg-[#0D1B2A]`

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/recipes"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Recipes
      </Link>

      <h1 className="mb-6 text-2xl font-semibold text-white">Create Recipe</h1>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} />
          {err}
        </div>
      )}

      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/60">
          Recipe
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Habanero Hot Sauce"
            />
          </Field>
          <Field label="Target Yield" required>
            <div className="flex gap-2">
              <input
                required
                type="number"
                step="any"
                min="0"
                value={targetYield}
                onChange={(e) => setTargetYield(e.target.value)}
                className={inputCls}
                placeholder="24"
              />
              <input
                required
                value={yieldUnit}
                onChange={(e) => setYieldUnit(e.target.value)}
                className={`${inputCls} w-32`}
                placeholder="bottles"
              />
            </div>
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
            Ingredients
          </h2>
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            <Plus size={12} />
            Add Ingredient
          </button>
        </div>

        {ingredients.length > 10 && (
          <div className="relative mb-3">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
            />
            <input
              placeholder="Search the registry (narrows the dropdowns below)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} pl-9`}
            />
          </div>
        )}

        <div className="space-y-2">
          {lines.map((l, idx) => {
            const ing = ingredientMap.get(l.ingredient_id)
            return (
              <div
                key={l.uid}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(idx)}
                className={`flex items-start gap-2 rounded-lg border px-2 py-2 ${
                  dragIndex === idx
                    ? 'border-teal-500/50 bg-teal-500/5'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <button
                  type="button"
                  className="mt-2 cursor-grab text-white/30 hover:text-white/60 active:cursor-grabbing"
                  aria-label="Drag to reorder"
                >
                  <GripVertical size={16} />
                </button>

                <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <select
                    value={l.ingredient_id}
                    onChange={(e) =>
                      handleIngredientSelect(l.uid, e.target.value)
                    }
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
                </div>

                {ing && ing.unit !== l.unit && (
                  <span className="mt-2 text-[10px] text-yellow-400/70">
                    default: {ing.unit}
                  </span>
                )}

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
      </section>

      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/60">
          Cost Preview
        </h2>

        {unknownCount > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-300">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>
              {unknownCount} ingredient
              {unknownCount === 1 ? ' has' : 's have'} no available lots —
              cost is partial. Create lots to get a full estimate.
            </span>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.02]">
              <tr className="text-xs uppercase tracking-wider text-white/40">
                <th className="px-3 py-2 font-medium">Ingredient</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 text-right font-medium">
                  Avg Cost/Unit
                </th>
                <th className="px-3 py-2 text-right font-medium">Line Cost</th>
              </tr>
            </thead>
            <tbody>
              {costRows.map((r) => (
                <tr
                  key={r.uid}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="px-3 py-2 text-white/80">
                    {r.name}
                    {!r.hasStock && r.hasIngredient && (
                      <span className="ml-2 text-[10px] text-yellow-400/80">
                        (no lots)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-white/70">
                    {r.qty > 0
                      ? r.qty.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-white/60">{r.unit}</td>
                  <td className="px-3 py-2 text-right font-mono text-white/70">
                    {fmtCost(r.avgCost)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-white">
                    {fmtCost(r.lineCost, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-white/10 bg-white/[0.02]">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-white/60">
                  Total Recipe Cost{unknownCount > 0 ? ' (partial)' : ''}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                  {fmtCost(knownCostSum, 2)}
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-white/60">
                  Cost per {yieldUnit || 'unit'} of yield
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                  {fmtCost(costPerYield, 4)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard/recipes"
          className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
        >
          Cancel
        </Link>
        <button
          onClick={() => save('save')}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save Recipe
        </button>
        <button
          onClick={() => save('save_and_run')}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save &amp; Start Production Run
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
