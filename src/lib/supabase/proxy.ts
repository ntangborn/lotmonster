import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export interface SessionClaims {
  sub: string
  email: string
  role: string
  org_id: string
}

/**
 * Reads the Supabase session from request cookies using the SSR client so
 * it correctly handles base64url encoding and chunked cookies. Returns null
 * if no valid session is present.
 *
 * Uses getUser() which triggers a JWT verification round-trip to Supabase —
 * a few tens of ms in Edge runtime. If we ever need this faster, switch to
 * getClaims() once it ships in @supabase/ssr, or decode locally with JWKS.
 */
export async function getClaims(
  request: NextRequest
): Promise<SessionClaims | null> {
  const dummyHeaders = new Headers()
  const supabase = createProxyClient(request, { headers: dummyHeaders })

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

/**
 * Creates a Supabase server client for use inside Next.js middleware (proxy.ts).
 * Reads/writes cookies via NextRequest + NextResponse instead of next/headers,
 * which isn't available in the Edge runtime.
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
