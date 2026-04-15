'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type State = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'error'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    const reason = params.get('reason')
    if (err) {
      setErrorMsg(reason ? `${err}: ${reason}` : err)
      setState('error')
    }
  }, [])

  const supabase = createClient()

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setState('sending')
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })

    if (error) {
      setErrorMsg(error.message)
      setState('error')
    } else {
      setState('awaiting_code')
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    const token = code.trim()
    if (token.length < 6 || token.length > 10) return
    setState('verifying')
    setErrorMsg('')

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    })

    if (error) {
      setErrorMsg(error.message)
      setState('error')
      return
    }

    const createdAt = data.user?.created_at
      ? new Date(data.user.created_at).getTime()
      : 0
    const isNewUser = Date.now() - createdAt < 60_000
    router.replace(isNewUser ? '/dashboard/onboarding' : '/dashboard')
  }

  async function handleGoogle() {
    setState('sending')
    setErrorMsg('')

    const callbackUrl = `${window.location.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    })

    if (error) {
      setErrorMsg(error.message)
      setState('error')
    }
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
            Inventory for CPG makers
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
              We sent a code to <span className="text-white">{email}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6,10}"
              maxLength={10}
              required
              placeholder="12345678"
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
              {state === 'verifying' ? 'Verifying…' : 'Sign in'}
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
              Use a different email
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleSendCode} className="space-y-3">
              <input
                type="email"
                required
                placeholder="you@yourcompany.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isBusy}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isBusy}
                className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
              >
                {state === 'sending' ? 'Sending…' : 'Email me a code'}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <button
              onClick={handleGoogle}
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </button>

            <p className="mt-6 text-center text-xs text-white/30">
              No account?{' '}
              <a
                href="/signup"
                className="text-teal-400 underline underline-offset-2 hover:text-teal-300"
              >
                Create one free
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
