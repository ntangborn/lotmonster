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
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import type { IngredientDetail as IngredientDetailData } from '@/lib/ingredients/queries'
import { UNITS } from '@/lib/ingredients/schema'

type Tab = 'lots' | 'used_in' | 'purchases'

const STATUS_BADGE = {
  in_stock: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  low_stock: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  out_of_stock: 'bg-red-500/10 text-red-300 border-red-500/30',
}
const STATUS_LABEL = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}
function fmtCost(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

export function IngredientDetail({ initial }: { initial: IngredientDetailData }) {
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [tab, setTab] = useState<Tab>('lots')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')

  const ing = data.ingredient

  const [name, setName] = useState(ing.name)
  const [sku, setSku] = useState(ing.sku ?? '')
  const [unit, setUnit] = useState(ing.unit)
  const [category, setCategory] = useState(ing.category ?? '')
  const [lowStock, setLowStock] = useState(
    ing.low_stock_threshold != null ? String(ing.low_stock_threshold) : ''
  )
  const [costPerUnit, setCostPerUnit] = useState(
    ing.cost_per_unit != null ? String(ing.cost_per_unit) : ''
  )
  const [supplier, setSupplier] = useState(ing.default_supplier ?? '')
  const [storage, setStorage] = useState(ing.storage_notes ?? '')
  const [notes, setNotes] = useState(ing.notes ?? '')

  function resetEdits() {
    setName(ing.name)
    setSku(ing.sku ?? '')
    setUnit(ing.unit)
    setCategory(ing.category ?? '')
    setLowStock(ing.low_stock_threshold != null ? String(ing.low_stock_threshold) : '')
    setCostPerUnit(ing.cost_per_unit != null ? String(ing.cost_per_unit) : '')
    setSupplier(ing.default_supplier ?? '')
    setStorage(ing.storage_notes ?? '')
    setNotes(ing.notes ?? '')
  }

  function toNumberOrNull(v: string): number | null {
    const s = v.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setErr('')
    const body = {
      name: name.trim(),
      sku: sku.trim() || null,
      unit,
      category: category.trim() || null,
      low_stock_threshold: toNumberOrNull(lowStock),
      cost_per_unit: toNumberOrNull(costPerUnit),
      default_supplier: supplier.trim() || null,
      storage_notes: storage.trim() || null,
      notes: notes.trim() || null,
    }
    const res = await fetch(`/api/ingredients/${ing.id}`, {
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
    const { ingredient } = await res.json()
    setData({ ...data, ingredient: { ...data.ingredient, ...ingredient } })
    setEditing(false)
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${ing.name}"? This cannot be undone and will fail if the ingredient is referenced by lots, recipes, or purchase orders.`
      )
    ) {
      return
    }
    setDeleting(true)
    setErr('')
    const res = await fetch(`/api/ingredients/${ing.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setDeleting(false)
      if (e.error === 'has_references' && e.blockers) {
        const b = e.blockers
        setErr(
          `Cannot delete: referenced by ${b.lots} lot(s), ${b.recipes} recipe line(s), ${b.purchaseOrders} PO line(s).`
        )
      } else {
        setErr(e.error ?? 'Delete failed')
      }
      return
    }
    router.replace('/dashboard/ingredients')
  }

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/dashboard/ingredients"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
      >
        <ChevronLeft size={14} />
        Back to Ingredients
      </Link>

      {ing.status === 'low_stock' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          <AlertTriangle size={16} />
          Low stock: {fmtNum(ing.current_stock)} {ing.unit} remaining (threshold:{' '}
          {fmtNum(ing.low_stock_threshold)})
        </div>
      )}
      {ing.status === 'out_of_stock' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} />
          Out of stock
        </div>
      )}

      {err && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
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
                <Field label="SKU">
                  <input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Unit">
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
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
                    className={inputCls}
                  />
                </Field>
                <Field label="Low stock threshold">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={lowStock}
                    onChange={(e) => setLowStock(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Cost per unit ($)">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={costPerUnit}
                    onChange={(e) => setCostPerUnit(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Default supplier">
                  <input
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Storage notes">
                  <input
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Notes">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={inputCls}
                    rows={2}
                  />
                </Field>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold text-white">{ing.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
                  {ing.sku && <span>SKU: {ing.sku}</span>}
                  <span>Unit: {ing.unit}</span>
                  {ing.category && <span>Category: {ing.category}</span>}
                  {ing.default_supplier && (
                    <span>Supplier: {ing.default_supplier}</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[ing.status]}`}
                  >
                    {STATUS_LABEL[ing.status]}
                  </span>
                  <span className="text-white/60">
                    Stock:{' '}
                    <span className="font-mono text-white">
                      {fmtNum(ing.current_stock)} {ing.unit}
                    </span>
                  </span>
                  <span className="text-white/60">
                    Avg cost:{' '}
                    <span className="font-mono text-white">
                      {fmtCost(ing.avg_cost)}
                    </span>
                  </span>
                </div>
                {ing.storage_notes && (
                  <p className="mt-3 text-sm text-white/50">
                    Storage: {ing.storage_notes}
                  </p>
                )}
                {ing.notes && (
                  <p className="mt-1 text-sm text-white/50">{ing.notes}</p>
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
      </div>

      <div className="mb-4 flex gap-1 border-b border-white/10">
        <TabButton active={tab === 'lots'} onClick={() => setTab('lots')}>
          Lots ({data.lots.length})
        </TabButton>
        <TabButton active={tab === 'used_in'} onClick={() => setTab('used_in')}>
          Used In ({data.usedIn.length})
        </TabButton>
        <TabButton
          active={tab === 'purchases'}
          onClick={() => setTab('purchases')}
        >
          Purchase History ({data.purchaseHistory.length})
        </TabButton>
      </div>

      {tab === 'lots' && <LotsTab lots={data.lots} />}
      {tab === 'used_in' && <UsedInTab items={data.usedIn} />}
      {tab === 'purchases' && (
        <PurchasesTab items={data.purchaseHistory} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-teal-400 text-teal-300'
          : 'border-transparent text-white/50 hover:text-white/80'
      }`}
    >
      {children}
    </button>
  )
}

function LotsTab({ lots }: { lots: IngredientDetailData['lots'] }) {
  if (lots.length === 0) {
    return (
      <Empty>
        No lots yet. Lots are created when you receive purchase orders.
      </Empty>
    )
  }
  return (
    <TableShell>
      <thead>
        <Tr header>
          <Th>Lot #</Th>
          <Th>Supplier Lot</Th>
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
        {lots.map((l) => (
          <Tr key={l.id}>
            <Td className="font-mono">{l.lot_number}</Td>
            <Td className="text-white/60">{l.supplier_lot_number ?? '—'}</Td>
            <Td align="right" className="font-mono">
              {fmtNum(Number(l.quantity_received))}
            </Td>
            <Td align="right" className="font-mono">
              {fmtNum(Number(l.quantity_remaining))}
            </Td>
            <Td className="text-white/60">{l.unit}</Td>
            <Td align="right" className="font-mono">
              {fmtCost(Number(l.unit_cost))}
            </Td>
            <Td className="text-white/60">{fmtDate(l.received_date)}</Td>
            <Td className="text-white/60">{fmtDate(l.expiry_date)}</Td>
            <Td className="text-white/60">{l.status}</Td>
          </Tr>
        ))}
      </tbody>
    </TableShell>
  )
}

function UsedInTab({ items }: { items: IngredientDetailData['usedIn'] }) {
  if (items.length === 0) {
    return <Empty>Not used in any recipes yet.</Empty>
  }
  return (
    <TableShell>
      <thead>
        <Tr header>
          <Th>Recipe</Th>
          <Th align="right">Quantity</Th>
          <Th>Unit</Th>
        </Tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <Tr key={r.recipe_id}>
            <Td>
              <Link
                href={`/dashboard/recipes/${r.recipe_id}`}
                className="text-teal-300 hover:text-teal-200"
              >
                {r.recipe_name}
              </Link>
            </Td>
            <Td align="right" className="font-mono">
              {fmtNum(r.quantity)}
            </Td>
            <Td className="text-white/60">{r.unit}</Td>
          </Tr>
        ))}
      </tbody>
    </TableShell>
  )
}

function PurchasesTab({
  items,
}: {
  items: IngredientDetailData['purchaseHistory']
}) {
  if (items.length === 0) {
    return <Empty>No purchase orders yet.</Empty>
  }
  return (
    <TableShell>
      <thead>
        <Tr header>
          <Th>PO #</Th>
          <Th>Supplier</Th>
          <Th>Status</Th>
          <Th align="right">Ordered</Th>
          <Th align="right">Received</Th>
          <Th>Unit</Th>
          <Th align="right">Unit Cost</Th>
          <Th>Date</Th>
        </Tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <Tr key={`${p.po_id}-${p.created_at}`}>
            <Td>
              <Link
                href={`/dashboard/purchase-orders/${p.po_id}`}
                className="font-mono text-teal-300 hover:text-teal-200"
              >
                {p.po_number || '—'}
              </Link>
            </Td>
            <Td className="text-white/60">{p.supplier}</Td>
            <Td className="text-white/60">{p.status}</Td>
            <Td align="right" className="font-mono">
              {fmtNum(p.qty_ordered)}
            </Td>
            <Td align="right" className="font-mono">
              {fmtNum(p.qty_received)}
            </Td>
            <Td className="text-white/60">{p.unit}</Td>
            <Td align="right" className="font-mono">
              {fmtCost(p.unit_cost)}
            </Td>
            <Td className="text-white/60">{fmtDate(p.created_at)}</Td>
          </Tr>
        ))}
      </tbody>
    </TableShell>
  )
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center text-sm text-white/40">
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
