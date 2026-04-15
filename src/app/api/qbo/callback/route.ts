import { NextResponse, type NextRequest } from 'next/server'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { exchangeAuthCode, persistConnection } from '@/lib/qbo'

const STATE_COOKIE = 'qbo_oauth_state'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const realmId = searchParams.get('realmId')
  const errorParam = searchParams.get('error')

  const settings = (msg: string) =>
    NextResponse.redirect(
      new URL(`/dashboard/settings?qbo=${encodeURIComponent(msg)}`, getAppUrl())
    )

  if (errorParam) return settings(`error:${errorParam}`)
  if (!code || !state || !realmId) return settings('missing_params')

  const stateCookie = request.cookies.get(STATE_COOKIE)?.value
  if (!stateCookie || stateCookie !== state) {
    return settings('state_mismatch')
  }

  // state format: <nonce>.<orgId> — verify the orgId portion matches
  // the currently-authenticated org.
  const stateOrgId = state.split('.')[1]
  if (!stateOrgId) return settings('state_malformed')

  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    return NextResponse.redirect(
      new URL('/login?next=/dashboard/settings', getAppUrl())
    )
  }
  if (orgId !== stateOrgId) return settings('org_mismatch')

  const redirectUri = process.env.QBO_REDIRECT_URI
  const environment =
    (process.env.QBO_ENVIRONMENT as 'sandbox' | 'production' | undefined) ??
    'sandbox'
  if (!redirectUri) return settings('qbo_not_configured')

  let tokens
  try {
    tokens = await exchangeAuthCode(code, redirectUri)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'token_exchange_failed'
    return settings(`exchange:${msg.slice(0, 100)}`)
  }

  try {
    await persistConnection(orgId, realmId, environment, tokens)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'persist_failed'
    return settings(`persist:${msg.slice(0, 100)}`)
  }

  // Clear the state cookie before redirecting on success.
  const res = NextResponse.redirect(
    new URL('/dashboard/settings?qbo=connected', getAppUrl())
  )
  res.cookies.delete(STATE_COOKIE)
  return res
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}
