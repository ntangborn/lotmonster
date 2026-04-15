/**
 * QBO token lifecycle:
 *   - Refresh tokens live in orgs.qbo_refresh_token_encrypted (AES-GCM).
 *   - Access tokens are minted on demand and cached in-process by orgId
 *     until 5 minutes before their 1-hour TTL (CACHE_BUFFER_SECONDS).
 *   - On refresh, Intuit returns a new refresh token — we replace the
 *     stored one. (Per docs: "Each refresh response returns a new
 *     refresh_token. Always store and use the latest one.")
 *   - Refresh tokens have a 5-year hard max; if Intuit rejects the
 *     refresh (400/401), we automatically clear stored credentials
 *     and throw QBOTokenExpiredError. Callers should catch that and
 *     show a "Reconnect QuickBooks" prompt → /api/qbo/connect.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken, encryptToken } from './encryption'

const TOKEN_ENDPOINT =
  'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const CACHE_BUFFER_SECONDS = 300 // refresh 5 min before access-token expiry

export interface QBOConnection {
  realmId: string
  environment: 'sandbox' | 'production'
}

interface CachedAccess {
  accessToken: string
  expiresAt: number // ms epoch
}

const accessCache = new Map<string, CachedAccess>()

export class QBONotConnectedError extends Error {
  constructor() {
    super('QuickBooks is not connected for this org.')
    this.name = 'QBONotConnectedError'
  }
}

export class QBOTokenExpiredError extends Error {
  constructor() {
    super('QuickBooks refresh token has expired. Please reconnect.')
    this.name = 'QBOTokenExpiredError'
  }
}

function basicAuthHeader(): string {
  const id = process.env.QBO_CLIENT_ID
  const secret = process.env.QBO_CLIENT_SECRET
  if (!id || !secret) {
    throw new Error('QBO_CLIENT_ID and QBO_CLIENT_SECRET must be set')
  }
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  x_refresh_token_expires_in: number
  token_type: 'bearer'
}

export async function exchangeAuthCode(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }
  return (await res.json()) as TokenResponse
}

async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    if (res.status === 400 || res.status === 401) {
      throw new QBOTokenExpiredError()
    }
    throw new Error(`Token refresh failed (${res.status}): ${text}`)
  }
  return (await res.json()) as TokenResponse
}

export interface OrgQBOState {
  realmId: string
  environment: 'sandbox' | 'production'
  refreshToken: string
  refreshExpiresAt: Date | null
}

async function loadOrgQBOState(orgId: string): Promise<OrgQBOState> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('orgs')
    .select(
      'qbo_realm_id, qbo_environment, qbo_refresh_token_encrypted, qbo_refresh_token_expires_at'
    )
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new QBONotConnectedError()
  if (!data.qbo_realm_id || !data.qbo_refresh_token_encrypted) {
    throw new QBONotConnectedError()
  }
  const refreshToken = decryptToken(data.qbo_refresh_token_encrypted)
  const env = (data.qbo_environment as 'sandbox' | 'production' | null) ??
    'sandbox'
  return {
    realmId: data.qbo_realm_id,
    environment: env,
    refreshToken,
    refreshExpiresAt: data.qbo_refresh_token_expires_at
      ? new Date(data.qbo_refresh_token_expires_at)
      : null,
  }
}

export async function persistConnection(
  orgId: string,
  realmId: string,
  environment: 'sandbox' | 'production',
  tokens: TokenResponse
): Promise<void> {
  const admin = createAdminClient()
  const refreshExpiresAt = new Date(
    Date.now() + tokens.x_refresh_token_expires_in * 1000
  ).toISOString()
  const { error } = await admin
    .from('orgs')
    .update({
      qbo_realm_id: realmId,
      qbo_environment: environment,
      qbo_refresh_token_encrypted: encryptToken(tokens.refresh_token),
      qbo_refresh_token_expires_at: refreshExpiresAt,
      qbo_connected_at: new Date().toISOString(),
    })
    .eq('id', orgId)
  if (error) throw new Error(error.message)

  // Seed the access-token cache so the first API call after connect
  // doesn't pay the round-trip.
  accessCache.set(orgId, {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in - CACHE_BUFFER_SECONDS) * 1000,
  })
}

/**
 * Returns a valid access token, refreshing if the cached one is missing
 * or within 5 minutes of expiry. On successful refresh, persists the
 * new (rotated) refresh_token. If Intuit rejects the refresh token,
 * automatically disconnects and throws QBOTokenExpiredError so the
 * UI can prompt the user to reconnect.
 */
export async function getQBOAccessToken(orgId: string): Promise<{
  accessToken: string
  realmId: string
  environment: 'sandbox' | 'production'
}> {
  const state = await loadOrgQBOState(orgId)
  if (state.refreshExpiresAt && state.refreshExpiresAt.getTime() < Date.now()) {
    await disconnectQBO(orgId)
    throw new QBOTokenExpiredError()
  }

  const cached = accessCache.get(orgId)
  if (cached && cached.expiresAt > Date.now()) {
    return {
      accessToken: cached.accessToken,
      realmId: state.realmId,
      environment: state.environment,
    }
  }

  let tokens
  try {
    tokens = await refreshAccessToken(state.refreshToken)
  } catch (e) {
    if (e instanceof QBOTokenExpiredError) {
      // Intuit rejected the refresh token — clear stored credentials
      // so the next /api/qbo/connect attempt starts clean.
      await disconnectQBO(orgId)
    }
    throw e
  }
  // Persist new refresh token (it rotates on every refresh)
  await persistConnection(orgId, state.realmId, state.environment, tokens)
  return {
    accessToken: tokens.access_token,
    realmId: state.realmId,
    environment: state.environment,
  }
}

export async function disconnectQBO(orgId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('orgs')
    .update({
      qbo_realm_id: null,
      qbo_environment: null,
      qbo_refresh_token_encrypted: null,
      qbo_refresh_token_expires_at: null,
      qbo_connected_at: null,
    })
    .eq('id', orgId)
  accessCache.delete(orgId)
}

export function clearAccessCache(orgId: string): void {
  accessCache.delete(orgId)
}
