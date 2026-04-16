'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  FlaskConical,
  Boxes,
  BookOpen,
  Factory,
  ClipboardList,
  ShoppingBag,
  Sparkles,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronRight,
  GitBranch,
  Upload,
} from 'lucide-react'

const NAV = [
  { label: 'Dashboard',       href: '/dashboard',                  icon: LayoutDashboard },
  { label: 'Add Ingredients', href: '/dashboard/onboarding',       icon: Upload },
  { label: 'Ingredients',     href: '/dashboard/ingredients',      icon: FlaskConical },
  { label: 'Lots',            href: '/dashboard/lots',             icon: Boxes },
  { label: 'Recipes',         href: '/dashboard/recipes',          icon: BookOpen },
  { label: 'Production Runs', href: '/dashboard/production-runs',  icon: Factory },
  { label: 'Purchase Orders', href: '/dashboard/purchase-orders',  icon: ClipboardList },
  { label: 'Sales Orders',    href: '/dashboard/sales-orders',     icon: ShoppingBag },
  { label: 'Traceability',    href: '/dashboard/traceability',     icon: GitBranch },
  { label: 'AI Assistant',    href: '/dashboard/ai',               icon: Sparkles },
  { label: 'Settings',        href: '/dashboard/settings',         icon: Settings },
]

interface ShellProps {
  orgName: string
  userEmail: string
  children: React.ReactNode
}

export function DashboardShell({ orgName, userEmail, children }: ShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
        <Image
          src="/LotMonster_Favicon_32px.png"
          alt=""
          width={32}
          height={32}
          className="h-7 w-7"
        />
        <span className="text-lg font-bold tracking-tight text-white">
          Lotmonster
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-0.5 px-3">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = isActive(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                    ${active
                      ? 'border-l-2 border-teal-400 bg-teal-500/10 pl-[10px] text-teal-300'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <Icon
                    size={16}
                    className={active ? 'text-teal-400' : 'text-white/40'}
                  />
                  {label}
                  {active && (
                    <ChevronRight size={12} className="ml-auto text-teal-400/60" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User / logout */}
      <div className="border-t border-white/10 p-4">
        <div className="mb-2 truncate px-1 text-xs text-white/30">{userEmail}</div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/50 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#0D1B2A]">
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 border-r border-white/10 bg-[#0D1B2A] md:block">
        {sidebarContent}
      </aside>

      {/* ── Mobile sidebar backdrop ──────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile sidebar drawer ───────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 border-r border-white/10 bg-[#0D1B2A] transition-transform duration-200 md:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {sidebarContent}
      </aside>

      {/* ── Main area ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center border-b border-white/10 bg-[#0D1B2A] px-4 md:px-6">
          {/* Hamburger (mobile only) */}
          <button
            className="mr-3 rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle sidebar"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Org name — center on desktop */}
          <div className="flex flex-1 justify-center">
            <span className="text-sm font-semibold text-white/70">{orgName}</span>
          </div>

          {/* User email (desktop) */}
          <span className="hidden truncate text-xs text-white/30 md:block md:max-w-[180px]">
            {userEmail}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
