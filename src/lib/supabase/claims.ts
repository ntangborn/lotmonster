/**
 * Server Component equivalent of getClaims() from proxy.ts.
 *
 * Reads the Supabase session via the SSR server client (next/headers cookies),
 * which correctly handles base64url encoding and chunked auth cookies.
 * Safe to call in Server Components, Route Handlers, and Server Actions.
 */

import { createClient } from './server'
import type { SessionClaims } from './proxy'

export async function getServerClaims(): Promise<SessionClaims | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  const meta = data.user.app_metadata as Record<string, unknown> | undefined
  return {
    sub: data.user.id,
    email: data.user.email ?? '',
    role: (meta?.role as string) ?? 'authenticated',
    org_id: (meta?.org_id as string) ?? '',
  }
}
