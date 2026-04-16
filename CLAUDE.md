@AGENTS.md

# Lotmonster — Project Status & Handoff

## Session Handoff — Start Here

**Status as of 2026-04-16:** user is mid-way through **Part 9A** — manual
end-to-end testing of existing features in production at
https://www.lotmonster.co.

**First thing to read:** `docs/part-9a-test-checklist.md` — the 13-section
printable checklist the user is ticking through. 90-min estimate.
**`docs/lotmonster-build-guide-v4.md`** is authoritative for everything
from Part 9 onward (supersedes the v3 guide's Parts 9–15). Contest deadline
is **Jun 2, 2026 23:59 PT** — submission portal
https://bdb.perplexityfund.ai/register; details in v4 Part 14.

**When the user reports a test failure**, triage with:
```bash
vercel logs --no-follow --since 30m --level error --expand
```

**Immediate sequence after 9A passes:** Part 9B (QBO end-to-end against
sandbox company `Sandbox Company US 74a4`, realm `9341456849762719`) →
Part 9 SKUs + finished-goods build (~8.5 days, highest-risk milestone is
the `completeRun` rewrite).

**Tools already configured:**
- Vercel CLI globally installed, authed as `ntangborn-3191`, repo linked
  (`.vercel/project.json` present)
- Supabase CLI linked to project `vvoyidhqlxjcuhhsdiyy`
- All env vars synced between `.env.local` and Vercel production
- Git auto-deploys on push to `main` (verified working; do not `vercel --prod`
  from local — it builds a Windows-specific bundle that broke auth once)
- Migration 006 is applied (auto-create org + owner membership on signup)

**Don't start writing code for Part 9 until 9A passes.** The user wants to
verify the existing system is rock-solid before layering in SKUs.

---

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
- Tailwind CSS v4, shadcn/ui (custom dark UI; no shadcn components used directly yet)
- QuickBooks Online OAuth client built (sync cron pending)
- Stripe (not yet built)
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
- **No Settings page yet** — QBO OAuth callback redirects to
  `/dashboard/settings?qbo=...` which 404s. Build settings shell next.
- **Recipes have no SKU / Active flag** — schema lacks the columns;
  list shows Updated date instead. Migration 004 needed if/when wanted.
- **PO order date** uses `created_at` (no separate `order_date` column).
- **Atomicity**: production-run start/cancel and PO receive do
  sequential writes via the admin client, with best-effort rollback.
  Concurrent operations on the same lot can overdraft. Migrate to a
  Postgres rpc function when concurrency becomes real.
- **Sales-order traceability**: `lot_numbers_allocated` is a free
  TEXT[]; backward genealogy works via PR-numbers. A formal
  `sales_order_lots` junction table would be cleaner long-term.

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
- Migration 003: QBO credential columns on `orgs` (encrypted refresh token,
  expiry, environment, connected_at) — applied via Management API
- Migration 006: **every new user gets a solo org**.
  `public.handle_new_user()` fires AFTER INSERT on `auth.users`, calls
  `public.ensure_org_for_user(uuid)` (SECURITY DEFINER, idempotent) which
  creates the `orgs` row + `org_members(role='owner')` using
  `raw_user_meta_data.org_name/org_slug`. Falls back to `full_name`-based or
  email-prefix name for Google OAuth signups that have no org metadata.
  Also stamps `org_id` into `raw_app_meta_data` so `current_org_id()` works
  after the user's next session refresh. Adds `org_members_self_select`
  policy (`user_id = auth.uid()`) so `resolveOrgId()` can read the
  membership before the JWT carries `org_id`. Backfill DO-block
  retroactively created orgs for any orphan `auth.users` rows.

### Homepage + Dashboard
- Placeholder homepage with Sign Up / Log In CTAs (`src/app/page.tsx`)
- Dashboard home: 4-card stats row (active ingredients, active lots,
  expiring this week, month's COGS), Expiring Soon card (≤30d, red ≤7d),
  Low Stock card with Reorder buttons → `/purchase-orders/new?ingredient=`
  (`src/app/dashboard/page.tsx`)
- Sidebar nav with 10 items including Traceability
  (`src/app/dashboard/_components/shell.tsx`)

### Onboarding (3 paths)
- Welcome screen with equal-weight cards + global drag-drop (`src/app/dashboard/onboarding/page.tsx`)
- Path A Upload: spreadsheet parse, Claude Vision, column mapping, editable table (`src/app/dashboard/onboarding/upload/page.tsx`)
- Path B Manual: form with bulk pricing, live cost derivation chain (`src/app/dashboard/onboarding/manual/page.tsx`)
- Path C Chat: streaming AI chat, live staging panel (`src/app/dashboard/onboarding/chat/page.tsx`)
- Zero-cost guard across all 3 paths (`src/lib/validation.ts`, `src/components/zero-cost-warning.tsx`)
- Bulk insert server action (`src/lib/actions/ingredients.ts`)

### Ingredients (`/dashboard/ingredients`)
- List with search + category filter, current stock + weighted avg cost
  aggregations, color-coded stock status badges
- Detail with inline edit, delete (refused on FK references), 3 tabs:
  Lots / Used In / Purchase History
- New form with full schema fields
- API: `GET/POST /api/ingredients`, `GET/PATCH/DELETE /api/ingredients/[id]`
- Shared: `src/lib/ingredients/{schema,queries}.ts` (incl. `resolveOrgId`)

### Lots + FEFO (`/dashboard/lots`)
- FEFO-sorted list (expiry ASC NULLS LAST, received ASC) with row-tint
  warnings (red ≤7d/expired, yellow ≤30d), filters by ingredient/status/expiry
- Create-lot modal: searchable ingredient dropdown, auto-suggested lot #
  (`{PREFIX}-{YYYYMMDD}-{NNN}`), zero-cost guard, live total
- `src/lib/fefo.ts` — `allocateLots` (throws InsufficientStockError),
  `previewAllocation` (non-throwing). Pure: reads only, no mutation.
- `src/components/low-stock-alerts.tsx` — server component, drop-in
- API: `POST /api/lots`, `GET /api/lots?suggest_for=`

### Recipes (`/dashboard/recipes`)
- List, builder (drag-handle reorder, live cost preview), detail w/ tabs
  (Overview, Production History), Save / Save & Start Production Run
- API: full CRUD at `/api/recipes`, `/api/recipes/[id]`
- `src/lib/recipes/queries.ts` — `getIngredientAvgCosts` (weighted avg)

### Production Runs (`/dashboard/production-runs`)
- List with status chips, /new with live FEFO preview, detail with state
  workflow (Draft → Start → Complete → done; Cancel returns stock)
- `src/lib/production/actions.ts`:
  - `startRun` — FEFO allocate + decrement lots + insert
    production_run_lots (with rollback on mid-run failure)
  - `completeRun` — sums line_cost as total_cogs, computes waste_pct,
    inserts `qbo_sync_log` row (entity_type='journal_entry')
  - `cancelRun` — returns qty to lots, restores 'available'
- Auto run number: `PR-{YYYY}-{NNN}`
- API: full CRUD + `/start`, `/complete`, `/cancel`, `/preview`

### Purchase Orders (`/dashboard/purchase-orders`)
- List with status chips, /new with supplier autocomplete + "Add from
  Low Stock" button, detail with state workflow
- Dedicated /receive page: per-line qty + lot # (auto-suggested) +
  expiry + override unit cost. Each receive creates real lots and
  inserts a `qbo_sync_log` row (entity_type='bill').
- Auto PO number: `PO-{YYYY}-{NNN}`
- API: full CRUD + `/status`, `/receive`

### Sales Orders (`/dashboard/sales-orders`)
- List with status chips, /new with customer datalist autocomplete,
  detail with state workflow (Draft → Confirm → Ship → Mark Delivered)
- Ship modal: per-line lot # chip input + auto-suggested production runs
  (FEFO-allocated) from `/api/sales-orders/[id]/suggestions`
- Lot Traceability section (shipped/closed): de-duped flat list of
  allocated lots with deep links
- `shipSalesOrder` action inserts `qbo_sync_log` row (entity_type='invoice')
- Auto SO number: `SO-{YYYY}-{NNN}`
- API: full CRUD + `/status`, `/ship`, `/suggestions`

### Traceability (`/dashboard/traceability`)
- Search by Lot / Run / Order, color-coded stages connected by flow arrows
- `src/lib/traceability.ts`:
  - `traceForward` (lot → runs → SOs)
  - `traceReverse` (SO → runs → ingredient lots → suppliers)
  - `traceRun` (middle-out)
- API: `GET /api/traceability?lot=|run=|order=`
- "View Traceability" button on shipped SOs deep-links here

### COGS calculations (`src/lib/cogs.ts` + tests)
- Pure helpers: `computeRunCOGS`, `computeRecipeEstimatedCOGS`,
  `aggregateMonthlyCOGS`, `aggregateYTDCOGS`
- Wrappers: `calculateRunCOGS`, `calculateRecipeEstimatedCOGS`,
  `getMonthlyCOGS`, `getYTDCOGS`
- 19 tests passing (`src/lib/__tests__/cogs.test.ts`)
- Uses `unit_cost_at_use` snapshot — completed runs are immutable when
  lot prices change later

### QuickBooks OAuth + Sync (`/api/qbo/*`)
- `src/lib/qbo/`:
  - `encryption.ts` — AES-256-GCM at rest (`v1.<iv>.<ct>.<tag>`)
  - `tokens.ts` — exchange/refresh, in-process access cache w/ 5-min
    buffer, persists rotated refresh token, **auto-disconnects on
    persistent 401 / expired refresh**, typed `QBONotConnectedError`
    / `QBOTokenExpiredError`
  - `client.ts` — `qboFetch` / `qboJson<T>` w/ sandbox/prod base URL,
    `?minorversion=75` pinning, one-shot 401 retry → disconnect on
    persistent failure
- OAuth: `GET /api/qbo/connect` (CSRF state cookie binds nonce + orgId),
  `GET /api/qbo/callback` (verifies state + orgId match), `POST /api/qbo/disconnect`
- Sync routes (cron + user auth modes; idempotent via stored doc IDs):
  - `POST /api/qbo/sync/journal-entry` — completed run → balanced JE
    (Debit COGS / Credit Inventory). Stores `production_runs.qbo_journal_entry_id`.
  - `POST /api/qbo/sync/invoice` — shipped SO → Invoice with
    SalesItemLineDetail, find-or-create Customer by name. Stores
    `sales_orders.qbo_invoice_id`, promotes status to 'invoiced'.
  - `POST /api/qbo/sync/bill` — received PO → Bill with
    AccountBasedExpenseLineDetail (uses inventory account), find-or-
    create Vendor by name. Stores `purchase_orders.qbo_bill_id`.
- Migrations 003/004/005 add: encrypted refresh token + expiry +
  environment + connected_at; account mappings (cogs / inventory /
  ar / ap / default_item / income); doc id columns
  (`qbo_journal_entry_id`, `qbo_bill_id`, `qbo_invoice_id`).
- Reference: `docs/qbo-oauth2-reference.md` (committed)
- Sync cron worker not built — `qbo_sync_log` rows are written by
  ship/receive/complete actions but no automated dispatcher consumes
  them yet. The sync routes themselves are idempotent and safe to
  hit manually.
- One-bill-per-PO limitation noted in bill route — multiple partial
  receipts on one PO won't generate multiple bills.

### AI Routes
- `src/app/api/ai/extract-ingredients/route.ts` — Claude Vision for images/PDFs
- `src/app/api/ai/onboarding-chat/route.ts` — streaming chat for Path C

### Tests
- `src/lib/__tests__/units.test.ts` — unit conversions
- `src/lib/__tests__/cogs.test.ts` — COGS math + bucketing

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
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# AI
ANTHROPIC_API_KEY

# App
CRON_SECRET
NEXT_PUBLIC_APP_URL=https://www.lotmonster.co

# QuickBooks Online (register app at developer.intuit.com)
QBO_CLIENT_ID
QBO_CLIENT_SECRET
QBO_REDIRECT_URI=https://lotmonster.vercel.app/api/qbo/callback
QBO_ENVIRONMENT=sandbox            # or 'production'
QBO_TOKEN_ENCRYPTION_KEY           # 64-char hex (32 bytes); rotating it
                                   # locks every stored refresh token
```
Note: The project uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` — NOT `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Generate the QBO encryption key with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Build Plan — Authoritative Source

**The original `docs/lotmonster-build-guide-v3.md` is authoritative for
Parts 0–8 only.** From here forward, follow:

- **`docs/plans/2026-04-16-build-plan-revised-from-part-9.md`** — the
  master plan from this point to contest submission. ~23 working days,
  estimated finish ~2026-05-10. Contains 9A (test existing), 9B (verify
  QBO), 9 (SKUs), 10 (AI assistant — rewritten with finished-goods
  awareness), 11 (cron + QBO sync dispatcher), 12 (Stripe), 13 (demo
  seeder + polish), 14 (security + submission), 15 (phase 2/3 backlog).
- **`docs/plans/2026-04-16-skus-and-finished-goods.md`** — full schema
  spec referenced from Part 9. Models packaging components as
  `ingredients` rows with `kind = 'raw' | 'packaging'`, finished
  goods as polymorphic `lots` rows (`sku_id` XOR `ingredient_id`),
  multi-SKU runs with split liquid/packaging COGS.

Old guide → new plan map:
- Original Part 9 (AI) → new Part 10
- Original Part 10 (Cron) → new Part 11
- Original Part 11 (Stripe) → new Part 12
- Original Part 12 (Demo Seeder) → new Part 13
- Original Part 13 (Security/Submission) → new Part 14
- Original Parts 14–15 (Troubleshooting/Checklist) → folded into the
  relevant new parts; troubleshooting stays in the original guide as
  reference.

## What's NOT Built Yet (sequenced by the new plan)

Each item now has a home in the revised plan. Rough order of operations:

- **Part 9A (next):** End-to-end manual test of all completed features
  in production. Plan has the click-by-click test script.
- **Part 9B:** QBO end-to-end verification using sandbox company
  `Sandbox Company US 74a4` (realm `9341456849762719`). Account
  mappings are still direct-DB-insert (no UI yet — settings shell is
  Part 13).
- **Part 9 (SKUs + Finished Goods):** Migrations 007+, polymorphic
  lots, packaging-as-ingredients, multi-SKU `completeRun` rewrite,
  finished-goods FEFO. *This is the highest-risk milestone — the
  `completeRun` rewrite touches 5 tables atomically with best-effort
  rollback.*
- **Part 10:** AI assistant (`/dashboard/ai` page + 10–11 Claude
  tool_use RPC functions, several rewritten to acknowledge finished
  goods + packaging).
- **Part 11:** `/api/cron/qbo-sync` dispatcher (Vercel cron on
  every-15-min cadence — *requires Vercel Pro*; Hobby is 1/day).
- **Part 12:** Stripe billing.
- **Part 13:** Demo seeder + polish, including the `/dashboard/settings`
  shell that fixes the QBO callback 404.
- **Part 14:** Security audit + contest submission (rotate the leaked
  service-role key + Supabase access token *before* submission, not
  after).

Other existing TODOs not in the new plan (phase 2/3 backlog at the end
of the revised plan):
- Recipe edit page (`/dashboard/recipes/[id]/edit`) — PATCH API works,
  needs UI
- Real landing page
- Lot detail page (have list, no detail)
- Forecasting / replenishment recommendations
- Multi-user member management beyond signup-creates-org

## Recently resolved (2026-04-16 session)

### "No organization found for this user." on save
Vercel prod logs showed `POST /dashboard/onboarding/manual` errors
thrown at `src/lib/actions/ingredients.ts:36`. Root cause: signup stashed
`org_name`/`org_slug` in `raw_user_meta_data` but nothing created the
`orgs` + `org_members` rows — every call to `resolveOrgId` failed for
fresh users. Fixed by migration 006 (see Database section). Four existing
orphan users were backfilled as part of the same migration ("Tangborn's
Hot Sauce", "QA Test Sauces", "QA Test Brand", "test").

### Vercel CLI + env sync
Vercel CLI installed globally, authed as `ntangborn-3191`, repo linked.
Production env vars synced from `.env.local`: `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and a fresh
`QBO_TOKEN_ENCRYPTION_KEY` (generated; also written to `.env.local`).

### Brand/logo rollout
User supplied transparent logo + 5 favicon sizes in `/public/`. Replaced
text wordmarks on `/`, `/login`, `/signup` with `<Image>` logo; added
32px favicon next to "Lotmonster" text in dashboard sidebar. Wired all
favicon sizes + Apple touch icon via `metadata.icons` in `layout.tsx`.

### Deployment lesson learned
Commit `fb2fc82` auto-deployed via Vercel's git integration (CI-built →
deploy `g7qckfojb`, works fine). A redundant manual `vercel --prod` from
local (Windows) built a subtly-broken bundle (`bhihp4z9j`) that produced
`AuthRetryableFetchError: ECONNRESET` on Vercel↔Supabase. Rolled back.
**Lesson: deploy via `git push`. Never `vercel --prod` from this Windows
box.** Vercel git integration is verified working end-to-end.

### Build plan overhaul
Bob wrote the SKU + finished-goods plan
(`docs/plans/2026-04-16-skus-and-finished-goods.md`), revised it against
user's 6 answers (packaging-as-inventory pulled from phase 3 to phase 1
via `ingredients.kind` flag, among others), then produced the master
build plan (`docs/plans/2026-04-16-build-plan-revised-from-part-9.md`)
that supersedes v3 guide Parts 9–15. I then wrote the step-by-step
prompt-driven execution guide at `docs/lotmonster-build-guide-v4.md`
(~4,000 lines) which is authoritative from Part 9 onward. Both plans
were aligned to v4 canonical naming after a consistency pass:
- `ai_readonly` role (no `claude_readonly` alias)
- qbo_sync_log retry columns `attempt_count` + `last_attempted_at` +
  `error_message` (no `next_retry_at`/`last_error`; no exponential
  backoff in MVP)
- Migration numbers 007–012 canonical; phase-2 add-ons use 013+

### Test checklist for 9A
`docs/part-9a-test-checklist.md` written as the printable version of
v4's Part 9A. 13 sections, ~90 min total. User is ticking through it now.
