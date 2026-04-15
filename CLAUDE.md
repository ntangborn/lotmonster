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

## Auth — Working (6-digit OTP flow)

Email auth uses 6–8 digit OTP codes, **not** magic links. Magic links were
abandoned after persistent `PKCE code verifier not found in storage` errors
caused by @supabase/ssr hardcoding `flowType: "pkce"` and users opening email
links in different browser contexts than where they requested them.

### Flow:
1. User enters email on `/login` or `/signup`
2. Client calls `signInWithOtp({ email, options: { shouldCreateUser } })`
3. Supabase sends email with `{{ .Token }}` (8-digit code, configured via
   `mailer_otp_length`)
4. Form switches to code-input stage
5. User pastes code → `verifyOtp({ email, token, type: 'email' })` → session
   cookie written → router.replace to dashboard

### Files:
- `src/app/login/page.tsx` — two-stage form (email → code)
- `src/app/signup/page.tsx` — two-stage form w/ org_name in `options.data`
- `src/app/auth/callback/page.tsx` — **only used by Google OAuth now**,
  performs PKCE exchange via `exchangeCodeForSession`
- `src/lib/supabase/proxy.ts` + `claims.ts` — read session via
  `createServerClient.auth.getUser()`; the old manual `JSON.parse` broke
  because @supabase/ssr encodes session cookies as `base64-<payload>`,
  sometimes chunked into `.0`, `.1`

### Supabase config (managed via Management API, not dashboard):
- `mailer_otp_length: 8`
- `mailer_templates_magic_link_content` / `..._confirmation_content` —
  render `{{ .Token }}` as the code (updated from default link-only template)
- `uri_allow_list`: `https://lotmonster.co,https://www.lotmonster.co/auth/callback,http://localhost:3000/auth/callback`
  (matters only for Google OAuth — OTP doesn't hit callback URLs)

### Supabase CLI setup:
```
npx supabase login --token <SUPABASE_ACCESS_TOKEN>
npx supabase link --project-ref vvoyidhqlxjcuhhsdiyy
```
Access tokens: https://supabase.com/dashboard/account/tokens
(can't use interactive login in non-TTY)

### Management API — read/write auth config without dashboard:
```bash
# Read full auth config
curl -sk --ssl-no-revoke -H "Authorization: Bearer <TOKEN>" \
  https://api.supabase.com/v1/projects/vvoyidhqlxjcuhhsdiyy/config/auth

# Patch fields
curl -sk --ssl-no-revoke -X PATCH \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"uri_allow_list":"..."}' \
  https://api.supabase.com/v1/projects/vvoyidhqlxjcuhhsdiyy/config/auth
```

---

## ⚠️ Known issues / deferred

- **Exposed credentials**: service role key + Supabase access token were
  pasted in a previous Claude session. Rotate when convenient
  (Supabase Dashboard → Settings → API).
- **Homepage is a placeholder** — big LOTMONSTER wordmark + tagline +
  Sign Up/Log In buttons. Proper landing page needs to be specced
  (use `bob-builder` agent).

---

## Completed Features

### Auth
- Email 6–8 digit OTP + Google OAuth (`src/app/login/page.tsx`, `src/app/signup/page.tsx`)
- Google OAuth still uses PKCE callback (`src/app/auth/callback/page.tsx`)
- Logout (`src/app/api/auth/logout/route.ts`)
- Dashboard layout auth guard via `getServerClaims()` (`src/app/dashboard/layout.tsx`)

### Database
- 13-table schema: `supabase/migrations/001_initial_schema.sql`
- RLS with `public.current_org_id()` helper (NOT `auth.` schema — it's locked)
- Migration 002: `CHECK (unit_cost > 0)` on lots table

### Onboarding (3 paths — all built, auth working)
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
