'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useForm,
  useFieldArray,
  useWatch,
  Control,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'
import { bulkInsertIngredients } from '@/lib/actions/ingredients'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNITS = ['oz', 'lb', 'gal', 'fl_oz', 'g', 'kg', 'ml', 'l', 'each'] as const
const CATEGORIES = ['raw_material', 'packaging', 'label'] as const
type Unit = typeof UNITS[number]

// ---------------------------------------------------------------------------
// Unit conversion table
// conversionFactor(from, to) = how many `to` units are in 1 `from` unit
// ---------------------------------------------------------------------------

const CONVERSION_TABLE: Partial<Record<Unit, Partial<Record<Unit, number>>>> = {
  // Weight
  oz:    { lb: 1 / 16,        g: 28.3495,    kg: 0.0283495 },
  lb:    { oz: 16,             g: 453.592,    kg: 0.453592  },
  g:     { oz: 1 / 28.3495,   lb: 1 / 453.592, kg: 0.001   },
  kg:    { oz: 1000 / 28.3495, lb: 1 / 0.453592, g: 1000   },
  // Volume
  fl_oz: { gal: 1 / 128,      ml: 29.5735,   l: 0.0295735  },
  gal:   { fl_oz: 128,         ml: 3785.41,   l: 3.78541    },
  ml:    { fl_oz: 1 / 29.5735, gal: 1 / 3785.41, l: 0.001  },
  l:     { fl_oz: 1 / 0.0295735, gal: 1 / 3.78541, ml: 1000 },
}

function conversionFactor(from: Unit, to: Unit): number | null {
  if (from === to) return 1
  return CONVERSION_TABLE[from]?.[to] ?? null
}

function formatNumber(n: number, sigFigs = 6): string {
  if (Number.isInteger(n)) return n.toString()
  // Show up to sigFigs significant digits, strip trailing zeros
  return parseFloat(n.toPrecision(sigFigs)).toString()
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const ingredientSchema = z.object({
  name:         z.string().min(1, 'Name is required'),
  sku:          z.string(),
  unit:         z.enum(UNITS, { error: () => ({ message: 'Select a unit' }) }),
  category:     z.string(),
  pricingMode:  z.enum(['direct', 'bulk']),
  unitCost:     z.string(),
  totalPaid:    z.string(),
  totalQty:     z.string(),
  purchaseUnit: z.enum(UNITS),
}).superRefine((val, ctx) => {
  if (val.pricingMode === 'direct') {
    const v = Number(val.unitCost)
    if (!val.unitCost || isNaN(v) || v <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be > 0', path: ['unitCost'] })
    }
  } else {
    const paid = Number(val.totalPaid)
    const qty  = Number(val.totalQty)
    if (!val.totalPaid || isNaN(paid) || paid <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required', path: ['totalPaid'] })
    }
    if (!val.totalQty || isNaN(qty) || qty <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required', path: ['totalQty'] })
    }
    // Zero-cost guard: check derived cost
    if (val.totalPaid && val.totalQty && paid > 0 && qty > 0) {
      const factor = conversionFactor(val.purchaseUnit as Unit, val.unit as Unit)
      if (factor !== null) {
        const derived = (paid / qty) / factor
        if (derived <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Derived cost must be > 0', path: ['totalPaid'] })
        }
      }
    }
  }
})

const formSchema = z.object({ ingredients: z.array(ingredientSchema).min(1) })
type FormValues   = z.infer<typeof formSchema>
type IngredientRow = z.infer<typeof ingredientSchema>

const BLANK: IngredientRow = {
  name: '', sku: '', unit: 'oz', category: '',
  pricingMode: 'direct',
  unitCost: '', totalPaid: '', totalQty: '', purchaseUnit: 'lb',
}

// ---------------------------------------------------------------------------
// Derivation chain component
// Shows the live unit cost calculation in bulk mode
// ---------------------------------------------------------------------------

function DerivationChain({
  totalPaid,
  totalQty,
  purchaseUnit,
  ingredientUnit,
}: {
  totalPaid: string
  totalQty: string
  purchaseUnit: Unit
  ingredientUnit: Unit
}) {
  const paid = Number(totalPaid)
  const qty  = Number(totalQty)

  if (!totalPaid || !totalQty || isNaN(paid) || isNaN(qty) || paid <= 0 || qty <= 0) {
    return (
      <p className="text-xs text-white/25 italic">
        Enter amount and quantity above to see the cost derivation.
      </p>
    )
  }

  const pricePerPurchaseUnit = paid / qty
  const factor = conversionFactor(purchaseUnit, ingredientUnit)

  if (purchaseUnit === ingredientUnit) {
    // No conversion needed
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span className="font-mono text-white/70">
            ${formatCurrency(paid)} ÷ {formatNumber(qty)} {purchaseUnit}
          </span>
          <span>=</span>
          <span className="font-semibold text-teal-300">
            ${formatCurrency(pricePerPurchaseUnit)}/{ingredientUnit}
          </span>
        </div>
      </div>
    )
  }

  if (factor === null) {
    // Incompatible units (e.g., lb vs ml)
    return (
      <div className="flex items-center gap-2 text-xs text-amber-400">
        <AlertCircle size={12} />
        <span>
          Can&apos;t convert {purchaseUnit} → {ingredientUnit}. Change one of the units above.
        </span>
      </div>
    )
  }

  const derivedCost = pricePerPurchaseUnit / factor
  const convertedQty = qty * factor

  return (
    <div className="space-y-2">
      {/* Quantity conversion */}
      <div className="flex items-center gap-1.5 text-xs text-white/40">
        <span className="font-mono">
          {formatNumber(qty)} {purchaseUnit} = {formatNumber(convertedQty)} {ingredientUnit}
        </span>
      </div>

      {/* Cost chain */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white/60">
          ${formatCurrency(paid)}
        </span>
        <span className="text-white/25">÷</span>
        <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white/60">
          {formatNumber(qty)} {purchaseUnit}
        </span>
        <span className="text-white/25">×</span>
        <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white/50">
          (1 {purchaseUnit} / {formatNumber(factor)} {ingredientUnit})
        </span>
        <ArrowRight size={12} className="text-white/20" />
        <span className="rounded bg-teal-500/15 px-2 py-0.5 font-mono font-semibold text-teal-300">
          ${formatCurrency(derivedCost)}/{ingredientUnit}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-ingredient card
// ---------------------------------------------------------------------------

function IngredientCard({
  index,
  control,
  errors,
  onRemove,
  canRemove,
}: {
  index: number
  control: Control<FormValues>
  errors: FormValues['ingredients'][number] | undefined
  onRemove: () => void
  canRemove: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const watched = useWatch({ control, name: `ingredients.${index}` })

  const pricingMode   = watched?.pricingMode ?? 'direct'
  const ingredientUnit = (watched?.unit ?? 'oz') as Unit
  const purchaseUnit  = (watched?.purchaseUnit ?? 'lb') as Unit

  // For error access — react-hook-form errors don't deeply type on field arrays easily
  const e = errors as Record<string, { message?: string }> | undefined

  function field(name: keyof IngredientRow) {
    return `ingredients.${index}.${name}` as const
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
      {/* Card header */}
      <div
        className="flex cursor-pointer items-center justify-between px-5 py-4"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-400">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-white">
            {watched?.name || <span className="text-white/30">Unnamed ingredient</span>}
          </span>
          {watched?.unit && watched?.name && (
            <span className="text-xs text-white/30">({watched.unit})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              className="rounded p-1 text-white/20 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          )}
          {collapsed
            ? <ChevronDown size={16} className="text-white/30" />
            : <ChevronUp   size={16} className="text-white/30" />
          }
        </div>
      </div>

      {!collapsed && (
        <div className="border-t border-white/5 px-5 pb-5 pt-4 space-y-5">
          {/* ── Row 1: Name + SKU ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-white/50">
                Name <span className="text-yellow-500">*</span>
              </label>
              <Controller
                control={control}
                name={field('name')}
                render={({ field: f }) => (
                  <input
                    {...f}
                    placeholder="Habanero Peppers"
                    className={inputCls(!!e?.name)}
                  />
                )}
              />
              {e?.name && <p className="mt-0.5 text-xs text-yellow-400">{e.name.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/50">SKU</label>
              <Controller
                control={control}
                name={field('sku')}
                render={({ field: f }) => (
                  <input {...f} placeholder="HAB-001" className={inputCls(false)} />
                )}
              />
            </div>
          </div>

          {/* ── Row 2: Unit + Category ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/50">
                Recipe Unit <span className="text-yellow-500">*</span>
              </label>
              <Controller
                control={control}
                name={field('unit')}
                render={({ field: f }) => (
                  <select value={f.value} onChange={f.onChange} className={selectCls(!!e?.unit)}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                )}
              />
              {e?.unit && <p className="mt-0.5 text-xs text-yellow-400">{e.unit.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/50">Category</label>
              <Controller
                control={control}
                name={field('category')}
                render={({ field: f }) => (
                  <select value={f.value} onChange={f.onChange} className={selectCls(false)}>
                    <option value="">—</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              />
            </div>
          </div>

          {/* ── Pricing toggle ── */}
          <div>
            <p className="mb-2 text-xs font-medium text-white/50">Pricing</p>
            <Controller
              control={control}
              name={field('pricingMode')}
              render={({ field: f }) => (
                <div className="inline-flex rounded-lg border border-white/10 p-0.5">
                  {(['direct', 'bulk'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => f.onChange(mode)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors
                        ${f.value === mode
                          ? 'bg-teal-500 text-white'
                          : 'text-white/40 hover:text-white/70'
                        }`}
                    >
                      {mode === 'direct' ? 'I know the unit cost' : 'I\'ll enter bulk details'}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          {/* ── Direct mode ── */}
          {pricingMode === 'direct' && (
            <div className="max-w-xs">
              <label className="mb-1 block text-xs font-medium text-white/50">
                Unit Cost ($ per {ingredientUnit}) <span className="text-yellow-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/30">$</span>
                <Controller
                  control={control}
                  name={field('unitCost')}
                  render={({ field: f }) => (
                    <input
                      {...f}
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      className={`${inputCls(!!e?.unitCost)} pl-7`}
                    />
                  )}
                />
              </div>
              {e?.unitCost && <p className="mt-0.5 text-xs text-yellow-400">{e.unitCost.message}</p>}
            </div>
          )}

          {/* ── Bulk mode ── */}
          {pricingMode === 'bulk' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {/* Total Amount Paid */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/50">
                    Total Amount Paid <span className="text-yellow-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/30">$</span>
                    <Controller
                      control={control}
                      name={field('totalPaid')}
                      render={({ field: f }) => (
                        <input
                          {...f}
                          type="number"
                          step="any"
                          min="0"
                          placeholder="45.00"
                          className={`${inputCls(!!e?.totalPaid)} pl-7`}
                        />
                      )}
                    />
                  </div>
                  {e?.totalPaid && <p className="mt-0.5 text-xs text-yellow-400">{e.totalPaid.message}</p>}
                </div>

                {/* Total Quantity */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/50">
                    Qty Purchased <span className="text-yellow-500">*</span>
                  </label>
                  <Controller
                    control={control}
                    name={field('totalQty')}
                    render={({ field: f }) => (
                      <input
                        {...f}
                        type="number"
                        step="any"
                        min="0"
                        placeholder="50"
                        className={inputCls(!!e?.totalQty)}
                      />
                    )}
                  />
                  {e?.totalQty && <p className="mt-0.5 text-xs text-yellow-400">{e.totalQty.message}</p>}
                </div>

                {/* Purchase Unit */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/50">
                    Purchase Unit
                  </label>
                  <Controller
                    control={control}
                    name={field('purchaseUnit')}
                    render={({ field: f }) => (
                      <select value={f.value} onChange={f.onChange} className={selectCls(false)}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    )}
                  />
                </div>
              </div>

              {/* Derivation chain */}
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="mb-2 text-xs font-medium text-white/30 uppercase tracking-wide">
                  Cost derivation
                </p>
                <DerivationChain
                  totalPaid={watched?.totalPaid ?? ''}
                  totalQty={watched?.totalQty ?? ''}
                  purchaseUnit={purchaseUnit}
                  ingredientUnit={ingredientUnit}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Shared input/select classnames
function inputCls(error: boolean) {
  return `w-full rounded-lg border px-3 py-2 text-sm text-white bg-transparent focus:outline-none focus:ring-1
    ${error
      ? 'border-yellow-500/60 bg-yellow-500/5 focus:ring-yellow-500/50'
      : 'border-white/10 focus:border-teal-500 focus:ring-teal-500/30'
    }`
}
function selectCls(error: boolean) {
  return `w-full rounded-lg border px-3 py-2 text-sm text-white bg-[#0D1B2A] focus:outline-none focus:ring-1
    ${error
      ? 'border-yellow-500/60 focus:ring-yellow-500/50'
      : 'border-white/10 focus:border-teal-500 focus:ring-teal-500/30'
    }`
}

// react-hook-form Controller import is needed in the sub-component
import { Controller } from 'react-hook-form'

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ManualPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const { control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { ingredients: [BLANK] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'ingredients' })

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const onSubmit = async (values: FormValues) => {
    setSaving(true)
    try {
      const rows = values.ingredients.map((ing) => {
        let cost: number | null = null
        if (ing.pricingMode === 'direct') {
          cost = Number(ing.unitCost)
        } else {
          const paid = Number(ing.totalPaid)
          const qty  = Number(ing.totalQty)
          const factor = conversionFactor(ing.purchaseUnit as Unit, ing.unit as Unit)
          if (factor !== null && qty > 0) cost = paid / qty / factor
        }
        return {
          name: ing.name,
          sku: ing.sku || undefined,
          unit: ing.unit,
          category: ing.category || undefined,
          cost_per_unit: cost,
        }
      })

      const { count } = await bulkInsertIngredients(rows)
      showToast(`${count} ingredient${count !== 1 ? 's' : ''} saved!`, true)
      setTimeout(() => router.push('/dashboard/ingredients'), 1600)
    } catch (e) {
      showToast((e as Error).message, false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Enter Ingredients Manually</h1>
        <p className="mt-1 text-sm text-white/40">
          Add one ingredient at a time. You can bulk-import more later.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {fields.map((field, i) => (
          <IngredientCard
            key={field.id}
            index={i}
            control={control}
            errors={errors.ingredients?.[i] as FormValues['ingredients'][number] | undefined}
            onRemove={() => remove(i)}
            canRemove={fields.length > 1}
          />
        ))}

        {/* Add another */}
        <button
          type="button"
          onClick={() => append(BLANK)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-4 text-sm text-white/40 transition-colors hover:border-teal-500/40 hover:text-teal-300"
        >
          <Plus size={16} />
          Add Another Ingredient
        </button>

        {/* Summary + save */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
          <p className="text-sm text-white/50">
            <span className="font-semibold text-white">{fields.length}</span>{' '}
            ingredient{fields.length !== 1 ? 's' : ''} to save
          </p>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save All Ingredients'}
          </button>
        </div>
      </form>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-xl
            ${toast.ok ? 'bg-teal-500 text-white' : 'bg-red-500 text-white'}`}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
