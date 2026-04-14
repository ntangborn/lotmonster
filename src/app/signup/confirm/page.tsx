'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ConfirmContent() {
  const params = useSearchParams()
  const email = params.get('email') ?? 'your email'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0D1B2A] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-8 shadow-xl text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h2 className="text-xl font-semibold text-white">Check your inbox</h2>
        <p className="mt-2 text-sm text-white/50">
          We sent a login link to
        </p>
        <p className="mt-1 text-sm font-medium text-teal-300">{email}</p>
        <p className="mt-4 text-xs text-white/30">
          Click the link in the email to finish creating your account.
          The link expires in 1 hour.
        </p>
        <a
          href="/signup"
          className="mt-6 inline-block text-xs text-white/30 underline underline-offset-2 hover:text-white/60"
        >
          Use a different email
        </a>
      </div>
    </main>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmContent />
    </Suspense>
  )
}
