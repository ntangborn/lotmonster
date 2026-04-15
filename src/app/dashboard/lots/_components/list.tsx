'use client'

import { useMemo, useState } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import type { LotWithIngredient } from '@/lib/lots/queries'
import type { DisplayStatus } from '@/lib/lots/schema'
import { CreateLotModal, type IngredientOption } from './create-modal'

const STATUS_LABEL: Record<DisplayStatus, string> = {
  active: 'Active',
  expiring_soon: 'Expiring ≤30d',
  expiring_week: 'Expiring ≤7d',
  expired: 'Expired',
  depleted: 'Depleted',
  quarantined: 'Quarantined',
}

const STATUS_BADGE: Record<DisplayStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  expiring_soon: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  expiring_week: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  expired: 'bg-red-500/10 text-red-300 border-red-500/30',
  depleted: 'bg-white/10 text-white/50 border-white/20',
  quarantined: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
}

const ROW_TINT: Partial<Record<DisplayStatus, string>> = {
  expiring_week: 'bg-red-500/5',
  expiring_soon: 'bg-yellow-500/5',
  expired: 'bg-red-500/10',
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

type ExpiryFilter = 'all' | '7' | '30' | '90' | 'expired'

interface Props {
  initialLots: LotWithIngredient[]
  ingredients: IngredientOption[]
}

export function LotsList({ initialLots, ingredients }: Props) {
  const [lots, setLots] = useState(initialLots)
  const [ingredientId, setIngredientId] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [expiry, setExpiry] = useState<ExpiryFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)

  const filtered = useMemo(() => {
    const now = Date.now()
    return lots.filter((l) => {
      if (ingredientId && l.ingredient_id !== ingredientId) return false
      if (status) {
        if (status === 'active') {
          if (
            l.display_status !== 'active' &&
            l.display_status !== 'expiring_soon' &&
            l.display_status !== 'expiring_week'
          ) {
            return false
          }
        } else if (l.display_status !== status) {
          return false
        }
      }
      if (expiry !== 'all') {
        if (expiry === 'expired') {
          if (l.display_status !== 'expired') return false
        } else {
          if (!l.expiry_date) return false
          const days = Math.floor(
            (new Date(l.expiry_date).getTime() - now) / 86_400_000
          )
          const max = parseInt(expiry, 10)
          if (days < 0 || days > max) return false
        }
      }
      return true
    })
  }, [lots, ingredientId, status, expiry])

  const expiringSoonCount = useMemo(
    () =>
      lots.filter(
        (l) =>
          l.display_status === 'expiring_week' ||
          l.display_status === 'expired'
      ).length,
    [lots]
  )

  function handleCreated(newLot: LotWithIngredient) {
    setLots((prev) => [newLot, ...prev])
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Lots</h1>
          <p className="mt-1 text-sm text-white/50">
            {lots.length} {lots.length === 1 ? 'lot' : 'lots'}
            {expiringSoonCount > 0 && (
              <>
                {' · '}
                <span className="text-red-300">
                  {expiringSoonCount} expiring ≤7d or expired
                </span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
        >
          <Plus size={16} />
          Create Lot
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={ingredientId}
          onChange={(e) => setIngredientId(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0D1B2A] px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">All ingredients</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {i.sku ? ` (${i.sku})` : ''}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0D1B2A] px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active (any)</option>
          <option value="expiring_week">Expiring ≤7d</option>
          <option value="expiring_soon">Expiring ≤30d</option>
          <option value="expired">Expired</option>
          <option value="depleted">Depleted</option>
          <option value="quarantined">Quarantined</option>
        </select>

        <select
          value={expiry}
          onChange={(e) => setExpiry(e.target.value as ExpiryFilter)}
          className="rounded-lg border border-white/10 bg-[#0D1B2A] px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="all">Any expiry</option>
          <option value="expired">Expired</option>
          <option value="7">Expires within 7 days</option>
          <option value="30">Expires within 30 days</option>
          <option value="90">Expires within 90 days</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.02]">
            <tr className="text-xs uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 font-medium">Lot #</th>
              <th className="px-4 py-3 font-medium">Ingredient</th>
              <th className="px-4 py-3 text-right font-medium">Qty Remaining</th>
              <th className="px-4 py-3 font-medium">Unit</th>
              <th className="px-4 py-3 text-right font-medium">Unit Cost</th>
              <th className="px-4 py-3 font-medium">Received</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-white/40"
                >
                  {lots.length === 0
                    ? 'No lots yet. Click "Create Lot" to add inventory.'
                    : 'No lots match your filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((l) => (
                <tr
                  key={l.id}
                  className={`border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.04] ${ROW_TINT[l.display_status] ?? ''}`}
                >
                  <td className="px-4 py-3 font-mono text-white">
                    {l.lot_number}
                  </td>
                  <td className="px-4 py-3 text-white/80">
                    {l.ingredient_name}
                    {l.ingredient_sku && (
                      <span className="ml-1.5 text-xs text-white/40">
                        ({l.ingredient_sku})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/80">
                    {fmtNum(Number(l.quantity_remaining))}
                  </td>
                  <td className="px-4 py-3 text-white/60">{l.unit}</td>
                  <td className="px-4 py-3 text-right font-mono text-white/80">
                    {fmtCost(Number(l.unit_cost))}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {fmtDate(l.received_date)}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {l.expiry_date ? (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          l.display_status === 'expired'
                            ? 'text-red-300'
                            : l.display_status === 'expiring_week'
                              ? 'text-red-300'
                              : l.display_status === 'expiring_soon'
                                ? 'text-yellow-300'
                                : ''
                        }`}
                      >
                        {(l.display_status === 'expired' ||
                          l.display_status === 'expiring_week') && (
                          <AlertTriangle size={12} />
                        )}
                        {fmtDate(l.expiry_date)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[l.display_status]}`}
                    >
                      {STATUS_LABEL[l.display_status]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateLotModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        ingredients={ingredients}
        onCreated={handleCreated}
      />
    </>
  )
}
