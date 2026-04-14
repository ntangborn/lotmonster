'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type State = 'idle' | 'loading' | 'error'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [orgName, setOrgName] = useState('')
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !orgName.trim()) return
    setState('loading')
    setErrorMsg('')

    const callbackUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/api/auth/callback`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`

    // 1. Create the auth user via magic link (OTP).
    //    On first sign-in the user record is created; org wiring
    //    happens via a Supabase trigger or the callback route.
    //    We pass orgName in email metadata so the callback/trigger
    //    can create the org record.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl,
        data: {
          org_name: orgName.trim(),
          org_slug: slugify(orgName.trim()),
        },
      },
    })

    if (otpError) {
      setErrorMsg(otpError.message)
      setState('error')
      return
    }

    // 2. After OTP is sent, redirect to a confirmation screen.
    //    Org + org_member rows are created server-side in the
    //    callback route once the user confirms their email.
    router.push(`/signup/confirm?email=${encodeURIComponent(email.trim())}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0D1B2A] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-8 shadow-xl">
        {/* Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Lotmonster
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Create your free account
          </p>
        </div>

        {/* Error banner */}
        {state === 'error' && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
            <p className="text-sm text-red-400">{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-3">
          <div>
            <label
              htmlFor="org"
              className="mb-1 block text-xs font-medium text-white/50"
            >
              Company / Brand name
            </label>
            <input
              id="org"
              type="text"
              required
              placeholder="Lone Star Heat"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={state === 'loading'}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs font-medium text-white/50"
            >
              Work email
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="you@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={state === 'loading'}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={state === 'loading'}
            className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
          >
            {state === 'loading' ? 'Creating account…' : 'Create free account'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/30">
          14-day free trial · No credit card required
        </p>

        <p className="mt-4 text-center text-xs text-white/30">
          Already have an account?{' '}
          <a
            href="/login"
            className="text-teal-400 underline underline-offset-2 hover:text-teal-300"
          >
            Sign in
          </a>
        </p>
      </div>
    </main>
  )
}
