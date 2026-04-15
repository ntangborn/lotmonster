'use client'

/**
 * Client-side auth callback page.
 *
 * Supabase's PKCE flow stores the code_verifier in the browser (cookie/
 * localStorage) when signInWithOtp / signInWithOAuth is called. The exchange
 * must happen in the same browser context — a server-side route handler can't
 * reliably read the verifier. This page completes the exchange client-side
 * using the same createBrowserClient that initiated the flow.
 */

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')

    if (!code) {
      router.replace('/login?error=auth_callback_failed')
      return
    }

    const supabase = createClient()

    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error) {
        console.error('[auth/callback] exchangeCodeForSession:', error.message)
        const reason = encodeURIComponent(error.message.slice(0, 200))
        router.replace(`/login?error=auth_callback_failed&reason=${reason}`)
        return
      }

      // Route new users to onboarding, returning users to dashboard.
      // "New" = account created within the last 60 seconds.
      const createdAt = data.user?.created_at
        ? new Date(data.user.created_at).getTime()
        : 0
      const isNewUser = Date.now() - createdAt < 60_000

      router.replace(isNewUser ? '/dashboard/onboarding' : '/dashboard')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D1B2A]">
      <p className="text-sm text-white/40">Signing you in…</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0D1B2A]">
          <p className="text-sm text-white/40">Loading…</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  )
}
