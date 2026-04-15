'use client'

/**
 * Client-side auth callback page.
 *
 * Uses Supabase's implicit flow: the magic link redirects here with tokens
 * in the URL hash (#access_token=...&refresh_token=...). createBrowserClient
 * auto-detects the hash on init and writes session cookies; we just wait for
 * the session to be established, then route the user.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Signing you in…')

  useEffect(() => {
    const supabase = createClient()

    // Surface token errors returned in the hash (e.g. expired magic link)
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const hashError = params.get('error_description') || params.get('error')
    if (hashError) {
      const reason = encodeURIComponent(hashError.slice(0, 200))
      router.replace(`/login?error=auth_callback_failed&reason=${reason}`)
      return
    }

    let done = false

    const route = (createdAtIso: string | undefined) => {
      if (done) return
      done = true
      const createdAt = createdAtIso ? new Date(createdAtIso).getTime() : 0
      const isNewUser = Date.now() - createdAt < 60_000
      router.replace(isNewUser ? '/dashboard/onboarding' : '/dashboard')
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        route(session.user.created_at)
      }
    })

    // Fallback: if the hash was already consumed on mount, getSession returns
    // the session without firing SIGNED_IN again.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) route(session.user.created_at)
    })

    // Safety timeout — if nothing happened in 8s, the hash was invalid/missing
    const timeout = setTimeout(() => {
      if (!done) {
        setMessage('Auth failed.')
        router.replace('/login?error=auth_callback_failed&reason=no_session')
      }
    }, 8000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D1B2A]">
      <p className="text-sm text-white/40">{message}</p>
    </div>
  )
}
