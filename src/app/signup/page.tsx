'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type State = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'error'

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
  const [code, setCode] = useState('')
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const supabase = createClient()

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !orgName.trim()) return
    setState('sending')
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        data: {
          org_name: orgName.trim(),
          org_slug: slugify(orgName.trim()),
        },
      },
    })

    if (error) {
      setErrorMsg(error.message)
      setState('error')
      return
    }
    setState('awaiting_code')
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    const token = code.trim()
    if (token.length < 6) return
    setState('verifying')
    setErrorMsg('')

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    })

    if (error) {
      setErrorMsg(error.message)
      setState('error')
      return
    }

    router.replace('/dashboard/onboarding')
  }

  const isBusy = state === 'sending' || state === 'verifying'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0D1B2A] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Lotmonster
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Create your free account
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
            <p className="text-sm text-red-400">{errorMsg}</p>
          </div>
        )}

        {state === 'awaiting_code' || state === 'verifying' ? (
          <form onSubmit={handleVerifyCode} className="space-y-3">
            <p className="text-sm text-white/70">
              We sent a 6-digit code to <span className="text-white">{email}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={isBusy}
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-center text-lg font-mono tracking-widest text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isBusy || code.length < 6}
              className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
            >
              {state === 'verifying' ? 'Verifying…' : 'Create account'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCode('')
                setErrorMsg('')
                setState('idle')
              }}
              className="w-full text-xs text-white/40 underline underline-offset-2 hover:text-white/70"
            >
              Start over
            </button>
          </form>
        ) : (
          <form onSubmit={handleSendCode} className="space-y-3">
            <div>
              <label htmlFor="org" className="mb-1 block text-xs font-medium text-white/50">
                Company / Brand name
              </label>
              <input
                id="org"
                type="text"
                required
                placeholder="Lone Star Heat"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={isBusy}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-white/50">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="you@yourcompany.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isBusy}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
            >
              {state === 'sending' ? 'Sending code…' : 'Create free account'}
            </button>

            <p className="mt-2 text-center text-xs text-white/30">
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
          </form>
        )}
      </div>
    </main>
  )
}
