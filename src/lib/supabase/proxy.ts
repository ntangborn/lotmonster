import { createServerClient } from '@supabase/ssr'
import { decodeJwt } from 'jose'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export interface SessionClaims {
  sub: string
  email: string
  role: string
  org_id: string
}

/**
 * Decodes the Supabase JWT from the request cookies without a network round-trip.
 * Used in the middleware layer where performance matters — avoids a getUser() call
 * on every request.
 *
 * Returns null if no session cookie is present or the token is malformed/expired.
 */
export function getClaims(request: NextRequest): SessionClaims | null {
  try {
    // Supabase stores the session under sb-<project-ref>-auth-token
    // We find it by prefix rather than hardcoding the project ref.
    const sessionCookie = request.cookies
      .getAll()
      .find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

    if (!sessionCookie?.value) return null

    // The cookie value is a JSON array: [access_token, refresh_token]
    let accessToken: string
    try {
      const parsed = JSON.parse(sessionCookie.value)
      accessToken = Array.isArray(parsed) ? parsed[0] : parsed.access_token
    } catch {
      // If it's not JSON, treat the raw value as the access token
      accessToken = sessionCookie.value
    }

    if (!accessToken) return null

    const payload = decodeJwt(accessToken)

    // Validate expiry
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

/**
 * Creates a Supabase server client suitable for use inside Next.js middleware
 * (proxy.ts). Reads/writes cookies via NextRequest + NextResponse rather than
 * next/headers, which is not available in the Edge runtime.
 */
export function createProxyClient(
  request: NextRequest,
  response: { headers: Headers }
) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.headers.append(
              'Set-Cookie',
              // Build a minimal Set-Cookie string; Supabase provides serialized options
              `${name}=${value}; Path=${options?.path ?? '/'}${
                options?.maxAge != null ? `; Max-Age=${options.maxAge}` : ''
              }${options?.httpOnly ? '; HttpOnly' : ''}${
                options?.secure ? '; Secure' : ''
              }${options?.sameSite ? `; SameSite=${options.sameSite}` : ''}`
            )
          })
        },
      },
    }
  )
}
