@AGENTS.md

# Lotmonster — Project Status & Handoff

## What This Project Is
AI-native inventory + replenishment system for small CPG manufacturers.
Entered in the Perplexity Billion Dollar Build contest.
Live at: **https://www.lotmonster.co**
GitHub: **https://github.com/ntangborn/lotmonster**

## Stack
- Next.js 16.2.3 (App Router) — proxy.ts replaces middleware.ts, export named `proxy`
- Supabase (SSR v0.10.2) — `getAll()`/`setAll()` cookie pattern
- Vercel (deployment)
- Anthropic Claude API (claude-sonnet-4-6)
- Tailwind CSS v4, shadcn/ui
- Stripe, QuickBooks Online (stubs only, not yet built)
- Vitest for tests

## ⚠️ ACTIVE BUG — Auth Not Working (top priority)

Magic link auth is broken in production. The flow currently fails.

### What happens:
1. User requests magic link on `/login` or `/signup`
2. Supabase sends email with link → lands at `https://www.lotmonster.co/?code=xxx`
   (because `emailRedirectTo` URL is not on Supabase's allowlist, so Supabase
   falls back to Site URL)
3. `src/proxy.ts` intercepts `/?code=xxx` → redirects to `/auth/callback?code=xxx`
4. Client-side page `src/app/auth/callback/page.tsx` calls `exchangeCodeForSession(code)`
5. **FAILS** → user ends up at `/login?error=auth_callback_failed`

### What has been tried:
- Server-side route handler at `/api/auth/callback/route.ts` — fails (PKCE verifier not accessible server-side)
- Fixed wrong env var (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Added proxy rescue for `/?code=xxx` → `/auth/callback`
- Switched to client-side `exchangeCodeForSession` — still failing
- The actual Supabase error message has NOT been captured yet

### Most likely remaining causes (in order):
1. **Supabase Redirect URL allowlist** — `https://www.lotmonster.co/auth/callback`
   has NOT been added to Authentication → URL Configuration → Redirect URLs.
   Without this, Supabase ignores `emailRedirectTo` entirely. Fix this first.
2. **PKCE verifier cookie lost on cross-site redirect** — Supabase stores the
   code_verifier cookie when `signInWithOtp` is called. If SameSite policy
   prevents it from being sent when Supabase.co redirects back to lotmonster.co,
   the exchange fails. Fix: disable PKCE flow in Supabase Dashboard →
   Authentication → Settings → "Use implicit flow" (sends `#access_token=xxx`
   in URL hash instead of `?code=xxx`)
3. **Code already consumed** — if both `/api/auth/callback` AND `/auth/callback`
   are being hit for the same code, the second attempt fails. Verify only one
   handler is running.

### Next debugging step:
Get the actual Supabase error message. The client callback at
`src/app/auth/callback/page.tsx` currently silently redirects on failure.
Temporarily make it show the error on screen (the code for this was being
written when credits ran out — it was NOT saved to the file).

### Supabase dashboard to-dos:
- Authentication → URL Configuration → Redirect URLs:
  Add `https://www.lotmonster.co/auth/callback` and `http://localhost:3000/auth/callback`
- Consider switching to Implicit flow if PKCE keeps failing
- Supabase CLI login: `npx supabase login --token <SUPABASE_ACCESS_TOKEN>`
  (can't use interactive login in non-TTY, need personal access token from
  https://supabase.com/dashboard/account/tokens)

---

## Completed Features

### Auth
- Magic link + Google OAuth (`src/app/login/page.tsx`)
- Signup with org name (`src/app/signup/page.tsx`)
- Auth callback — client-side PKCE exchange (`src/app/auth/callback/page.tsx`)
- Logout (`src/app/api/auth/logout/route.ts`)
- Dashboard layout auth guard via `getServerClaims()` (`src/app/dashboard/layout.tsx`)

### Database
- 13-table schema: `supabase/migrations/001_initial_schema.sql`
- RLS with `public.current_org_id()` helper (NOT `auth.` schema — it's locked)
- Migration 002: `CHECK (unit_cost > 0)` on lots table

### Onboarding (3 paths — all built, blocked by auth bug)
- Welcome screen with equal-weight cards + global drag-drop (`src/app/dashboard/onboarding/page.tsx`)
- Path A Upload: spreadsheet parse, Claude Vision, column mapping, editable table (`src/app/dashboard/onboarding/upload/page.tsx`)
- Path B Manual: form with bulk pricing, live cost derivation chain (`src/app/dashboard/onboarding/manual/page.tsx`)
- Path C Chat: streaming AI chat, live staging panel (`src/app/dashboard/onboarding/chat/page.tsx`)
- Zero-cost guard across all 3 paths (`src/lib/validation.ts`, `src/components/zero-cost-warning.tsx`)
- Unit conversion library with full test suite (`src/lib/units.ts`, `src/lib/__tests__/units.test.ts`)
- Bulk insert server action (`src/lib/actions/ingredients.ts`)

### AI Routes
- `src/app/api/ai/extract-ingredients/route.ts` — Claude Vision for images/PDFs
- `src/app/api/ai/onboarding-chat/route.ts` — streaming chat for Path C

### Infrastructure
- `src/proxy.ts` — Next.js 16 middleware (named export `proxy`, not `middleware`)
- Vercel deployment live (env vars set in Vercel dashboard)
- `vercel.json` with `{"framework": "nextjs"}`

---

## Key Conventions (critical — don't break these)

```
// Next.js 16: middleware file is proxy.ts, export is named proxy
export async function proxy(request: NextRequest) { ... }
export const config = { matcher: [...] }

// Supabase server client
const supabase = await createClient()  // always await

// Never create functions in auth.* schema — use public.*
// RLS NULL guard pattern:
// public.current_org_id() IS NOT NULL AND org_id = public.current_org_id()

// New user JWT has no org_id — always look up from org_members table
// Admin client bypasses RLS — use only server-side

// Zod v4: error: not errorMap:
z.enum(UNITS, { error: () => ({ message: '...' }) })
```

## Env Vars (all must be set in Vercel AND .env.local)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CRON_SECRET
NEXT_PUBLIC_APP_URL=https://www.lotmonster.co
```
Note: The project uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` — NOT `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## What's NOT Built Yet
- Ingredients list/detail pages (`/dashboard/ingredients`)
- Lot creation form
- Production runs
- Purchase orders
- AI inventory assistant
- Stripe billing
- QuickBooks Online integration
- Any post-onboarding dashboard features
