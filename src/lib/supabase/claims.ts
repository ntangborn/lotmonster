/**
 * Server Component equivalent of getClaims() from proxy.ts.
 *
 * proxy.ts reads from NextRequest.cookies (Edge runtime, middleware only).
 * This reads from next/headers cookies() — safe to call in Server Components,
 * Route Handlers, and Server Actions.
 *
 * Uses the same zero-network JWT decode approach (jose decodeJwt) so it
 * doesn't add a round-trip to Supabase Auth on every render.
 *
 * For write operations or anywhere security is critical, prefer
 * supabase.auth.getUser() which validates the JWT server-side.
 */

import { cookies } from 'next/headers'
import { decodeJwt } from 'jose'
import type { SessionClaims } from './proxy'

export async function getServerClaims(): Promise<SessionClaims | null> {
  try {
    const cookieStore = await cookies()
    const all = cookieStore.getAll()

    const sessionCookie = all.find(
      (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
    )

    if (!sessionCookie?.value) return null

    let accessToken: string
    try {
      const parsed = JSON.parse(sessionCookie.value)
      accessToken = Array.isArray(parsed) ? parsed[0] : parsed.access_token
    } catch {
      accessToken = sessionCookie.value
    }

    if (!accessToken) return null

    const payload = decodeJwt(accessToken)

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) return null

    return {
      sub: payload.sub ?? '',
      email: (payload.email as string) ?? '',
      role: (payload.role as string) ?? 'authenticated',
      org_id: (payload.org_id as string) ?? '',
    }
  } catch {
    return null
  }
}
