'use client'

/**
 * Client-side auth callback page.
 * Performs PKCE exchange and surfaces cookie state on failure for diagnosis.
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
      router.replace('/login?error=auth_callback_failed&reason=no_code')
      return
    }

    const supabase = createClient()

    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error) {
        // Snapshot Supabase cookie names so we can see if verifier existed
        const cookieNames = document.cookie
          .split(';')
          .map((c) => c.trim().split('=')[0])
          .filter((n) => n.startsWith('sb-'))
          .join(',')
        const debug = `${error.message} cookies=[${cookieNames}]`
        const reason = encodeURIComponent(debug.slice(0, 400))
        router.replace(`/login?error=auth_callback_failed&reason=${reason}`)
        return
      }

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
