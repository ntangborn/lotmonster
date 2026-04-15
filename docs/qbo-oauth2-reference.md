# QuickBooks Online OAuth 2.0 Reference — Lotmonster

> Last updated: April 15, 2026
> Source: [Intuit OAuth 2.0 Docs](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)

---

## 1. Authorization URL

Endpoint (sandbox and production share the same authorization URL):

```
https://appcenter.intuit.com/connect/oauth2
```

Full example with all required params:

```
https://appcenter.intuit.com/connect/oauth2
  ?client_id=YOUR_CLIENT_ID
  &response_type=code
  &scope=com.intuit.quickbooks.accounting
  &redirect_uri=https://your-lotmonster-app.com/oauth-redirect
  &state=CSRF_TOKEN_HERE
```

### Required Parameters

| Param | Value / Notes |
|---|---|
| `client_id` | From Intuit Developer Portal |
| `response_type` | Always `code` |
| `scope` | Space-separated scope string (see §4) |
| `redirect_uri` | Must be HTTPS, no query params, registered in portal |
| `state` | Required CSRF token — server rejects requests without it |

> **Note:** `redirect_uri` must not contain query parameters. Pass any extra context via the `state` field instead.

---

## 2. Token Exchange (Authorization Code → Access + Refresh Tokens)

```
POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
```

### Headers

```
Accept: application/json
Authorization: Basic <base64(client_id:client_secret)>
Content-Type: application/x-www-form-urlencoded
```

### Body (form-encoded)

```
grant_type=authorization_code
&code=CODE_FROM_CALLBACK
&redirect_uri=https://your-lotmonster-app.com/oauth-redirect
```

### Response Fields

| Field | Description |
|---|---|
| `access_token` | Bearer token for API calls |
| `refresh_token` | Used to get new access tokens |
| `token_type` | `bearer` |
| `expires_in` | `3600` (1 hour) |
| `x_refresh_token_expires_in` | Refresh token remaining lifetime in seconds |
| `realmId` | QBO Company ID — required in all API endpoint URLs |

---

## 3. Token Refresh (Access Token Renewal)

Same endpoint as token exchange:

```
POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
```

### Headers

```
Accept: application/json
Authorization: Basic <base64(client_id:client_secret)>
Content-Type: application/x-www-form-urlencoded
```

### Body (form-encoded)

```
grant_type=refresh_token
&refresh_token=YOUR_CURRENT_REFRESH_TOKEN
```

> **Important:** Each refresh response returns a **new** `refresh_token`. Always store and use the latest one from the most recent response.

---

## 4. Scopes

### Accounting (journal entries, invoices, bills)

```
com.intuit.quickbooks.accounting
```

### Optional: OpenID / User Identity

```
com.intuit.quickbooks.accounting openid profile email
```

Scopes are space-separated in the authorization URL.

---

## 5. Base URLs

| Environment | Base URL |
|---|---|
| Sandbox | `https://sandbox-quickbooks.api.intuit.com` |
| Production | `https://quickbooks.api.intuit.com` |

### API Path Pattern

```
/v3/company/{realmId}/{resource}?minorversion=75
```

Example — query invoices in sandbox:

```
GET https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}/query
  ?query=select * from Invoice
  &minorversion=75
```

---

## 6. Refresh Token Lifetime

**Legacy behavior (pre-Nov 2025):** Rolling 100-day window — refresh token stayed valid as long as it was used at least every 100 days.

**Current behavior:** Intuit [changed the policy in November 2025](https://blogs.intuit.com/2025/11/12/important-changes-to-refresh-token-policy). All refresh tokens now have a **hard maximum validity of 5 years**. The 100-day rolling window no longer applies.

### Implementation Guidance

- Use the `x_refresh_token_expires_in` field from the token response to determine exact expiry (in seconds).
- Do not hardcode a 100-day assumption.
- If the refresh token expires, the user must go through the full authorization flow again.

---

## 7. Required Headers

### For Token Endpoints (exchange + refresh)

```
Accept: application/json
Authorization: Basic <base64(client_id:client_secret)>
Content-Type: application/x-www-form-urlencoded
```

### For QBO API Calls

```
Accept: application/json
Authorization: Bearer {access_token}
Content-Type: application/json
```

> **Key distinction:** Token endpoints use `Basic` auth with your app credentials. API calls use `Bearer` auth with the user's access token.

---

## 8. minorversion=75

### What Changed

Per [Intuit's deprecation notice](https://github.com/mcohen01/node-quickbooks/issues/237) (effective August 1, 2025 in production; February 10, 2025 in sandbox):

- Minor versions 1–74 are **fully deprecated and ignored**.
- Any `minorversion` value below `75` is silently treated as `75`.
- If `minorversion` is **omitted**, the API defaults to `75` (previously defaulted to base/v1).
- All schema changes from v1 through v75 are now in effect.

### Required Actions for Lotmonster

1. **Pin all requests** to `?minorversion=75` explicitly.
2. **Test entity schemas** in sandbox — verify Invoice, Bill, and JournalEntry response shapes match v75.
3. **Handle unknown fields gracefully** — ignore rather than error on new or unrecognized fields, so future minor version bumps don't break the integration.

### Example Request

```
GET https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}/invoice/{invoiceId}?minorversion=75
Authorization: Bearer {access_token}
Accept: application/json
```

---

## Quick Reference Cheat Sheet

| Item | Value |
|---|---|
| Authorization URL | `https://appcenter.intuit.com/connect/oauth2` |
| Token endpoint | `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` |
| Accounting scope | `com.intuit.quickbooks.accounting` |
| Access token TTL | 3600 seconds (1 hour) |
| Refresh token TTL | 5 years (hard max) |
| Sandbox base URL | `https://sandbox-quickbooks.api.intuit.com` |
| Production base URL | `https://quickbooks.api.intuit.com` |
| API version param | `?minorversion=75` |
| Token auth header | `Authorization: Basic base64(client_id:client_secret)` |
| API auth header | `Authorization: Bearer {access_token}` |

---

## Sources

- [Intuit OAuth 2.0 Setup Guide](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [Intuit OAuth 2.0 FAQ](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/faq)
- [Refresh Token Policy Change (Nov 2025)](https://blogs.intuit.com/2025/11/12/important-changes-to-refresh-token-policy)
- [minorversion=75 Deprecation Notice](https://github.com/mcohen01/node-quickbooks/issues/237)
