@AGENTS.md

# Lotmonster — Project Status & Handoff

## Session Handoff — Start Here

**Status as of 2026-04-19:** Parts 9 + 10 are **code-complete and deployed
to prod**. User is **pausing the build to acquire Perplexity + Vercel
credits** before continuing. Next resumption work is Part 11 onward.

**What's live on prod (https://www.lotmonster.co):**
- Full phase-1 SKU + finished-goods pipeline (migration 007 + 008):
  new-SO form uses a SKU picker, ship modal runs server-side FEFO on
  finished lots with a preview + shortfall warning, multi-SKU
  Complete-Run dialog is live, traceability handles raw + finished
  lots with distinct color coding.
- QBO invoice sync uses per-SKU `qbo_item_id` with org default
  fallback (fails fast with an unmappable-SKUs list if neither is
  set).
- **AI Assistant** (`/dashboard/ai`): streaming chat UI, 11 tool_use
  functions backed by `execute_ai_query` Postgres wrapper with
  `ai_readonly` role (migrations 009 + 010).

**First thing to do next session:**
1. Ask the user if the credits are sorted. If not, don't touch Vercel
   Pro-requiring work (Part 11 cron) until they are.
2. If they've been manually testing the AI assistant, ask what came
   back. Expect a punch list of either prompt tuning or minor tool
   tweaks.
3. If tests pass, pick up at **Part 11** (Vercel cron dispatcher for
   QBO sync). Vercel **Hobby plan is 1 cron/day**; **Pro is needed**
   for the every-15-min cadence the plan specifies.

**Remaining build sequence** (per `docs/lotmonster-build-guide-v4.md`
and the revised plan at `docs/plans/2026-04-16-build-plan-revised-from-part-9.md`):
- **Part 11:** `/api/cron/qbo-sync` dispatcher. Migration 011 adds
  retry columns (`attempt_count`, `last_attempted_at`, `error_message`)
  to `qbo_sync_log`. Requires Vercel Pro.
- **Part 12:** Stripe billing (migration 012).
- **Part 13:** Demo seeder + polish — including the `/dashboard/settings`
  shell that fixes the QBO callback 404.
- **Part 14:** Security audit + contest submission. Rotate the leaked
  service-role key + Supabase access token *before* submitting.

**Contest deadline: Jun 2, 2026 23:59 PT.** Submission portal:
https://bdb.perplexityfund.ai/register. We have ~6 weeks buffer.

**When the user reports a failure**, triage with:
```bash
vercel logs --no-follow --since 30m --level error --expand
```

**Key facts for next session:**
- Migrations through **010** are applied to prod: 007 (SKUs + finished
  goods), 008 (`sales_order_lines.sku_id NOT NULL`, `recipe_id NULL`),
  009 (11 SECURITY DEFINER AI functions), 010 (`ai_readonly` role +
  `execute_ai_query` whitelist wrapper).
- 123 unit tests pass (`npm run test`). Build is green on main.
- DB types were regenerated post-010 (`src/types/database.ts` now
  includes `execute_ai_query` + the 11 `get_*` RPCs under Functions).
- Vercel auto-deploys from `main` work; **do not `vercel --prod`** from
  the local Windows box (it builds a broken bundle — burned us once).
- `/dashboard/settings` still 404s (Part 13). QBO OAuth callback
  redirects there, so testing QBO still needs DB-side verification
  after the redirect lands on the 404.
- **Ghost Habanero run** from 2026-04-17 testing: marked `completed`
  in the DB but has no `production_run_outputs` / finished lots
  (pre-dated the `completeRun` rewrite). Not blocking; see Known
  Issues for cleanup options.
- Pre-existing **xlsx CVE** (prototype pollution + ReDoS) is flagged
  by `npm audit`. No fix published upstream. Only used in the
  onboarding Excel-parse path. Will need mitigation before submission
  (swap to a maintained alternative or scope-limit the path).

**Tools already configured:**
- Vercel CLI globally installed, authed as `ntangborn-3191`, repo
  linked (`.vercel/project.json` present)
- Supabase CLI linked to project `vvoyidhqlxjcuhhsdiyy`
- All env vars synced between `.env.local` and Vercel production
- Git auto-deploys on push to `main` (verified working; do not
  `vercel --prod` from local)

**Build guide authority:** `docs/lotmonster-build-guide-v4.md` remains
the authoritative source from Part 9 onward. A Perplexity-revised guide
was being drafted (see `memory/project_build_guide_swap.md`) — if it
lands in `docs/` before next session, treat it as superseding v4 and
update this handoff block to point at the new filename.

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
  `/dashboard/settings?qbo=...` which 404s. Build settings shell in
  Part 13.
- **Recipes have no SKU / Active flag** — schema lacks the columns; the
  auto-backfilled SKUs from migration 007 partially cover this (one SKU
  per recipe). Full recipe-versioning UI still not built.
- **PO order date** uses `created_at` (no separate `order_date` column).
- **Atomicity**: production-run start/complete/cancel and PO receive do
  sequential writes via the admin client, with best-effort rollback.
  `completeRun` is now the most complex — it touches 5 tables (lots
  decrement, `production_run_lots` insert, `production_run_outputs`
  insert, finished-goods `lots` insert, `production_runs` update).
  Concurrent operations on the same lot can overdraft. Migrate to a
  Postgres rpc function when concurrency becomes real.
- **Sales-order traceability**: `lot_numbers_allocated` is a free
  TEXT[]; the new `shipSalesOrder` writes finished-lot numbers here,
  and `traceReverse` resolves them → finished lot → parent run →
  consumed raw lots. A formal `sales_order_lots` junction would
  replace this bridge long-term (phase 2 per the SKU plan).
- **`xlsx` high-severity CVE** (npm audit): prototype pollution +
  ReDoS. No fix published upstream. Only imported from the
  onboarding Excel-upload path (`src/app/api/ai/extract-ingredients`,
  `src/app/dashboard/onboarding/upload`). Before Part 14 submission,
  either swap to a maintained alternative (`xlsx-populate`,
  `exceljs`) or scope-limit the feature.
- **`production_runs.cost_per_unit` deprecated** for multi-SKU runs.
  It's `null` whenever a run has more than one output SKU — per-SKU
  unit-COGS lives on `production_run_outputs` + `lots.unit_cost` now.
  Single-SKU runs still populate it for backward compat. Any UI/report
  that displays `cost_per_unit` for completed runs needs updating.
- **`production_runs.waste_pct` always null** in the new completeRun —
  the old (expected - actual) / expected formula doesn't translate
  across mixed SKU units.
- **Ghost Habanero run from 2026-04-17 testing**: 500 bottles of
  Habanero Hot Sauce was run through the old single-yield completeRun
  before the rewrite shipped. The run is marked `completed` in the DB
  but has zero `production_run_outputs` and zero finished-goods lots —
  so raw ingredients were consumed, total_cogs is set, but nothing is
  sellable from it. To clean up: either manually flip
  `production_runs.status = 'in_progress'` and re-complete via the new
  multi-SKU dialog, or accept it as a historical artifact and move on.
  Not blocking — just expect "completed but no inventory" to surface
  in any reporting that correlates runs with finished lots.

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
- Migration 007 (applied 2026-04-17): **SKUs + finished goods (phase 1)**.
  Creates `skus` (18 cols, two CHECK constraints enforcing
  unit/parent pairing and parent→units_per_parent pairing, partial
  UNIQUE on `(org_id, upc)`), `production_run_outputs` (per-run per-SKU
  with split liquid/packaging COGS, UNIQUE `(production_run_id, sku_id)`
  idempotency guard), `sku_packaging` (BOM junction). Extends
  `ingredients` with `kind text NOT NULL DEFAULT 'raw' CHECK IN
  ('raw','packaging')`, extends `lots` to polymorphic (`sku_id` +
  `production_run_id` nullable, `ingredient_id` relaxed to nullable,
  XOR CHECK `(ingredient_id IS NOT NULL) <> (sku_id IS NOT NULL)`),
  swaps the original `lots_fefo_idx` for two partial indexes
  (`lots_fefo_ingredient_idx`, `lots_fefo_sku_idx`). Adds
  `sales_order_lines.sku_id` (nullable; tightens to NOT NULL in future
  migration 008). Inline DO-block backfill created one `kind='unit'`
  SKU per existing recipe and linked every historical SO line to its
  SKU, with row-count ASSERTs throughout.
- Migration 008 (applied 2026-04-19): **SO-line SKU cutover**. Tightens
  `sales_order_lines.sku_id` to NOT NULL and relaxes `recipe_id` to
  NULL-able. Inline DO-block backfill patched 1 orphan row whose SKU
  wasn't set (created on the old new-SO form path). ASSERTs abort the
  txn if anything remains NULL after the backfill.
- Migration 009 (applied 2026-04-19): **11 SECURITY DEFINER AI
  functions** — `get_cogs_summary`, `get_expiring_lots`,
  `get_low_stock_ingredients`, `get_ingredient_cost_history`,
  `get_production_run_detail`, `get_recipe_cost_estimate`,
  `get_sales_summary`, `get_lot_traceability`,
  `get_inventory_valuation`, `get_supplier_spend`,
  `get_finished_goods_status`. Every function takes `p_org_id uuid` as
  its first parameter; the server ALWAYS injects the authenticated
  session's orgId, never trusts a model-supplied one. All functions
  are `STABLE`, `SET search_path = public, pg_temp`, and filter by
  `org_id = p_org_id` on every query. REVOKE EXECUTE FROM PUBLIC.
- Migration 010 (applied 2026-04-19): **ai_readonly NOLOGIN role +
  execute_ai_query wrapper**. The role has USAGE on public, SELECT on
  all current + future public tables, and EXECUTE on ONLY the 11
  functions above. `public.execute_ai_query(function_name text,
  params jsonb)` is a SECURITY DEFINER wrapper that validates
  `params.org_id`, `SET LOCAL ROLE ai_readonly`, dispatches via a
  hard-coded CASE (no `EXECUTE`, no `format()`, no dynamic SQL), and
  `RESET ROLE`. Unknown function names raise `unknown_ai_function`
  before any work happens. EXECUTE is GRANTed to service_role only —
  authenticated users cannot invoke via PostgREST.

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
- List with Raw/Packaging/All segmented tab (default Raw), search +
  category filter, current stock + weighted avg cost aggregations,
  color-coded stock status badges. The "All" tab adds a colored Kind
  badge column (amber=raw, sky=packaging).
- Detail with inline edit, delete (refused on FK references), 3 tabs:
  Lots / Used In / Purchase History
- New form: kind radio (Raw / Packaging, default Raw) at top of Basics
- API: `GET/POST /api/ingredients`, `GET/PATCH/DELETE /api/ingredients/[id]`
- **Kind-change lock**: PATCH refuses to change `kind` on an ingredient
  that already has any lots — returns 409 with
  `{ error: "cannot change kind: ingredient has lots" }`. Retroactive
  flips would miscategorize historical inventory.
- Shared: `src/lib/ingredients/{schema,queries}.ts` (incl. `resolveOrgId`,
  `INGREDIENT_KINDS`, `IngredientKind`)

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

### SKUs (`/dashboard/skus`) — phase 1
- List: table with Name, Kind badge (color-coded unit/case/pallet),
  UPC, Fill, Retail Price, On-hand (aggregated from `lots.sku_id`).
  Search, kind filter, active-only toggle.
- New form: 4 cards (Basics, Packaging & shelf life, Identifiers &
  pricing, Notes). Kind pills: Unit locked-selected; Case/Pallet
  disabled with "coming in phase 2" tooltip. Recipe dropdown optional
  (skus.recipe_id is nullable for resale goods).
- Detail: 4 stacked sections — (1) Overview (inline-editable), (2)
  Packaging BOM (editor with server-side packaging-kind filter on
  ingredient dropdown; `setPackagingBOM` rejects raw ingredients with
  a clear error), (3) Finished Lots (FEFO-sorted), (4) Production
  History (joined through `production_run_outputs`).
- `src/lib/skus/` — `schema.ts` (Zod + pure `buildLotPrefix`),
  `queries.ts` (listSkus, getSkuDetail, listPackagingIngredients,
  listRecipesForSelect, getSkuDeletionBlockers), `actions.ts`
  (createSku, updateSku, deleteSku, setPackagingBOM — all
  `'use server'`, all gated on `resolveOrgId`).
- API: `GET/POST /api/skus`, `GET/PATCH/DELETE /api/skus/[id]`,
  `PUT /api/skus/[id]/packaging` (replaces the full BOM; upsert +
  delete-missing so a mid-op failure can't wipe an existing BOM).
- 21 unit tests on `buildLotPrefix` + Zod schemas in
  `src/lib/__tests__/skus.test.ts`.
- Sidebar nav: `Tag` icon between Recipes and Production Runs.

### Production Runs (`/dashboard/production-runs`)
- List with status chips, /new with live FEFO preview, detail with state
  workflow (Draft → Start → Complete → done; Cancel returns stock)
- `src/lib/production/actions.ts`:
  - `startRun` — FEFO allocate raw ingredients + decrement lots + insert
    `production_run_lots` (with rollback on mid-run failure)
  - `completeRun(orgId, runId, outputs, notes)` — **rewritten 2026-04-18**
    for multi-SKU output. Signature takes
    `outputs: Array<{ skuId, quantity, expiryDate?, liquidPctOverride?, overrideNote? }>`.
    Phases: validate run + SKUs → read liquid_total from existing
    production_run_lots → resolve each SKU's sku_packaging BOM via
    previewAllocation → call `planCompleteRun` (pure math module) →
    commit (decrement packaging lots, insert packaging production_run_lots,
    auto-generate `{PREFIX}-{YYYYMMDD}-{NNN}` lot numbers, insert
    polymorphic finished-goods lots, insert production_run_outputs) →
    update run → insert qbo_sync_log. Best-effort rollback tracks every
    write and reverses in dependency order on failure. Throws
    `InsufficientStockError` (name references SKU + component) or
    `RunStateError` on invariant failure. See
    `docs/plans/2026-04-16-skus-and-finished-goods.md` Q4/Q8/Q10.
  - `cancelRun` — returns qty to lots, restores 'available'
- `src/lib/production/complete-run-math.ts` — pure cost math module.
  `planCompleteRun(input)` + `assertCostInvariant(...)`. 10 unit tests
  in `src/lib/__tests__/production-complete-run.test.ts`.
- Auto run number: `PR-{YYYY}-{NNN}`
- API: full CRUD + `/start`, `/complete`, `/cancel`, `/preview`.
  `/complete` now takes `{ outputs[], notes }` via `productionCompleteSchema`.
- **Complete-Run dialog** (`src/app/dashboard/production-runs/[id]/_components/detail.tsx`):
  5 sections — (1) per-SKU Quantity + editable Expiry, (2) live
  7-column cost-preview table (Liquid %, Liquid $, Packaging $, Total,
  Unit COGS) recomputed via `useMemo`, (3) red shortfall alert if any
  BOM component is short (submit disabled), (4) collapsible override
  panel (all-or-none %, must sum to 100% ± 0.05), (5) Notes. Empty
  state guides the user to create a SKU if the recipe has none linked.
  Preview uses weighted-avg packaging cost; server's real FEFO
  computes authoritative numbers on submit.

### Purchase Orders (`/dashboard/purchase-orders`)
- List with status chips, /new with supplier autocomplete + "Add from
  Low Stock" button, detail with state workflow
- Dedicated /receive page: per-line qty + lot # (auto-suggested) +
  expiry + override unit cost. Each receive creates real lots and
  inserts a `qbo_sync_log` row (entity_type='bill').
- Auto PO number: `PO-{YYYY}-{NNN}`
- API: full CRUD + `/status`, `/receive`

### Sales Orders (`/dashboard/sales-orders`)
- List with status chips, /new with customer datalist autocomplete.
- **New-SO form takes a SKU picker** (active unit SKUs with a linked
  recipe) showing on-hand + retail price. Selecting a SKU auto-fills
  `unit_price` from `retail_price`. Short-stock hint in red if
  quantity > on_hand. Server API validates each `sku_id`, rejects
  case/pallet + inactive + recipe-less SKUs, and derives `recipe_id`
  from the SKU for legacy compatibility.
- Detail page with state workflow (Draft → Confirm → Ship → Delivered).
- **Ship modal** (`_components/detail.tsx`): the old free-text lot
  chip input is gone. On open, GET `/api/sales-orders/[id]/ship-preview`
  which calls `previewAllocation({ kind: 'sku', id: sku_id })` for
  every line and returns `{ line_id, sku_name, needed, available,
  shortage, ok, allocations[] }` + `all_ok`. Dialog shows a read-only
  FEFO preview per line; Confirm Shipment is disabled while any line
  is short. Submit posts only `{ shipped_at, notes }`.
- `shipSalesOrder` rewritten 2026-04-19: server-side SKU FEFO on
  finished lots. For each line: `allocateLots({ kind: 'sku', id:
  line.sku_id }, line.quantity, orgId)` → decrement each allocated
  lot (depleted flip at 0) → write allocated lot_numbers into
  `sales_order_lines.lot_numbers_allocated` (TEXT[] bridge until
  phase 2 replaces with a junction). On shortage throws
  `InsufficientStockError` naming the SKU. Best-effort rollback:
  `rollbackShip` clears lot_numbers_allocated on updated lines and
  restores decremented lot quantities. SO flips to `shipped`, then
  inserts a `qbo_sync_log` row.
- Lot Traceability section (shipped/closed): de-duped flat list of
  allocated lots with deep links.
- Auto SO number: `SO-{YYYY}-{NNN}`.
- API: full CRUD + `/status`, `/ship`, `/suggestions`, `/ship-preview`.

### Traceability (`/dashboard/traceability`)
- **Polymorphic lots** (post-2026-04-19 rewrite). `LotRef` carries
  `kind: 'raw' | 'finished'` plus `sku_id`, `sku_name`,
  `production_run_id`, `production_run_number`. Centralized
  `toLotRef(row)` helper + `LOT_SELECT` constant join-string.
- `src/lib/traceability.ts`:
  - `traceForward`: raw-lot search → raw → runs → **produced_finished_lots
    (new stage)** → SOs. Finished-lot search → finished lot → SOs
    (short chain). Shipped-in search includes finished lot numbers,
    legacy run numbers, and the raw lot number.
  - `traceReverse`: SO → lot_numbers_allocated entries resolved to
    finished lots, run numbers, or raw lots. Finished-lot matches
    walk to parent `production_run_id` and surface the raw lots that
    run consumed. Single batched query for all runs needing upstream
    consumption.
  - `traceRun`: adds `produced_finished_lots` to the result.
- UI: raw lots render in emerald/green, finished lots in sky/blue,
  with a "Raw" / "Finished goods" pill on `LotCard`. Added `sky`
  accent to the Stage color map. Forward view gains a "Produced N
  finished-goods lots" stage between Runs and Shipped. Run view gains
  the same. `RefBlock` handles finished-lot references (SKU link +
  upstream run + indented raw-lots consumed).
- API: `GET /api/traceability?lot=|run=|order=`
- "View Traceability" button on shipped SOs deep-links here.

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
    **Per-SKU item mapping (2026-04-19):** line `ItemRef.value` =
    `sku.qbo_item_id ?? org.qbo_default_item_id`, line Description =
    `sku.name ?? recipe.name`. Fail-fast: if any billable line has
    neither a SKU-level nor org-level mapping, returns 409
    `qbo_item_mapping_missing` with the offending SKU names and writes
    the same message to `qbo_sync_log.error_message` — no QBO API
    call is made.
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
- `src/app/api/ai/query/route.ts` — **AI assistant dispatcher**.
  Resolves `orgId` from session, opens a streaming Anthropic request
  with `tools: AI_TOOLS` (claude-sonnet-4-6, no thinking param,
  4096 max_tokens). Runs a tool loop up to 8 iterations: forwards
  text deltas to the client as they arrive; when the turn ends in
  `stop_reason='tool_use'`, calls `admin.rpc('execute_ai_query', {
  p_function_name, p_params })` with `params.org_id` **always
  overridden by the session orgId** (never trusts a model-supplied
  value). Tool errors return `is_error: true` tool_result blocks so
  Claude can explain/retry. Response stream is `text/plain;
  charset=utf-8` with chunked transfer. No rate limiting yet — Part 12.

### AI Assistant (`/dashboard/ai`)
- `src/lib/ai/tools.ts` — 11 Anthropic tool_use schemas matching the
  11 Postgres functions 1:1:
  `get_cogs_summary`, `get_expiring_lots`, `get_low_stock_ingredients`,
  `get_ingredient_cost_history`, `get_production_run_detail`,
  `get_recipe_cost_estimate`, `get_sales_summary`,
  `get_lot_traceability`, `get_inventory_valuation`,
  `get_supplier_spend`, `get_finished_goods_status` (new). Every
  `input_schema` has `additionalProperties: false` and **zero**
  `org_id` fields — server-injected only.
- `src/app/dashboard/ai/page.tsx` + `_components/chat.tsx` — full-height
  chat UI. User bubbles right/teal, assistant bubbles left/gray,
  markdown rendered via `react-markdown` + `remark-gfm` (tables,
  bold, lists, code, links in teal). Three-dot pulse while waiting
  for first stream byte. Red error bubble with Retry button that
  re-runs from the last user message (no duplicate user bubble).
  Empty state shows 5 suggested-question chips. Enter to send,
  Shift+Enter for newline. AbortController wired for future cancel
  support.

### Tests (123 passing, `npm run test`)
- `src/lib/__tests__/units.test.ts` — unit conversions
- `src/lib/__tests__/cogs.test.ts` — COGS math + bucketing (19 tests)
- `src/lib/__tests__/skus.test.ts` — SKU/BOM Zod schemas + `buildLotPrefix` (21)
- `src/lib/__tests__/production-complete-run.test.ts` — `planCompleteRun`
  cost math + invariant + override + shortfall (10 tests using the
  spec's Q8 fixture: liquid_total $120, 40×16oz + 20×32oz → unit_cogs
  $1.90 / $3.55)

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

- **Manual testing (NEXT — while user acquires credits):** end-to-end
  exercise of the AI Assistant on live data: ask about COGS splits,
  expiring finished lots, finished-goods status, traceability for both
  raw and finished lots, recipe cost estimates. Watch
  `vercel logs --since 30m --level error` for tool errors.
- **Part 9B (still outstanding):** QBO end-to-end verification using
  sandbox company `Sandbox Company US 74a4` (realm `9341456849762719`).
  Journal-entry, bill, and invoice round-trips. Account mappings are
  still direct-DB-insert (no UI yet — settings shell is Part 13).
- **Part 11 (requires Vercel Pro):** `/api/cron/qbo-sync` dispatcher
  on every-15-min cadence. Hobby plan is 1/day, insufficient.
  Migration 011 adds `qbo_sync_log` retry columns
  (`attempt_count`, `last_attempted_at`, `error_message`).
- **Part 12:** Stripe billing (migration 012).
- **Part 13:** Demo seeder + polish, including the `/dashboard/settings`
  shell that fixes the QBO callback 404 AND gives operators a UI for
  per-SKU QBO Item mappings (today those are direct-DB only).
- **Part 14:** Security audit + contest submission. Must do BEFORE
  submit: rotate leaked service-role key + Supabase access token,
  address the xlsx CVE (either migrate off or scope-limit).

Other existing TODOs not in the new plan (phase 2/3 backlog at the end
of the revised plan):
- Recipe edit page (`/dashboard/recipes/[id]/edit`) — PATCH API works,
  needs UI
- Real landing page
- Lot detail page (have list, no detail)
- Forecasting / replenishment recommendations
- Multi-user member management beyond signup-creates-org
- Case / pallet SKUs (`kind != 'unit'`) + `case_pack_events` + case
  pricing display toggle on invoices — phase 2 per the SKU plan.
- `sales_order_line_lots` junction to replace the free-text
  `lot_numbers_allocated` — also phase 2. Once it lands, the
  `get_sales_summary` AI function can replace its weighted-avg COGS
  proxy with authoritative per-line draw values.
- Clean up the **ghost Habanero run** from 2026-04-17 testing (see
  Known Issues).

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

## Recently resolved (2026-04-17 → 2026-04-18 session)

### Auth / deploy fixes surfaced by 9A testing
- **Logout 405** — the sign-out `<form>` POSTed to
  `/api/auth/logout`, which `NextResponse.redirect`ed with default
  status 307 (method-preserving). Browser then POSTed to `/login`
  (page route, GET-only) → 405. Fixed with `status: 303`. Shell also
  moved to a client-side `supabase.auth.signOut()` button earlier in
  the same session.
- **Stale rollback pin** — production was still aliased to the
  `g7qckfojb` deploy (the rollback target from the Windows-built bad
  bundle). `vercel promote` resolved it, and subsequent `git push`
  auto-promotions started working again.
- **Empty-org onboarding trap** — fresh signups hitting /dashboard
  before loading ingredients landed on an empty dashboard with no
  onramp. Dashboard now redirects to `/dashboard/onboarding` when the
  org has zero ingredient rows. Login drops the brittle 60-sec
  new-user heuristic (would fail if OTP email delivery took >60s)
  and routes everyone to /dashboard. Sidebar nav gained an always-
  visible "Add Ingredients" entry.
- **White-on-white `<select>` options** — dark-themed `<select>` popups
  rendered `<option>` with OS light defaults, invisible until hover.
  Global CSS rule in `globals.css` forces all `<option>` to dark
  palette (`#0D1B2A` bg, white text, teal hover/selected). Covers 20+
  `<select>` instances in one shot.

### Part 9 built in-session (code-complete, awaiting user verification)
- **Migration 007** applied to prod — SKUs, production_run_outputs,
  sku_packaging, polymorphic lots, ingredients.kind. See Database
  section above for the full schema.
- **DB types regenerated** — `src/types/database.ts` now includes all
  new tables + nullable `lots.ingredient_id`. Six call sites that
  aggregated lots keyed on `ingredient_id` got null-guards:
  `src/app/dashboard/page.tsx`, `src/components/low-stock-alerts.tsx`,
  `src/lib/cogs.ts`, `src/lib/ingredients/queries.ts`,
  `src/lib/purchase-orders/queries.ts`, `src/lib/recipes/queries.ts`.
  `LotRef.ingredient_id` widened to `string | null` in traceability;
  the deep-link to `/dashboard/ingredients/{id}` only renders when
  ingredient_id is set.
- **FEFO allocator** (`src/lib/fefo.ts`) refactored to take
  `AllocationTarget = { kind: 'ingredient' | 'sku'; id: string }`.
  Internally flips `column = target.kind === 'sku' ? 'sku_id' :
  'ingredient_id'`. Existing raw-ingredient callers unchanged.
- **SKU module + UI** — `src/lib/skus/`, `/dashboard/skus` list/new/
  detail. Kind-pills on the new form lock Unit-selected, disable Case
  and Pallet with "coming in phase 2" tooltip. Detail page has the
  packaging-BOM editor that server-side rejects raw ingredients.
- **Ingredients Raw/Packaging** — tab filter on the list (default
  Raw), radio on the new form, PATCH lock on kind-change when the
  ingredient has lots.
- **`completeRun` rewrite** — multi-SKU outputs, split liquid/packaging
  COGS, invariant check, rollback on failure. Extracted the pure math
  into `src/lib/production/complete-run-math.ts` so it's unit-testable;
  10 tests added using the spec's Q8 fixture.
- **Complete-Run dialog rebuilt** — 5-section modal with live cost
  preview, packaging shortfall warning, collapsible override panel.
  Empty state when no SKUs are linked to the recipe. Preview uses
  weighted-avg packaging cost; authoritative FEFO costs land on
  submit.

### Ghost run from testing
During the same session the user ran 500 bottles of Habanero Hot Sauce
through the OLD single-yield completeRun (before the rewrite shipped).
The run is marked `completed` but has zero finished-goods lots. See
Known Issues above for cleanup options.

## Recently resolved (2026-04-19 session — Parts 9 tail + Part 10 AI)

### Part 9 completion (SKU-picker flows + trace + QBO)
- **/dashboard/production-runs/new** got a read-only "Yields into
  these SKUs" preview panel that appears when a recipe is selected —
  lists linked unit SKUs with an estimated bottle count at the current
  batch multiplier. Fixes the "where do I attach SKUs?" discovery
  problem without moving allocation away from Complete time.
- **SKU detail** gained a Recipe selector in the Overview edit grid
  so operators can retroactively link pre-existing SKUs (the ones
  created before the new-SO form started filtering by
  `recipe_id IS NOT NULL` silently dropped from the Complete dialog
  because their `recipe_id` was null).
- **`shipSalesOrder` rewrite** — server-side SKU FEFO. Dropped the
  old `inputs: ShipLineInput[]` param; now takes `(orgId, soId,
  shippedAt, notes)` and the server does all allocation, decrementing
  finished lots and writing allocated lot_numbers to the
  `lot_numbers_allocated` TEXT[] bridge.
- **/dashboard/sales-orders/new** SKU picker (active unit SKUs with
  a recipe) replaces the recipe dropdown. Shows on-hand + retail price
  in the option label; auto-fills unit_price from retail_price; flags
  short-stock lines red before submit. API derives `recipe_id` from
  the chosen SKU for the not-yet-relaxed column (008 relaxed it later
  in the same session).
- **Ship modal** rebuilt around a new GET
  `/api/sales-orders/[id]/ship-preview` endpoint that calls
  `previewAllocation({kind:'sku', id:sku_id})` per line. Dialog
  renders need/available/shortage per line; Confirm Shipment is
  disabled while anything is short. All free-text chip UI is gone.
- **QBO invoice sync** now uses `sku.qbo_item_id ?? org.qbo_default_item_id`
  per line with `sku.name` as the description. Fail-fast returns 409
  `qbo_item_mapping_missing` with the offending SKU names if any line
  ends unmapped — no QBO API call happens.
- **Traceability rewrite** — polymorphic `LotRef` (kind/raw+finished),
  shared `toLotRef(row)` + `LOT_SELECT` constant. Forward trace for
  raw lots now walks to produced finished-goods lots. Reverse trace
  resolves finished-lot entries in `lot_numbers_allocated` and walks
  to parent run → consumed raw. Run trace gains
  `produced_finished_lots`. UI: emerald/green for raw, sky/blue for
  finished, with a pill on every LotCard; new "Produced N finished-
  goods lots" stages in forward + run views; RefBlock handles
  finished-lot references with upstream + SKU links.
- **Migration 008** (applied to prod): `sales_order_lines.sku_id SET
  NOT NULL`, `recipe_id DROP NOT NULL`. Inline DO block backfilled
  one orphan row (from the old code path) before the constraint flip.
  ASSERTs abort the txn if anything remained NULL after the backfill.

### Part 10 — AI Assistant built & shipped
- **Migration 009** — 11 SECURITY DEFINER functions (`get_cogs_summary`
  through `get_finished_goods_status`). Every function scoped by
  `p_org_id uuid` (never trusted from JWT), `STABLE`, `SET search_path
  = public, pg_temp`, `REVOKE EXECUTE FROM PUBLIC`. The new
  `get_finished_goods_status` answers "what can I sell today?" with
  on-hand + earliest expiry + weighted-avg unit cost + retail price
  per active unit SKU.
- **Migration 010** — `ai_readonly NOLOGIN` role with USAGE on public,
  SELECT on all tables, EXECUTE on exactly the 11 functions.
  `public.execute_ai_query(function_name, params)` wrapper is
  SECURITY DEFINER, validates `params.org_id`, `SET LOCAL ROLE
  ai_readonly`, dispatches via a hard-coded CASE (no `EXECUTE`, no
  `format()`, no dynamic SQL), `RESET ROLE` on every exit path.
  Unknown function name raises before any work happens. EXECUTE
  granted only to `service_role` — PostgREST does not expose the
  wrapper to the browser.
- **`src/lib/ai/tools.ts`** — 11 Anthropic tool_use schemas
  matching the DB functions 1:1. `additionalProperties: false` on
  every schema; ZERO `org_id` fields (server-injected only). Exports
  `AI_TOOLS`, `AI_TOOL_NAMES`, `AI_TOOLS_BY_NAME`.
- **`/api/ai/query` dispatcher** — streaming POST route with a
  tool-loop (up to 8 iterations). Uses `anthropic.messages.stream`
  with claude-sonnet-4-6, max_tokens=4096, no thinking param.
  Forwards text deltas straight to the client; on
  `stop_reason='tool_use'` executes each block via `admin.rpc(
  'execute_ai_query', { p_function_name, p_params })` with
  `params.org_id` ALWAYS overridden by the session orgId. Tool
  errors come back as `is_error: true` tool_result blocks so the
  model can explain/retry.
- **`/dashboard/ai` chat UI** — full-height chat. User bubbles right/
  teal, assistant bubbles left/gray, markdown via `react-markdown` +
  `remark-gfm` (tables, bold, lists, code, teal links). Three-dot
  pulse while waiting for first byte. Red error bubble with Retry
  (re-runs from last user message, no duplicate). Empty state shows
  the 5 suggested-question chips (COGS split, expiring finished
  goods, low packaging, 16oz availability, trace a finished lot).
  New deps: `react-markdown`, `remark-gfm`.

### Collateral
- DB types (`src/types/database.ts`) regenerated post-migrations
  008+009+010 — now exposes `execute_ai_query` + 11 `get_*` RPCs.
  `sales_order_lines.recipe_id` is now `string | null` in the types;
  null-guards added in `src/app/api/sales-orders/[id]/suggestions/route.ts`
  and widened `ReverseLineTrace.recipe_id` + `SORef.recipe_id` in
  `src/lib/traceability.ts`.

### Pause for credits
User paused to acquire Perplexity + Vercel credits before continuing
to Part 11 (cron dispatcher needs Vercel Pro). When resuming, start
by asking about AI assistant testing results (see handoff block above).
