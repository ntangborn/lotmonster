export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, ChevronRight } from 'lucide-react'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { listRecipes } from '@/lib/recipes/queries'

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}

function fmtNum(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export default async function RecipesPage() {
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    redirect('/login')
  }

  const rows = await listRecipes(orgId)

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Recipes</h1>
          <p className="mt-1 text-sm text-white/50">
            {rows.length} {rows.length === 1 ? 'recipe' : 'recipes'}
          </p>
        </div>
        <Link
          href="/dashboard/recipes/new"
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
        >
          <Plus size={16} />
          Create Recipe
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.02]">
            <tr className="text-xs uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 text-right font-medium">Target Yield</th>
              <th className="px-4 py-3 font-medium">Yield Unit</th>
              <th className="px-4 py-3 text-right font-medium"># Ingredients</th>
              <th className="px-4 py-3 text-right font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-white/40">
                  No recipes yet. Click &quot;Create Recipe&quot; to get started.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="group border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.04]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/recipes/${r.id}`}
                      className="font-medium text-white hover:text-teal-300"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/80">
                    {fmtNum(Number(r.target_yield))}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {r.target_yield_unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/80">
                    {r.line_count}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/60">
                    v{r.version}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {fmtDate(r.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/recipes/${r.id}`}
                      className="text-white/30 group-hover:text-teal-300"
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
