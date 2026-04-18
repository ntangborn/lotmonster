import Link from 'next/link'
import {
  Package2,
  Boxes,
  AlertTriangle,
  DollarSign,
  ChevronRight,
  ShoppingCart,
} from 'lucide-react'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'

interface ExpiringLot {
  id: string
  lot_number: string
  ingredient_id: string
  ingredient_name: string
  quantity_remaining: number
  unit: string
  expiry_date: string
  days_left: number
}

interface LowStockItem {
  id: string
  name: string
  sku: string | null
  unit: string
  current_stock: number
  low_stock_threshold: number
  out_of_stock: boolean
}

interface DashboardData {
  totalIngredientRows: number
  totalActiveIngredients: number
  activeLots: number
  expiringThisWeek: number
  monthCogs: number | null
  expiringSoon: ExpiringLot[]
  lowStock: LowStockItem[]
}

async function loadDashboard(orgId: string): Promise<DashboardData> {
  const admin = createAdminClient()
  const now = Date.now()
  const weekMs = 7 * 86_400_000
  const thirtyMs = 30 * 86_400_000

  const [activeLotsRes, ingredientsRes] = await Promise.all([
    admin
      .from('lots')
      .select(
        'id, ingredient_id, lot_number, quantity_remaining, unit, expiry_date, ingredients(name)'
      )
      .eq('org_id', orgId)
      .eq('status', 'available')
      .gt('quantity_remaining', 0),
    admin
      .from('ingredients')
      .select('id, name, sku, unit, low_stock_threshold')
      .eq('org_id', orgId),
  ])

  const lotsRaw = activeLotsRes.data ?? []
  const ingredients = ingredientsRes.data ?? []

  const stockByIngredient = new Map<string, number>()
  for (const lot of lotsRaw) {
    if (!lot.ingredient_id) continue
    stockByIngredient.set(
      lot.ingredient_id,
      (stockByIngredient.get(lot.ingredient_id) ?? 0) +
        (Number(lot.quantity_remaining) || 0)
    )
  }

  const expiringSoon: ExpiringLot[] = []
  let expiringThisWeekCount = 0
  for (const lot of lotsRaw) {
    if (!lot.ingredient_id) continue
    if (!lot.expiry_date) continue
    const exp = new Date(lot.expiry_date).getTime()
    const delta = exp - now
    if (delta < 0) continue
    if (delta > thirtyMs) continue
    const daysLeft = Math.max(0, Math.ceil(delta / 86_400_000))
    if (delta <= weekMs) expiringThisWeekCount++

    const ingName =
      (lot as unknown as { ingredients: { name: string } | null }).ingredients
        ?.name ?? 'Unknown'

    expiringSoon.push({
      id: lot.id,
      lot_number: lot.lot_number,
      ingredient_id: lot.ingredient_id,
      ingredient_name: ingName,
      quantity_remaining: Number(lot.quantity_remaining) || 0,
      unit: lot.unit,
      expiry_date: lot.expiry_date,
      days_left: daysLeft,
    })
  }
  expiringSoon.sort((a, b) => a.days_left - b.days_left)

  const lowStock: LowStockItem[] = []
  for (const ing of ingredients) {
    const threshold = ing.low_stock_threshold
    if (threshold == null) continue
    const thresholdNum = Number(threshold) || 0
    const current = stockByIngredient.get(ing.id) ?? 0
    if (current >= thresholdNum) continue
    lowStock.push({
      id: ing.id,
      name: ing.name,
      sku: ing.sku,
      unit: ing.unit,
      current_stock: current,
      low_stock_threshold: thresholdNum,
      out_of_stock: current <= 0,
    })
  }
  lowStock.sort((a, b) => {
    if (a.out_of_stock !== b.out_of_stock) return a.out_of_stock ? -1 : 1
    const aR =
      a.low_stock_threshold > 0 ? a.current_stock / a.low_stock_threshold : 0
    const bR =
      b.low_stock_threshold > 0 ? b.current_stock / b.low_stock_threshold : 0
    return aR - bR
  })

  const totalActiveIngredients = new Set(
    lotsRaw
      .map((l) => l.ingredient_id)
      .filter((id): id is string => id !== null)
  ).size

  return {
    totalIngredientRows: ingredients.length,
    totalActiveIngredients,
    activeLots: lotsRaw.length,
    expiringThisWeek: expiringThisWeekCount,
    monthCogs: null, // wired once production_runs has data
    expiringSoon,
    lowStock,
  }
}

export default async function DashboardPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }

  const data = await loadDashboard(orgId)
  if (data.totalIngredientRows === 0) {
    redirect('/dashboard/onboarding')
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-white">Dashboard</h1>

      <StatsRow data={data} />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <ExpiringSoonCard lots={data.expiringSoon} />
        <LowStockCard items={data.lowStock} />
      </div>
    </div>
  )
}

function StatsRow({ data }: { data: DashboardData }) {
  const cards = [
    {
      label: 'Active Ingredients',
      value: data.totalActiveIngredients.toString(),
      sub: 'with stock on hand',
      icon: Package2,
      color: 'text-teal-400',
      bg: 'bg-teal-500/10',
    },
    {
      label: 'Active Lots',
      value: data.activeLots.toString(),
      sub: 'available for use',
      icon: Boxes,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Expiring This Week',
      value: data.expiringThisWeek.toString(),
      sub: data.expiringThisWeek === 0 ? 'all clear' : 'need attention',
      icon: AlertTriangle,
      color:
        data.expiringThisWeek > 0 ? 'text-red-400' : 'text-white/40',
      bg: data.expiringThisWeek > 0 ? 'bg-red-500/10' : 'bg-white/5',
    },
    {
      label: "Month's COGS",
      value:
        data.monthCogs != null
          ? `$${data.monthCogs.toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}`
          : '—',
      sub:
        data.monthCogs != null
          ? 'cost of goods sold'
          : 'no production runs yet',
      icon: DollarSign,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ label, value, sub, icon: Icon, color, bg }) => (
        <div
          key={label}
          className="rounded-xl border border-white/10 bg-white/5 p-5"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-sm text-white/50">{label}</p>
              <p className="mt-1 text-3xl font-bold text-white">{value}</p>
              <p className="mt-1 text-xs text-white/30">{sub}</p>
            </div>
            <div className={`rounded-lg p-2 ${bg}`}>
              <Icon size={20} className={color} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ExpiringSoonCard({ lots }: { lots: ExpiringLot[] }) {
  const shown = lots.slice(0, 8)
  const extra = lots.length - shown.length

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/80">Expiring Soon</h2>
        <Link
          href="/dashboard/lots"
          className="flex items-center gap-1 text-xs text-teal-300 hover:text-teal-200"
        >
          View All Lots
          <ChevronRight size={12} />
        </Link>
      </div>

      {lots.length === 0 ? (
        <p className="py-6 text-center text-xs text-white/30">
          Nothing expiring in the next 30 days.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((lot) => {
            const urgent = lot.days_left <= 7
            return (
              <li key={lot.id}>
                <Link
                  href="/dashboard/lots"
                  className={`flex items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-white/5 ${
                    urgent ? 'bg-red-500/5' : 'bg-yellow-500/5'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        urgent ? 'bg-red-400' : 'bg-yellow-400'
                      }`}
                    />
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-xs text-white/70">
                        {lot.lot_number}
                      </span>
                      <span className="mx-2 text-white/30">·</span>
                      <span className="text-white/90">
                        {lot.ingredient_name}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-xs text-white/60">
                      {lot.quantity_remaining.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{' '}
                      {lot.unit}
                    </span>
                    <span
                      className={`w-20 text-right font-medium ${
                        urgent ? 'text-red-300' : 'text-yellow-300'
                      }`}
                    >
                      {lot.days_left === 0
                        ? 'today'
                        : `${lot.days_left}d left`}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {extra > 0 && (
        <Link
          href="/dashboard/lots"
          className="mt-3 block text-center text-xs text-teal-300 hover:text-teal-200"
        >
          + {extra} more
        </Link>
      )}
    </div>
  )
}

function LowStockCard({ items }: { items: LowStockItem[] }) {
  const shown = items.slice(0, 8)
  const extra = items.length - shown.length

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/80">Low Stock</h2>
        <Link
          href="/dashboard/ingredients"
          className="flex items-center gap-1 text-xs text-teal-300 hover:text-teal-200"
        >
          View All Ingredients
          <ChevronRight size={12} />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-white/30">
          All ingredients are above their low-stock thresholds.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((item) => (
            <li
              key={item.id}
              className={`flex items-center justify-between rounded-lg px-2 py-2 text-sm ${
                item.out_of_stock ? 'bg-red-500/5' : 'bg-yellow-500/5'
              }`}
            >
              <Link
                href={`/dashboard/ingredients/${item.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 hover:text-white"
              >
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    item.out_of_stock ? 'bg-red-400' : 'bg-yellow-400'
                  }`}
                />
                <span className="min-w-0 truncate">
                  <span className="text-white/90">{item.name}</span>
                  {item.sku && (
                    <span className="ml-1.5 text-xs text-white/40">
                      ({item.sku})
                    </span>
                  )}
                </span>
              </Link>
              <span className="ml-3 flex shrink-0 items-center gap-3">
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
                <Link
                  href={`/dashboard/purchase-orders/new?ingredient=${item.id}`}
                  className="flex items-center gap-1 rounded-md bg-teal-500/15 px-2 py-1 text-xs font-medium text-teal-300 transition-colors hover:bg-teal-500/25"
                >
                  <ShoppingCart size={11} />
                  Reorder
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}

      {extra > 0 && (
        <Link
          href="/dashboard/ingredients"
          className="mt-3 block text-center text-xs text-teal-300 hover:text-teal-200"
        >
          + {extra} more
        </Link>
      )}
    </div>
  )
}
