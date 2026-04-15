import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { resolveOrgId } from '@/lib/ingredients/queries'

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'
const SCOPE = 'com.intuit.quickbooks.accounting'
const STATE_COOKIE = 'qbo_oauth_state'
const STATE_TTL_SECONDS = 600 // 10 minutes

export async function GET() {
  // Require an authenticated org so we can bind the connect intent
  // to *this* user's org via the state cookie.
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    return NextResponse.redirect(
      new URL('/login?next=/api/qbo/connect', getAppUrl())
    )
  }

  const clientId = process.env.QBO_CLIENT_ID
  const redirectUri = process.env.QBO_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'qbo_not_configured', message: 'QBO_CLIENT_ID and QBO_REDIRECT_URI must be set' },
      { status: 500 }
    )
  }

  // CSRF state: random + orgId binding (we verify both on callback).
  const nonce = randomBytes(16).toString('hex')
  const state = `${nonce}.${orgId}`

  const url = new URL(AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  })
  return res
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}
