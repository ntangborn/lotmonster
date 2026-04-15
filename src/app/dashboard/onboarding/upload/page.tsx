'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { Plus, Trash2, AlertCircle, CheckCircle2, Loader2, UploadCloud, Sparkles } from 'lucide-react'
import { bulkInsertIngredients } from '@/lib/actions/ingredients'
import { validateIngredientCost } from '@/lib/validation'
import { ZeroCostWarning } from '@/components/zero-cost-warning'
import { getPendingFile, clearPendingFile } from '@/lib/onboarding-file'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNITS = ['oz', 'lb', 'gal', 'fl_oz', 'g', 'kg', 'ml', 'l', 'each'] as const
const CATEGORIES = ['raw_material', 'packaging', 'label'] as const
const LM_FIELDS = ['name', 'sku', 'unit', 'category', 'quantity', 'unit_cost', '(ignore)'] as const
const ACCEPTED = '.csv,.xlsx,.xls,.jpg,.jpeg,.png,.pdf'
const SPREADSHEET_TYPES = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']

// Column name → Lotmonster field (auto-detect)
const HEADER_MAP: Record<string, string> = {
  name: 'name', ingredient: 'name', 'ingredient name': 'name',
  item: 'name', 'item name': 'name', material: 'name', description: 'name',
  sku: 'sku', code: 'sku', 'item code': 'sku', 'product code': 'sku',
  unit: 'unit', uom: 'unit', 'unit of measure': 'unit', measure: 'unit',
  cost: 'unit_cost', price: 'unit_cost', 'unit cost': 'unit_cost',
  'unit price': 'unit_cost', 'cost per unit': 'unit_cost', 'price per unit': 'unit_cost',
  quantity: 'quantity', qty: 'quantity', amount: 'quantity', stock: 'quantity',
  category: 'category', type: 'category', kind: 'category',
}

function normalizeHeader(h: string) {
  return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').trim()
}

function detectMapping(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {}
  headers.forEach((h, i) => {
    const normalized = normalizeHeader(h)
    if (HEADER_MAP[normalized]) map[i] = HEADER_MAP[normalized]
  })
  return map
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const rowSchema = z.object({
  name: z.string().min(1, 'Required'),
  sku: z.string(),
  unit: z.enum(UNITS, { error: () => ({ message: 'Select a unit' }) }),
  category: z.string(),
  qty: z.string(),
  unit_cost: z.string()
    .refine((v) => !v || Number(v) !== 0, 'Unit cost cannot be $0.00')
    .refine((v) => !v || Number(v) >= 0, 'Unit cost cannot be negative'),
})

const formSchema = z.object({ rows: z.array(rowSchema).min(1) })
type FormValues = z.infer<typeof formSchema>
type RowValues = z.infer<typeof rowSchema>

const BLANK_ROW: RowValues = { name: '', sku: '', unit: 'oz', category: '', qty: '', unit_cost: '' }

// ---------------------------------------------------------------------------
// Parsing utilities
// ---------------------------------------------------------------------------

function parseSpreadsheet(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
        if (data.length < 2) return reject(new Error('File appears to be empty.'))
        const headers = (data[0] as string[]).map(String)
        const rows = data.slice(1).map((r) => (r as string[]).map(String)) as string[][]
        resolve({ headers, rows: rows.filter((r) => r.some((c) => c.trim())) })
      } catch {
        reject(new Error('Could not parse file. Make sure it is a valid CSV or Excel file.'))
      }
    }
    reader.onerror = () => reject(new Error('File read error.'))
    reader.readAsArrayBuffer(file)
  })
}

function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: Record<number, string>
): RowValues[] {
  return rows.map((row) => {
    const draft: Partial<RowValues> = {}
    Object.entries(mapping).forEach(([idxStr, field]) => {
      const val = row[Number(idxStr)]?.trim() ?? ''
      if (!val) return
      if (field === 'name') draft.name = val
      else if (field === 'sku') draft.sku = val
      else if (field === 'unit') {
        const u = val.toLowerCase()
        draft.unit = (UNITS as readonly string[]).includes(u) ? (u as typeof UNITS[number]) : 'oz'
      }
      else if (field === 'category') {
        const c = val.toLowerCase().replace(/\s+/g, '_')
        draft.category = (CATEGORIES as readonly string[]).includes(c)
          ? (c as typeof CATEGORIES[number])
          : ''
      }
      else if (field === 'quantity') draft.qty = isNaN(Number(val)) ? '' : val
      else if (field === 'unit_cost') draft.unit_cost = isNaN(Number(val)) ? '' : val
    })
    return { ...BLANK_ROW, ...draft }
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Column mapping UI
function MappingUI({
  headers,
  mapping,
  onChange,
  onConfirm,
}: {
  headers: string[]
  mapping: Record<number, string>
  onChange: (m: Record<number, string>) => void
  onConfirm: () => void
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h2 className="mb-1 text-base font-semibold text-white">Map Your Columns</h2>
      <p className="mb-5 text-sm text-white/40">
        We couldn&apos;t auto-detect all columns. Tell us what each column contains.
      </p>
      <div className="space-y-3">
        {headers.map((header, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-40 truncate text-sm text-white/60" title={header}>{header}</span>
            <span className="text-white/20">→</span>
            <select
              value={mapping[i] ?? '(ignore)'}
              onChange={(e) => {
                const next = { ...mapping }
                if (e.target.value === '(ignore)') delete next[i]
                else next[i] = e.target.value
                onChange(next)
              }}
              className="rounded-lg border border-white/10 bg-[#0D1B2A] px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
            >
              {LM_FIELDS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        onClick={onConfirm}
        className="mt-5 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400"
      >
        Confirm Mapping
      </button>
    </div>
  )
}

// Inline cell input
function Cell({
  value,
  onChange,
  error,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  error?: boolean
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded border px-2 py-1.5 text-sm text-white bg-transparent focus:outline-none focus:ring-1
        ${error
          ? 'border-yellow-500/60 bg-yellow-500/5 focus:ring-yellow-500/50'
          : 'border-white/10 focus:border-teal-500 focus:ring-teal-500/30'
        }`}
    />
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Stage =
  | { type: 'selecting' }
  | { type: 'parsing' }                       // spreadsheet parsing (local, fast)
  | { type: 'vision' }                        // AI image/PDF extraction (network)
  | { type: 'vision_failed'; raw?: string }   // Claude returned unparseable output
  | { type: 'mapping'; headers: string[]; rawRows: string[][] }
  | { type: 'confirming' }
  | { type: 'saving' }
  | { type: 'done'; count: number }
  | { type: 'error'; message: string }

export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>({ type: 'selecting' })
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([])
  const [mappingRawRows, setMappingRawRows] = useState<string[][]>([])
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const { control, register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { rows: [BLANK_ROW] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'rows' })

  // Count rows with no cost set (valid but will trigger a warning banner)
  const watchedRows = useWatch({ control, name: 'rows' })
  const missingCostCount = watchedRows.filter(
    (r) => validateIngredientCost(r?.unit_cost).warn
  ).length

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------

  const processFile = useCallback(async (file: File) => {
    setStage({ type: 'parsing' })

    const isSpreadsheet =
      SPREADSHEET_TYPES.includes(file.type) ||
      file.name.match(/\.(csv|xlsx|xls)$/i)

    if (isSpreadsheet) {
      try {
        const { headers, rows } = await parseSpreadsheet(file)
        const detected = detectMapping(headers)
        const hasName = Object.values(detected).includes('name')

        if (hasName) {
          // Auto-detect succeeded — go straight to confirmation table
          const draftRows = applyMapping(headers, rows, detected)
          reset({ rows: draftRows.length > 0 ? draftRows : [BLANK_ROW] })
          setStage({ type: 'confirming' })
        } else {
          // Show mapping UI
          setMappingHeaders(headers)
          setMappingRawRows(rows)
          setMapping(detected)
          setStage({ type: 'mapping', headers, rawRows: rows })
        }
      } catch (e) {
        setStage({ type: 'error', message: (e as Error).message })
      }
    } else {
      // Image or PDF → Claude Vision via /api/ai/extract-ingredients
      setStage({ type: 'vision' })
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/ai/extract-ingredients', { method: 'POST', body: fd })
        const json = await res.json()

        if (!res.ok) {
          // 422 = Claude returned unparseable output (show fallback UI)
          if (res.status === 422 && json.fallback) {
            setStage({ type: 'vision_failed', raw: json.raw })
            return
          }
          throw new Error(json.error ?? 'AI extraction failed.')
        }

        const ingredients = json.ingredients as Array<{
          name: string; sku?: string | null; unit?: string | null
          category?: string | null; quantity?: number | null; unit_cost?: number | null
        }>

        const draftRows: RowValues[] = ingredients.map((ing) => ({
          name: ing.name ?? '',
          sku: ing.sku ?? '',
          unit: (UNITS as readonly string[]).includes(ing.unit ?? '')
            ? (ing.unit as typeof UNITS[number])
            : 'oz',
          category: (CATEGORIES as readonly string[]).includes(ing.category ?? '')
            ? ing.category!
            : '',
          qty: ing.quantity != null ? String(ing.quantity) : '',
          unit_cost: ing.unit_cost != null ? String(ing.unit_cost) : '',
        }))

        reset({ rows: draftRows.length > 0 ? draftRows : [BLANK_ROW] })
        setStage({ type: 'confirming' })
      } catch (e) {
        setStage({ type: 'error', message: (e as Error).message })
      }
    }
  }, [reset])

  // If the welcome screen's global drag-drop deposited a file, process it now.
  useEffect(() => {
    const file = getPendingFile()
    if (file) {
      clearPendingFile()
      processFile(file)
    }
  }, [processFile])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  // ---------------------------------------------------------------------------
  // Mapping confirmation
  // ---------------------------------------------------------------------------

  function confirmMapping() {
    const draftRows = applyMapping(mappingHeaders, mappingRawRows, mapping)
    reset({ rows: draftRows.length > 0 ? draftRows : [BLANK_ROW] })
    setStage({ type: 'confirming' })
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const onSubmit = async (values: FormValues) => {
    setStage({ type: 'saving' })
    try {
      const rows = values.rows.map((r) => ({
        name: r.name,
        sku: r.sku || undefined,
        unit: r.unit,
        category: r.category || undefined,
        cost_per_unit: r.unit_cost !== '' && r.unit_cost != null ? Number(r.unit_cost) : null,
        low_stock_threshold: r.qty !== '' && r.qty != null ? Number(r.qty) : null,
      }))
      const { count } = await bulkInsertIngredients(rows)
      setStage({ type: 'done', count })
      showToast(`${count} ingredient${count !== 1 ? 's' : ''} saved!`, true)
      setTimeout(() => router.push('/dashboard/ingredients'), 1800)
    } catch (e) {
      setStage({ type: 'confirming' })
      showToast((e as Error).message, false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Upload Ingredients</h1>
        <p className="mt-1 text-sm text-white/40">
          Upload a file and review the extracted data before saving.
        </p>
      </div>

      {/* ── Stage: selecting ── */}
      {stage.type === 'selecting' && (
        <div
          onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragging(false) }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-16 transition-colors
            ${dragging ? 'border-teal-400 bg-teal-500/10' : 'border-white/15 bg-white/[0.02] hover:border-white/25'}`}
        >
          <input ref={fileInputRef} type="file" accept={ACCEPTED} className="sr-only" onChange={handleFileInput} />
          <UploadCloud size={40} className={dragging ? 'text-teal-400' : 'text-white/20'} />
          <div className="text-center">
            <p className="text-sm font-medium text-white/60">
              {dragging ? 'Drop to parse' : 'Drop a file or click to browse'}
            </p>
            <p className="mt-1 text-xs text-white/25">.csv · .xlsx · .xls · .jpg · .png · .pdf</p>
          </div>
        </div>
      )}

      {/* ── Stage: parsing (spreadsheet — local) ── */}
      {stage.type === 'parsing' && (
        <div className="flex flex-col items-center gap-3 py-20">
          <Loader2 size={32} className="animate-spin text-teal-400" />
          <p className="text-sm text-white/50">Parsing file…</p>
        </div>
      )}

      {/* ── Stage: vision (AI image/PDF extraction) ── */}
      {stage.type === 'vision' && (
        <div className="flex flex-col items-center gap-4 py-20">
          <div className="relative">
            <Loader2 size={40} className="animate-spin text-teal-400" />
            <Sparkles
              size={16}
              className="absolute -right-1 -top-1 text-teal-300 animate-pulse"
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white">AI is reading your image…</p>
            <p className="mt-1 text-xs text-white/30">
              Claude is extracting ingredient names, units, and costs
            </p>
          </div>
          <div className="mt-2 flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Stage: vision_failed (fallback) ── */}
      {stage.type === 'vision_failed' && (
        <div className="mx-auto max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
          <div className="mb-4 text-3xl">🤔</div>
          <h2 className="mb-2 text-base font-semibold text-white">
            AI couldn&apos;t read this image
          </h2>
          <p className="mb-1 text-sm text-white/50">
            The image may be too blurry, low-contrast, or not contain ingredient data
            in a recognisable format.
          </p>
          <p className="mb-6 text-xs text-white/30">
            Try a clearer photo, or switch to manual entry.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setStage({ type: 'selecting' })}
              className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-400"
            >
              Try a different image
            </button>
            <button
              onClick={() => {
                reset({ rows: [BLANK_ROW] })
                setStage({ type: 'confirming' })
              }}
              className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/50 hover:text-white"
            >
              Enter manually instead
            </button>
          </div>
        </div>
      )}

      {/* ── Stage: mapping ── */}
      {stage.type === 'mapping' && (
        <MappingUI
          headers={mappingHeaders}
          mapping={mapping}
          onChange={setMapping}
          onConfirm={confirmMapping}
        />
      )}

      {/* ── Stage: confirming / saving ── */}
      {(stage.type === 'confirming' || stage.type === 'saving') && (
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-white/50">
              {fields.length} row{fields.length !== 1 ? 's' : ''} · Review and edit before saving
            </p>
            <button
              type="button"
              onClick={() => append(BLANK_ROW)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:border-teal-500/40 hover:text-teal-300"
            >
              <Plus size={12} /> Add Row
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs text-white/40">
                  <th className="px-3 py-2.5 font-medium">Name <span className="text-yellow-500">*</span></th>
                  <th className="px-3 py-2.5 font-medium">SKU</th>
                  <th className="px-3 py-2.5 font-medium">Unit <span className="text-yellow-500">*</span></th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Qty</th>
                  <th className="px-3 py-2.5 font-medium">Unit Cost ($)</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => {
                  const rowErrors = errors.rows?.[i]
                  return (
                    <tr key={field.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      {/* Name */}
                      <td className="px-2 py-1.5 min-w-[160px]">
                        <Controller
                          control={control}
                          name={`rows.${i}.name`}
                          render={({ field: f }) => (
                            <Cell value={f.value} onChange={f.onChange} error={!!rowErrors?.name} placeholder="Habaneros" />
                          )}
                        />
                      </td>
                      {/* SKU */}
                      <td className="px-2 py-1.5 min-w-[100px]">
                        <Controller
                          control={control}
                          name={`rows.${i}.sku`}
                          render={({ field: f }) => (
                            <Cell value={f.value ?? ''} onChange={f.onChange} placeholder="HAB-001" />
                          )}
                        />
                      </td>
                      {/* Unit */}
                      <td className="px-2 py-1.5">
                        <Controller
                          control={control}
                          name={`rows.${i}.unit`}
                          render={({ field: f }) => (
                            <select
                              value={f.value}
                              onChange={f.onChange}
                              className={`rounded border bg-transparent px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1
                                ${rowErrors?.unit
                                  ? 'border-yellow-500/60 bg-yellow-500/5 focus:ring-yellow-500/50'
                                  : 'border-white/10 focus:border-teal-500 focus:ring-teal-500/30'
                                }`}
                            >
                              <option value="" disabled>—</option>
                              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          )}
                        />
                      </td>
                      {/* Category */}
                      <td className="px-2 py-1.5">
                        <Controller
                          control={control}
                          name={`rows.${i}.category`}
                          render={({ field: f }) => (
                            <select
                              value={f.value ?? ''}
                              onChange={f.onChange}
                              className="rounded border border-white/10 bg-transparent px-2 py-1.5 text-sm text-white/70 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30"
                            >
                              <option value="">—</option>
                              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                        />
                      </td>
                      {/* Qty */}
                      <td className="px-2 py-1.5 min-w-[80px]">
                        <Controller
                          control={control}
                          name={`rows.${i}.qty`}
                          render={({ field: f }) => (
                            <Cell value={f.value ?? ''} onChange={f.onChange} type="number" placeholder="0" />
                          )}
                        />
                      </td>
                      {/* Unit Cost */}
                      <td className="px-2 py-1.5 min-w-[100px]">
                        <Controller
                          control={control}
                          name={`rows.${i}.unit_cost`}
                          render={({ field: f }) => (
                            <Cell
                              value={f.value ?? ''}
                              onChange={f.onChange}
                              type="number"
                              placeholder="0.00"
                              error={!!rowErrors?.unit_cost}
                            />
                          )}
                        />
                      </td>
                      {/* Remove */}
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          disabled={fields.length === 1}
                          className="rounded p-1 text-white/20 transition-colors hover:text-red-400 disabled:opacity-30"
                          title="Remove row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Validation summary */}
          {errors.rows && (
            <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400">
              <AlertCircle size={13} />
              Fix highlighted fields before saving. Name and Unit are required; Cost cannot be $0.00 or negative.
            </div>
          )}

          {/* Zero-cost warning */}
          {!errors.rows && missingCostCount > 0 && (
            <div className="mt-3">
              <ZeroCostWarning count={missingCostCount} />
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={stage.type === 'saving'}
              className="flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
            >
              {stage.type === 'saving' && <Loader2 size={14} className="animate-spin" />}
              {stage.type === 'saving' ? 'Saving…' : 'Save Ingredients'}
            </button>
            <button
              type="button"
              onClick={() => setStage({ type: 'selecting' })}
              className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/50 hover:text-white"
            >
              Upload different file
            </button>
          </div>
        </form>
      )}

      {/* ── Stage: error ── */}
      {stage.type === 'error' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertCircle size={24} className="mx-auto mb-3 text-red-400" />
          <p className="text-sm text-red-300">{stage.message}</p>
          <button
            onClick={() => setStage({ type: 'selecting' })}
            className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Stage: done ── */}
      {stage.type === 'done' && (
        <div className="flex flex-col items-center gap-3 py-20">
          <CheckCircle2 size={40} className="text-teal-400" />
          <p className="text-base font-semibold text-white">
            {stage.count} ingredient{stage.count !== 1 ? 's' : ''} saved
          </p>
          <p className="text-sm text-white/40">Redirecting to ingredients…</p>
        </div>
      )}

      {/* ── Toast ── */}
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
