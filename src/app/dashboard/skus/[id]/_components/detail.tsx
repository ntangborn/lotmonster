'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Pencil,
  Save,
  Trash2,
  X,
  Loader2,
  Plus,
} from 'lucide-react'
import type { SkuDetail } from '@/lib/skus/queries'
import { UNITS } from '@/lib/ingredients/schema'

interface Props {
  initial: SkuDetail
  packagingIngredients: Array<{ id: string; name: string; unit: string }>
}

interface BomDraftRow {
  key: string // local-only id for React keys during editing
  ingredient_id: string
  quantity: string
  unit: string
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}
function fmtCost(n: number | null, digits = 2): string {
  if (n == null) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

export function SkuDetailView({ initial, packagingIngredients }: Props) {
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [err, setErr] = useState('')

  // ── Overview edit state ───────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const sku = data.sku

  const [name, setName] = useState(sku.name)
  const [upc, setUpc] = useState(sku.upc ?? '')
  const [fillQty, setFillQty] = useState(
    sku.fill_quantity != null ? String(sku.fill_quantity) : ''
  )
  const [fillUnit, setFillUnit] = useState(sku.fill_unit ?? 'fl_oz')
  const [shelfLife, setShelfLife] = useState(
    sku.shelf_life_days != null ? String(sku.shelf_life_days) : ''
  )
  const [retail, setRetail] = useState(
    sku.retail_price != null ? String(sku.retail_price) : ''
  )
  const [lotPrefix, setLotPrefix] = useState(sku.lot_prefix ?? '')
  const [qboItemId, setQboItemId] = useState(sku.qbo_item_id ?? '')
  const [active, setActive] = useState(sku.active ?? true)
  const [notes, setNotes] = useState(sku.notes ?? '')

  function resetEdits() {
    setName(sku.name)
    setUpc(sku.upc ?? '')
    setFillQty(sku.fill_quantity != null ? String(sku.fill_quantity) : '')
    setFillUnit(sku.fill_unit ?? 'fl_oz')
    setShelfLife(
      sku.shelf_life_days != null ? String(sku.shelf_life_days) : ''
    )
    setRetail(sku.retail_price != null ? String(sku.retail_price) : '')
    setLotPrefix(sku.lot_prefix ?? '')
    setQboItemId(sku.qbo_item_id ?? '')
    setActive(sku.active ?? true)
    setNotes(sku.notes ?? '')
  }

  function toNumberOrNull(v: string): number | null {
    const s = v.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  async function refresh() {
    const res = await fetch(`/api/skus/${sku.id}`, { cache: 'no-store' })
    if (res.ok) {
      const next = (await res.json()) as SkuDetail
      setData(next)
    }
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setErr('')
    const body = {
      name: name.trim(),
      upc: upc.trim() || null,
      fill_quantity: toNumberOrNull(fillQty),
      fill_unit: fillQty.trim() ? fillUnit : null,
      shelf_life_days: toNumberOrNull(shelfLife),
      retail_price: toNumberOrNull(retail),
      lot_prefix: lotPrefix.trim() || null,
      qbo_item_id: qboItemId.trim() || null,
      active,
      notes: notes.trim() || null,
    }
    const res = await fetch(`/api/skus/${sku.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setErr(e.error ?? 'Save failed')
      return
    }
    setEditing(false)
    await refresh()
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${sku.name}"? This cannot be undone and will fail if the SKU has lots, production outputs, sales lines, or children.`
      )
    ) {
      return
    }
    setDeleting(true)
    setErr('')
    const res = await fetch(`/api/skus/${sku.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setDeleting(false)
      setErr(e.error ?? 'Delete failed')
      return
    }
    router.replace('/dashboard/skus')
  }

  // ── BOM state ─────────────────────────────────────────────────────────
  const initialBomRows: BomDraftRow[] = data.packaging.map((p) => ({
    key: p.id,
    ingredient_id: p.ingredient_id,
    quantity: String(p.quantity),
    unit: p.unit ?? '',
  }))
  const [bomEditing, setBomEditing] = useState(false)
  const [bomSaving, setBomSaving] = useState(false)
  const [bomRows, setBomRows] = useState<BomDraftRow[]>(initialBomRows)

  function startBomEdit() {
    setBomRows(
      data.packaging.map((p) => ({
        key: p.id,
        ingredient_id: p.ingredient_id,
        quantity: String(p.quantity),
        unit: p.unit ?? '',
      }))
    )
    setBomEditing(true)
    setErr('')
  }

  function addBomRow() {
    setBomRows((rows) => [
      ...rows,
      {
        key: `new-${Math.random().toString(36).slice(2, 8)}`,
        ingredient_id: '',
        quantity: '1',
        unit: '',
      },
    ])
  }

  function updateBomRow(key: string, patch: Partial<BomDraftRow>) {
    setBomRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
    )
  }

  function removeBomRow(key: string) {
    setBomRows((rows) => rows.filter((r) => r.key !== key))
  }

  async function saveBom() {
    setBomSaving(true)
    setErr('')

    const entries: Array<{
      ingredient_id: string
      quantity: number
      unit: string | null
    }> = []
    for (const r of bomRows) {
      if (!r.ingredient_id) continue
      const qty = Number(r.quantity)
      if (!Number.isFinite(qty) || qty <= 0) {
        setBomSaving(false)
        setErr('Every BOM row needs a quantity > 0.')
        return
      }
      entries.push({
        ingredient_id: r.ingredient_id,
        quantity: qty,
        unit: r.unit.trim() || null,
      })
    }

    const res = await fetch(`/api/skus/${sku.id}/packaging`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    setBomSaving(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setErr(e.error ?? 'BOM save failed')
      return
    }
    setBomEditing(false)
    await refresh()
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

  // ── render ───────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/dashboard/skus"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to SKUs
      </Link>

      {err && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      {/* ── Section 1: Overview ─────────────────────────────────────── */}
      <Section title="Overview">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {editing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" required>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="UPC">
                  <input
                    value={upc}
                    onChange={(e) => setUpc(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Fill quantity">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={fillQty}
                    onChange={(e) => setFillQty(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Fill unit">
                  <select
                    value={fillUnit}
                    onChange={(e) => setFillUnit(e.target.value)}
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
                    value={shelfLife}
                    onChange={(e) => setShelfLife(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Retail price ($)">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={retail}
                    onChange={(e) => setRetail(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Lot prefix">
                  <input
                    value={lotPrefix}
                    onChange={(e) => setLotPrefix(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="QBO item id">
                  <input
                    value={qboItemId}
                    onChange={(e) => setQboItemId(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Active">
                  <label className="flex items-center gap-2 pt-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500"
                    />
                    Available for sale
                  </label>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Notes">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className={inputCls}
                      rows={2}
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold text-white">
                  {sku.name}
                  {!sku.active && (
                    <span className="ml-3 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 align-middle text-xs font-medium text-white/50">
                      inactive
                    </span>
                  )}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
                  <span>
                    Kind:{' '}
                    <span className="text-white/80">{sku.kind}</span>
                  </span>
                  {sku.upc && (
                    <span>
                      UPC:{' '}
                      <span className="font-mono text-white/80">{sku.upc}</span>
                    </span>
                  )}
                  {sku.fill_quantity != null && sku.fill_unit && (
                    <span>
                      Fill:{' '}
                      <span className="text-white/80">
                        {fmtNum(Number(sku.fill_quantity))} {sku.fill_unit}
                      </span>
                    </span>
                  )}
                  {sku.shelf_life_days != null && (
                    <span>
                      Shelf life:{' '}
                      <span className="text-white/80">
                        {sku.shelf_life_days}d
                      </span>
                    </span>
                  )}
                  {sku.lot_prefix && (
                    <span>
                      Lot prefix:{' '}
                      <span className="font-mono text-white/80">
                        {sku.lot_prefix}
                      </span>
                    </span>
                  )}
                  {data.recipe && (
                    <span>
                      Recipe:{' '}
                      <Link
                        href={`/dashboard/recipes/${data.recipe.id}`}
                        className="text-teal-300 hover:text-teal-200"
                      >
                        {data.recipe.name}
                      </Link>
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                  <span className="text-white/60">
                    On-hand:{' '}
                    <span className="font-mono text-white">
                      {fmtNum(sku.on_hand)}
                    </span>
                  </span>
                  <span className="text-white/60">
                    Retail:{' '}
                    <span className="font-mono text-white">
                      {fmtCost(
                        sku.retail_price != null
                          ? Number(sku.retail_price)
                          : null
                      )}
                    </span>
                  </span>
                  <span className="text-white/60">
                    Lots:{' '}
                    <span className="font-mono text-white">
                      {sku.lot_count}
                    </span>
                  </span>
                </div>
                {sku.notes && (
                  <p className="mt-3 text-sm text-white/50">{sku.notes}</p>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    resetEdits()
                    setEditing(false)
                    setErr('')
                  }}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
                >
                  <X size={14} />
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || !name.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* ── Section 2: Packaging BOM ────────────────────────────────── */}
      <Section
        title="Packaging BOM"
        subtitle="Bottles, caps, labels — consumed per unit at run completion."
        action={
          bomEditing ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setBomEditing(false)
                  setErr('')
                }}
                disabled={bomSaving}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
              >
                <X size={12} />
                Cancel
              </button>
              <button
                onClick={saveBom}
                disabled={bomSaving}
                className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
              >
                {bomSaving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                Save BOM
              </button>
            </div>
          ) : (
            <button
              onClick={startBomEdit}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              <Pencil size={12} />
              Edit BOM
            </button>
          )
        }
      >
        {bomEditing ? (
          <div className="space-y-2">
            {packagingIngredients.length === 0 && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
                No packaging ingredients yet. Go to{' '}
                <Link
                  href="/dashboard/ingredients/new"
                  className="underline hover:text-yellow-200"
                >
                  Add Ingredient
                </Link>{' '}
                and mark it kind=packaging first.
              </div>
            )}
            {bomRows.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/40">
                No packaging components yet. Click &ldquo;Add component&rdquo;
                to start.
              </div>
            )}
            {bomRows.map((row) => {
              const chosen = packagingIngredients.find(
                (i) => i.id === row.ingredient_id
              )
              return (
                <div
                  key={row.key}
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="flex-1 min-w-[220px]">
                    <span className="mb-1 block text-xs font-medium text-white/50">
                      Ingredient (packaging)
                    </span>
                    <select
                      value={row.ingredient_id}
                      onChange={(e) =>
                        updateBomRow(row.key, {
                          ingredient_id: e.target.value,
                        })
                      }
                      className={`${inputCls} bg-[#0D1B2A]`}
                    >
                      <option value="">— choose —</option>
                      {packagingIngredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <span className="mb-1 block text-xs font-medium text-white/50">
                      Qty per unit
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={row.quantity}
                      onChange={(e) =>
                        updateBomRow(row.key, { quantity: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div className="w-28">
                    <span className="mb-1 block text-xs font-medium text-white/50">
                      Unit
                    </span>
                    <input
                      value={row.unit}
                      onChange={(e) =>
                        updateBomRow(row.key, { unit: e.target.value })
                      }
                      placeholder={chosen?.unit ?? ''}
                      className={inputCls}
                    />
                  </div>
                  <button
                    onClick={() => removeBomRow(row.key)}
                    type="button"
                    className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={addBomRow}
              disabled={packagingIngredients.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 bg-white/[0.02] px-4 py-2 text-sm text-white/60 hover:bg-white/5 disabled:opacity-50"
            >
              <Plus size={14} />
              Add component
            </button>
          </div>
        ) : data.packaging.length === 0 ? (
          <Empty>
            No packaging components declared. Click &ldquo;Edit BOM&rdquo; to
            add bottles, caps, labels, etc.
          </Empty>
        ) : (
          <TableShell>
            <thead>
              <Tr header>
                <Th>Component</Th>
                <Th align="right">Qty per unit</Th>
                <Th>Unit</Th>
              </Tr>
            </thead>
            <tbody>
              {data.packaging.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link
                      href={`/dashboard/ingredients/${p.ingredient_id}`}
                      className="text-teal-300 hover:text-teal-200"
                    >
                      {p.ingredient_name}
                    </Link>
                  </Td>
                  <Td align="right" className="font-mono">
                    {fmtNum(p.quantity, 4)}
                  </Td>
                  <Td className="text-white/60">
                    {p.unit ?? p.ingredient_unit}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>

      {/* ── Section 3: Finished Lots ────────────────────────────────── */}
      <Section
        title={`Finished Lots (${data.finishedLots.length})`}
        subtitle="FEFO order — earliest expiry first."
      >
        {data.finishedLots.length === 0 ? (
          <Empty>
            No finished lots yet. Lots are created when a production run
            completes with this SKU as an output.
          </Empty>
        ) : (
          <TableShell>
            <thead>
              <Tr header>
                <Th>Lot #</Th>
                <Th align="right">Received</Th>
                <Th align="right">Remaining</Th>
                <Th>Unit</Th>
                <Th align="right">Unit Cost</Th>
                <Th>Received</Th>
                <Th>Expiry</Th>
                <Th>Status</Th>
              </Tr>
            </thead>
            <tbody>
              {data.finishedLots.map((l) => (
                <Tr key={l.id}>
                  <Td className="font-mono">{l.lot_number}</Td>
                  <Td align="right" className="font-mono">
                    {fmtNum(Number(l.quantity_received))}
                  </Td>
                  <Td align="right" className="font-mono">
                    {fmtNum(Number(l.quantity_remaining))}
                  </Td>
                  <Td className="text-white/60">{l.unit}</Td>
                  <Td align="right" className="font-mono">
                    {fmtCost(Number(l.unit_cost), 4)}
                  </Td>
                  <Td className="text-white/60">{fmtDate(l.received_date)}</Td>
                  <Td className="text-white/60">{fmtDate(l.expiry_date)}</Td>
                  <Td className="text-white/60">{l.status}</Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>

      {/* ── Section 4: Production History ───────────────────────────── */}
      <Section
        title={`Production History (${data.productionHistory.length})`}
        subtitle="Runs that yielded this SKU."
      >
        {data.productionHistory.length === 0 ? (
          <Empty>No runs have produced this SKU yet.</Empty>
        ) : (
          <TableShell>
            <thead>
              <Tr header>
                <Th>Run #</Th>
                <Th>Status</Th>
                <Th>Completed</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">Allocated COGS</Th>
                <Th align="right">Unit COGS</Th>
              </Tr>
            </thead>
            <tbody>
              {data.productionHistory.map((r) => (
                <Tr key={r.production_run_id}>
                  <Td>
                    <Link
                      href={`/dashboard/production-runs/${r.production_run_id}`}
                      className="font-mono text-teal-300 hover:text-teal-200"
                    >
                      {r.run_number ?? '—'}
                    </Link>
                  </Td>
                  <Td className="text-white/60">{r.run_status ?? '—'}</Td>
                  <Td className="text-white/60">{fmtDate(r.completed_at)}</Td>
                  <Td align="right" className="font-mono">
                    {fmtNum(r.quantity)}
                  </Td>
                  <Td align="right" className="font-mono">
                    {fmtCost(r.allocated_cogs_total)}
                  </Td>
                  <Td align="right" className="font-mono">
                    {fmtCost(r.unit_cogs, 4)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Section>
    </div>
  )
}

// ── primitives ────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-white/40">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  )
}
function Tr({
  header,
  children,
}: {
  header?: boolean
  children: React.ReactNode
}) {
  return (
    <tr
      className={
        header
          ? 'border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-white/40'
          : 'border-b border-white/5 last:border-0'
      }
    >
      {children}
    </tr>
  )
}
function Th({
  align,
  children,
}: {
  align?: 'right'
  children: React.ReactNode
}) {
  return (
    <th
      className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : ''}`}
    >
      {children}
    </th>
  )
}
function Td({
  align,
  className,
  children,
}: {
  align?: 'right'
  className?: string
  children: React.ReactNode
}) {
  return (
    <td
      className={`px-4 py-3 text-white/80 ${align === 'right' ? 'text-right' : ''} ${className ?? ''}`}
    >
      {children}
    </td>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-white/40">
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
