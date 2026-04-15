/**
 * QBO API client. Wraps fetch with auth, base URL resolution,
 * minorversion=75 pinning, and one-shot retry on 401 (auto-refresh).
 * If the retry also returns 401, we treat the connection as dead:
 * disconnect the org and throw QBOTokenExpiredError so the caller
 * can prompt for a reconnect.
 *
 * Use for all server-side QBO calls (cron, webhooks, server actions).
 * NEVER use from the browser — never expose access tokens client-side.
 */

import {
  getQBOAccessToken,
  clearAccessCache,
  disconnectQBO,
  QBOTokenExpiredError,
} from './tokens'

const SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com'
const PROD_BASE = 'https://quickbooks.api.intuit.com'
const MIN_VERSION = '75'

export interface QBOFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  // Override default JSON content-type if needed (e.g. multipart).
  rawBody?: BodyInit
}

export interface QBOError extends Error {
  status: number
  body: string
}

function buildUrl(
  baseUrl: string,
  realmId: string,
  endpoint: string
): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = new URL(`/v3/company/${realmId}${path}`, baseUrl)
  if (!url.searchParams.has('minorversion')) {
    url.searchParams.set('minorversion', MIN_VERSION)
  }
  return url.toString()
}

/**
 * Fetch wrapper for QBO. `endpoint` is the path after /v3/company/{realmId}/
 * — e.g. 'invoice', 'query?query=select * from Bill', 'journalentry'.
 *
 * Returns the raw `Response`. Caller inspects status + parses JSON.
 * Use qboJson<T>() helper below for the common JSON case.
 */
export async function qboFetch(
  orgId: string,
  endpoint: string,
  options: QBOFetchOptions = {}
): Promise<Response> {
  return doFetch(orgId, endpoint, options, true)
}

async function doFetch(
  orgId: string,
  endpoint: string,
  options: QBOFetchOptions,
  allowRetry: boolean
): Promise<Response> {
  const { accessToken, realmId, environment } = await getQBOAccessToken(orgId)
  const base = environment === 'production' ? PROD_BASE : SANDBOX_BASE

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    ...((options.headers ?? {}) as Record<string, string>),
  }

  let body: BodyInit | undefined
  if (options.rawBody !== undefined) {
    body = options.rawBody
  } else if (options.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
    body =
      typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
  }

  const res = await fetch(buildUrl(base, realmId, endpoint), {
    ...options,
    headers,
    body,
  })

  // 401 from QBO usually means the access token expired between mint
  // and request (clock skew, edge cases). Refresh once and retry.
  if (res.status === 401) {
    if (allowRetry) {
      clearAccessCache(orgId)
      return doFetch(orgId, endpoint, options, false)
    }
    // Persistent 401 even after a fresh token — the connection is
    // genuinely dead. Clear stored credentials and bubble a typed
    // error so the UI can show "Reconnect QuickBooks".
    await disconnectQBO(orgId)
    throw new QBOTokenExpiredError()
  }

  return res
}

/**
 * Convenience: throws on non-2xx, returns parsed JSON.
 */
export async function qboJson<T = unknown>(
  orgId: string,
  endpoint: string,
  options: QBOFetchOptions = {}
): Promise<T> {
  const res = await qboFetch(orgId, endpoint, options)
  const text = await res.text()
  if (!res.ok) {
    const e = new Error(`QBO ${res.status}: ${text.slice(0, 500)}`) as QBOError
    e.status = res.status
    e.body = text
    throw e
  }
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T)
}
