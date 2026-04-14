import { type NextRequest, NextResponse } from 'next/server'
import { getClaims, createProxyClient } from '@/lib/supabase/proxy'

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

const protectedPatterns = [
  /^\/dashboard(\/.*)?$/,
  /^\/api\/ai(\/.*)?$/,
  /^\/api\/qbo(\/.*)?$/,
  /^\/api\/stripe\/portal$/,
]

const publicRoutes = new Set([
  '/',
  '/login',
  '/signup',
  '/api/auth/callback',
  '/api/stripe/webhook',
])

const cronPattern = /^\/api\/cron(\/.*)?$/

function isProtected(pathname: string): boolean {
  return protectedPatterns.some((re) => re.test(pathname))
}

function isPublic(pathname: string): boolean {
  return publicRoutes.has(pathname)
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- Cron routes: validate CRON_SECRET bearer token ---
  if (cronPattern.test(pathname)) {
    const authHeader = request.headers.get('authorization') ?? ''
    const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`

    if (!process.env.CRON_SECRET || authHeader !== expected) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    return NextResponse.next()
  }

  // --- Public routes: pass through, but still refresh the Supabase session ---
  if (isPublic(pathname)) {
    const response = NextResponse.next()
    // Refresh session cookies so they don't go stale on public pages
    createProxyClient(request, response)
    return response
  }

  // --- Protected routes: require a valid session ---
  if (isProtected(pathname)) {
    const claims = getClaims(request)

    if (!claims) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      // Preserve the intended destination so we can redirect after login
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Valid session — refresh cookies and continue
    const response = NextResponse.next()
    createProxyClient(request, response)
    return response
  }

  // --- Everything else: pass through ---
  return NextResponse.next()
}

// ---------------------------------------------------------------------------
// Matcher — excludes Next.js internals and static assets
// ---------------------------------------------------------------------------

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
