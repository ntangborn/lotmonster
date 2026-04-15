import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

interface LowStockItem {
  id: string
  name: string
  sku: string | null
  unit: string
  current_stock: number
  low_stock_threshold: number
  status: 'out' | 'low'
}

/**
 * Server component. Renders a banner listing ingredients that are at or
 * below their `low_stock_threshold` (or fully out of stock if threshold
 * is set). Pass `orgId` from the calling page's resolveOrgId().
 *
 * Only shows ingredients that have a `low_stock_threshold` set — without
 * one, "low" is undefined.
 */
export async function LowStockAlerts({
  orgId,
  limit = 10,
}: {
  orgId: string
  limit?: number
}) {
  const admin = createAdminClient()

  const { data: ingredients } = await admin
    .from('ingredients')
    .select('id, name, sku, unit, low_stock_threshold')
    .eq('org_id', orgId)
    .not('low_stock_threshold', 'is', null)

  if (!ingredients || ingredients.length === 0) return null

  const ids = ingredients.map((i) => i.id)
  const { data: lots } = await admin
    .from('lots')
    .select('ingredient_id, quantity_remaining')
    .eq('org_id', orgId)
    .eq('status', 'available')
    .in('ingredient_id', ids)

  const stock = new Map<string, number>()
  for (const l of lots ?? []) {
    stock.set(
      l.ingredient_id,
      (stock.get(l.ingredient_id) ?? 0) +
        (Number(l.quantity_remaining) || 0)
    )
  }

  const items: LowStockItem[] = []
  for (const ing of ingredients) {
    const threshold = Number(ing.low_stock_threshold) || 0
    const current = stock.get(ing.id) ?? 0
    if (current <= 0) {
      items.push({
        id: ing.id,
        name: ing.name,
        sku: ing.sku,
        unit: ing.unit,
        current_stock: current,
        low_stock_threshold: threshold,
        status: 'out',
      })
    } else if (current < threshold) {
      items.push({
        id: ing.id,
        name: ing.name,
        sku: ing.sku,
        unit: ing.unit,
        current_stock: current,
        low_stock_threshold: threshold,
        status: 'low',
      })
    }
  }

  if (items.length === 0) return null

  items.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'out' ? -1 : 1
    const aRatio =
      a.low_stock_threshold > 0 ? a.current_stock / a.low_stock_threshold : 0
    const bRatio =
      b.low_stock_threshold > 0 ? b.current_stock / b.low_stock_threshold : 0
    return aRatio - bRatio
  })

  const shown = items.slice(0, limit)
  const extra = items.length - shown.length
  const outCount = items.filter((i) => i.status === 'out').length

  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={16} className="text-yellow-400" />
        <h3 className="text-sm font-semibold text-yellow-300">
          Low stock alerts
        </h3>
        <span className="ml-auto text-xs text-white/40">
          {items.length} {items.length === 1 ? 'item' : 'items'}
          {outCount > 0 && ` · ${outCount} out of stock`}
        </span>
      </div>

      <ul className="space-y-1.5">
        {shown.map((item) => (
          <li key={item.id}>
            <Link
              href={`/dashboard/ingredients/${item.id}`}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/5"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    item.status === 'out' ? 'bg-red-400' : 'bg-yellow-400'
                  }`}
                />
                <span className="text-white/90">{item.name}</span>
                {item.sku && (
                  <span className="text-xs text-white/40">({item.sku})</span>
                )}
              </span>
              <span className="font-mono text-xs text-white/60">
                {item.current_stock.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                {' / '}
                {item.low_stock_threshold.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{' '}
                {item.unit}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {extra > 0 && (
        <Link
          href="/dashboard/ingredients"
          className="mt-3 block text-center text-xs text-teal-300 hover:text-teal-200"
        >
          + {extra} more — view all
        </Link>
      )}
    </div>
  )
}
