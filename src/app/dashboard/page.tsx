import { createClient } from '@/lib/supabase/server'
import { getServerClaims } from '@/lib/supabase/claims'
import { Package2, Boxes, DollarSign } from 'lucide-react'

async function getStats(orgId: string) {
  const supabase = await createClient()

  const [ingredientsRes, lotsRes] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('lots')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'available'),
  ])

  return {
    totalIngredients: ingredientsRes.count ?? 0,
    activeLots: lotsRes.count ?? 0,
    // Real COGS will come from production_runs once data exists
    monthCogs: null as number | null,
  }
}

export default async function DashboardPage() {
  const claims = await getServerClaims()
  // claims is guaranteed non-null by layout auth guard
  const stats = await getStats(claims!.org_id)

  const cards = [
    {
      label: 'Total Ingredients',
      value: stats.totalIngredients.toString(),
      sub: 'in your registry',
      icon: Package2,
      color: 'text-teal-400',
      bg: 'bg-teal-500/10',
    },
    {
      label: 'Active Lots',
      value: stats.activeLots.toString(),
      sub: 'available for use',
      icon: Boxes,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: "This Month's COGS",
      value: stats.monthCogs != null
        ? `$${stats.monthCogs.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        : '—',
      sub: stats.monthCogs != null ? 'cost of goods sold' : 'no production runs yet',
      icon: DollarSign,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ]

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-white">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="rounded-xl border border-white/10 bg-white/5 p-5"
          >
            <div className="flex items-start justify-between">
              <div>
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

      {/* Placeholder sections */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-white/70">Expiring Lots</h2>
          <p className="text-xs text-white/30">
            Lots expiring in the next 30 days will appear here.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-white/70">Recent Activity</h2>
          <p className="text-xs text-white/30">
            Production runs, receipts, and shipments will appear here.
          </p>
        </div>
      </div>
    </div>
  )
}
