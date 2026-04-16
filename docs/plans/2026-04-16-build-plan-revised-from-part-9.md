# Lotmonster Build Plan — Revised from Part 9 through Contest Submission

**Date:** 2026-04-16
**Revised 2026-04-16:** aligned QBO account mappings + migration numbering with v4 build guide (`docs/lotmonster-build-guide-v4.md`). QBO account refs live as columns on `orgs` (no `qbo_account_mappings` junction). Migration numbering tightened to v4 canonical: 007 SKUs, 008 SO.sku_id cutover, 009 AI functions, 010 AI readonly role, 011 `qbo_sync_log` retry columns, 012 Stripe schema. Phase-2 SKU-plan migrations push to 013+.
**Author:** Bob (build planner)
**Status:** Authoritative — supersedes `docs/lotmonster-build-guide-v3.md` Parts 9–15; aligned to v4 build guide

---

## What's authoritative

This document replaces everything from line 1610 of `docs/lotmonster-build-guide-v3.md`
onward (original Part 9 "AI Assistant" through Part 15 "Pre-Deploy Checklist"). When
this plan and the old guide disagree, this plan wins. Parts 0–8 of the original guide
remain the historical record for work already done; do not re-read them for new work.

## Total estimated calendar time

| Phase | Effort | Days (earliest finish) |
|---|---|---|
| 9A — Test existing functionality | 1.0–1.5 days | 2026-04-17 evening |
| 9B — Verify QBO end-to-end | 1.0 day | 2026-04-18 evening |
| 9  — SKUs + Finished Goods (phase-1 cut) | 8.5 days | 2026-04-27 |
| 10 — AI Assistant (re-specced for SKUs) | 4.5 days | 2026-05-02 |
| 11 — Cron + QBO sync dispatcher | 1.5 days | 2026-05-03 |
| 12 — Stripe billing | 3.0 days | 2026-05-06 |
| 13 — Demo seeder + polish + settings shell | 2.5 days | 2026-05-09 |
| 14 — Security + submission | 1.0 day | 2026-05-10 |
| **Total working days** | **~23 days** | **~3.5 calendar weeks from today** |

Assumes roughly full-time single-developer pace. Contest buffer: no weekend padding,
no illness slack. If the contest deadline is tighter than 2026-05-10, the cut lines
are at the end of each phase section.

## Cross-reference to the original guide

| Original guide part | New plan part | What changed |
|---|---|---|
| 9 "AI Assistant (Claude Tool Use)" | Part 10 here | Re-specced tool set to understand SKUs + finished lots; tools that query "current stock" or "traceability" now span raw and finished inventory. |
| 10 "Vercel Cron Jobs" | Part 11 here | QBO sync dispatcher is now the load-bearing cron, consuming `qbo_sync_log`. Schedule tightened to every 15 min. |
| 11 "Stripe Billing" | Part 12 here | Nearly unchanged. `orgs.stripe_customer_id` already exists (migration 001). |
| 12 "Demo Seeder + Polish" | Part 13 here | Seeder rewritten for SKUs + packaging + finished lots + realistic hot-sauce scenario. Adds settings-page shell (QBO callback currently 404s). |
| 13 "Security + Submission" | Part 14 here | RLS audit widened to migrations 007–008 tables. UPC uniqueness [RAY] check added. |
| 14 "Troubleshooting Guide" | Kept for reference in old guide | Still useful mid-build; not material to the plan. |
| 15 "Pre-Deploy Checklist" | Rolled into Part 14 here | Rewritten to include SKU/finished-goods invariants and the new migrations. |
| — (new) | Part 9A here | End-to-end hand-test of Parts 0–8 before any new code lands. |
| — (new) | Part 9B here | End-to-end QBO sandbox verification (user never actually confirmed the invoice/bill/JE flows push to sandbox). |
| — (new) | Part 15 here | Phase 2/3 backlog (case packing, barcode scanning, accrual COGS, etc.). |

---

## Part 9A — Test existing functionality (1.0–1.5 days)

### Intent

Lotmonster is ~8 completed feature areas deep with automated coverage on exactly two
pure modules (`cogs.ts`, `units.ts`). The user is about to start rewriting the core
production-run flow in Part 9 proper. **Before that happens,** walk the entire
completed surface in production with a fresh dataset, find whatever's broken (e.g.
the active `save-ingredients` bug from the CLAUDE.md), and fix it. Everything
downstream assumes this surface works.

### How to use this section

Run the steps on https://www.lotmonster.co using a fresh Supabase user (new email).
For each section:

1. Do the happy-path scenario.
2. Run the 2–3 break-point probes.
3. Check the "pass criterion" box.
4. When something throws, capture the digest from the browser and run:
   ```
   npx vercel logs --no-follow --since 1h --level error --expand
   ```
   Match the digest to the stack trace.

### What's NOT covered by automated tests (manual matters more here)

- **Everything in `src/app/dashboard/**`** — no component/integration tests exist.
- **All server actions** under `src/lib/*/actions.ts` — no direct coverage.
- **All API routes** under `src/app/api/**` — no route-level tests.
- **FEFO allocator** (`src/lib/fefo.ts`) — the consumers are tested indirectly via
  COGS math on known fixtures, but the allocator + lot decrement code itself is not
  hit by vitest.
- **QBO sync logic** (`src/lib/qbo/**`) — zero test coverage; Part 9B hand-verifies.
- **Traceability queries** (`src/lib/traceability.ts`) — not tested.
- **Zero-cost guard** (`src/components/zero-cost-warning.tsx`) — not tested.

What IS covered: `cogs.ts` math and `units.ts` conversions.

### 9A.1 — Auth (Email OTP + Google OAuth)

**Happy path:**
- Visit `/`, click Sign Up. Enter a new email + org name. Submit.
- Receive email, paste 8-digit OTP into stage 2 of the form. Land on `/dashboard`.
- Logout (user menu). Confirm redirect to `/`.
- Log back in via `/login` with the same email. Receive new OTP, submit. Land on dashboard.

**Break-point probes:**
- Submit a wrong OTP. Should show an inline error, not redirect.
- Wait >10 minutes and try the OTP. Should fail gracefully.
- Try Google OAuth (`/login` → Google button). Callback should land on dashboard.

**Pass when:** [ ] Fresh user can sign up, log out, log back in. Google OAuth lands on dashboard without a `PKCE code verifier` error.

### 9A.2 — Dashboard home

**Happy path:**
- Four stat cards render (even with zero data, they should show 0 / 0 / 0 / $0).
- Expiring Soon card is empty.
- Low Stock card is empty.
- Sidebar shows 10 nav items.

**Break-point probes:**
- With a fresh user whose `org_members` row was just created on signup, do the stat
  queries return correctly? (Regression risk: the new-user JWT has no `org_id`; the
  code must look it up from `org_members`.)
- Click every sidebar item. Each page renders (404s are failures).

**Pass when:** [ ] Dashboard renders without throws for a fresh org AND all 10 sidebar links resolve to real pages (one expected: `AI` links to a 404 — that's Part 10).

### 9A.3 — Onboarding Path A (Upload)

**Happy path:**
- `/dashboard/onboarding` → choose Upload.
- Drag a CSV or image of 5–10 ingredients onto the dropzone.
- Claude Vision parses, column mapping renders, editable table shows.
- Click Save. Land on `/dashboard/ingredients`.

**Break-point probes:**
- Upload a PDF with handwriting. Confirm Vision extracts reasonably.
- Edit a row to set `cost_per_unit = 0`. Zero-cost guard should block save or warn.
- Upload a file >10 MB (if your Vercel plan allows). Confirm a clean error.

**Pass when:** [ ] A parsed file saves 5+ ingredients AND zero-cost guard fires on a zeroed row.

### 9A.4 — Onboarding Path B (Manual)

**Happy path:**
- Fill the form: name, unit, category, low-stock threshold, bulk cost derivation
  (e.g. $18 / 5 lb → $3.60/lb live-derived).
- Save one ingredient. Add another. Save the batch.
- **This is the path that has an active bug.** CLAUDE.md says: "server-component
  render error after saving 6 ingredients on a fresh org — the redirect goes to
  `/dashboard/ingredients` and that page throws."

**Break-point probes:**
- Save exactly 6 ingredients and watch for the error. Capture the digest. Match
  against `npx vercel logs --no-follow --since 1h --level error --expand`.
- Set `quantity = 0` with `cost = 1`. Confirm zero-cost guard vs zero-quantity behavior.
- Try a weird unit string that's not in the enum (Zod should reject).

**Pass when:** [ ] The bug is reproduced, root-caused, and fixed. Six saves followed by the redirect renders the ingredient list cleanly.
**This is the work item that blocks everything else in Part 9A.**

### 9A.5 — Onboarding Path C (Chat)

**Happy path:**
- Open the chat path. Type "I sell hot sauce, here are my ingredients: habanero, vinegar, salt, garlic, 5oz bottles, labels."
- Watch the streaming response. Ingredients populate in the right-side staging panel.
- Confirm costs and units. Save.

**Break-point probes:**
- Interrupt mid-stream (close the tab). Confirm no partial save.
- Ask the AI something nonsensical ("order a pizza"). Confirm it stays in-domain.
- Add, then remove, an ingredient from the staging panel before saving.

**Pass when:** [ ] Staging panel + save flow commits 3+ ingredients and they appear on the ingredients list.

### 9A.6 — Ingredients

**Happy path:**
- `/dashboard/ingredients` shows the list with stock + weighted avg cost.
- Filter by category. Search by name.
- Open detail. Edit inline. Confirm update.
- Try to delete a referenced ingredient → refused.
- Try to delete an unreferenced ingredient → succeeds.

**Break-point probes:**
- Edit the unit (e.g. `lb` → `kg`) when lots exist. Is there a warning? Should there be?
- Toggle category filter to one with no matches. Empty state renders cleanly.
- Open the "Used In" tab on an ingredient tied to a recipe.

**Pass when:** [ ] Stock + avg cost match manual math on a test case with 2 lots at different costs.

### 9A.7 — Lots + FEFO

**Happy path:**
- `/dashboard/lots` → Create Lot. Pick an ingredient; note the auto-suggested lot #.
- Fill received, expiry, quantity, unit cost. Save.
- Confirm the lot appears in the FEFO-sorted list (expiry ASC, then received ASC).

**Break-point probes:**
- Create a lot with `unit_cost = 0`. Should be blocked.
- Create a lot with expiry 5 days out → row should be red-tinted.
- Create a lot with expiry 25 days out → yellow-tinted.
- Filter by ingredient / status / expiring-soon.

**Pass when:** [ ] A 3-lot fixture renders in expected FEFO order AND the red/yellow row tints match the 7d/30d thresholds.

### 9A.8 — Recipes

**Happy path:**
- `/dashboard/recipes/new` → name, target yield, add 4–5 ingredient lines.
- Live cost preview updates as you add lines.
- Drag a line to reorder.
- Save.
- Open detail. Switch to "Production History" tab.

**Break-point probes:**
- Try to add the same ingredient twice. What does the UI do?
- Set a line to quantity `0`. Does it block or allow?
- Save a recipe with zero lines. Expect a blocking error.

**Pass when:** [ ] Recipe saves AND the cost preview matches `sum(qty * avg_lot_cost)` hand-calculated.

### 9A.9 — Production Runs

**Happy path:**
- `/dashboard/production-runs/new` → pick a recipe. FEFO preview renders.
- Start Run → lots get decremented. Status → In Progress.
- Complete Run → enter actual yield. `total_cogs` + waste% computed.
- Confirm a new row lands in `qbo_sync_log` with `entity_type='journal_entry'` (query Supabase).

**Break-point probes:**
- Try to start a run when FEFO can't satisfy the full bill (not enough stock).
  Should block with a clear shortage error.
- Start a run, then Cancel. Confirm lots are returned (quantity_remaining restored,
  status 'available').
- Complete a run with `actual_yield = 0`. Waste% should be 100%, not crash.
- **Concurrency probe (if brave):** open two tabs, both on /new for the same recipe
  that just barely has enough stock. Click Start in both fast. The CLAUDE.md warns
  about overdraft here. Note behavior for [RAY].

**Pass when:** [ ] Full Draft → Start → Complete flow runs cleanly AND cancel correctly returns stock AND `qbo_sync_log` row is written on complete.

### 9A.10 — Purchase Orders

**Happy path:**
- `/dashboard/purchase-orders/new` → type a supplier (autocomplete), add lines, save.
- Approve → Send. Status moves through the chain.
- Receive → /receive page. Enter per-line qty + lot # (auto-suggested) + expiry.
  Optionally override unit cost.
- Confirm new lots appear in `/dashboard/lots` AND a `qbo_sync_log` row appears
  with `entity_type='bill'`.

**Break-point probes:**
- Receive partial quantity (less than ordered). Status → partial.
- Receive 0 on a line. Should block or silently skip?
- Add line with `unit_cost = 0`. Should be blocked.

**Pass when:** [ ] Receive creates lots with correct cost + expiry AND the bill sync row is written.

### 9A.11 — Sales Orders

**Happy path:**
- `/dashboard/sales-orders/new` → customer (datalist), add lines (currently
  recipe-based — this changes in Part 9).
- Confirm → Ship modal. Enter per-line lot chips. Use the auto-suggest to pick a
  recent production run.
- Ship. Status → shipped. Confirm `qbo_sync_log` row with `entity_type='invoice'`.
- Mark Delivered.
- View Traceability button → deep-links to `/dashboard/traceability`.

**Break-point probes:**
- Ship without filling lot chips. Should block (traceability won't work).
- Ship with a lot # that doesn't exist in your inventory. **Today, this is a
  free-text field with no FK validation.** The SO will happily accept a garbage
  string. Note this for [RAY] and for Part 9's ship-flow rewrite.
- Ship a line for qty > what's been produced. Currently the system won't catch it.

**Pass when:** [ ] Ship flow completes AND the traceability deep-link shows the lot chain AND an invoice sync row is written. **Log the free-text lot-numbers vulnerability as known — Part 9 fixes it.**

### 9A.12 — Traceability

**Happy path:**
- `/dashboard/traceability` → search by a lot number. Confirm the forward-trace
  flow renders: lot → production runs → sales orders.
- Search by a run number (PR-2025-001 style). Middle-out trace renders.
- Search by an order number (SO-2025-001 style). Reverse trace renders.

**Break-point probes:**
- Search for a lot that's never been used. Should render empty state, not error.
- Search for a partial string. Does it match-as-you-type or only on exact match?
- Search for a lot from another org (you'll need a second org to test). Should return empty.

**Pass when:** [ ] All 3 search modes render correctly AND cross-org isolation holds.

### 9A.13 — COGS dashboard stat

**Happy path:**
- After completing a run, confirm the dashboard's "This Month's COGS" card updates.
- Run the month's aggregate query by hand against Supabase. Match.

**Break-point probes:**
- Complete a run spanning month boundaries (unlikely in manual testing, skip).
- Null-check: an org with zero completed runs shows $0.00, not NaN or an error.

**Pass when:** [ ] Dashboard COGS card matches the manual SUM across completed runs this calendar month.

### Pass criterion for the whole Part 9A

All 13 section checkboxes ticked. The active `save-ingredients` bug is root-caused
and fixed. The known gaps (free-text lot-numbers on SO ship; concurrent-start
overdraft) are documented for later phases.

**Estimated effort:** 1.0 day to walk the surface + 0.5 day of contingency for the
save-ingredients bug and whatever else shakes out.

**[CLAUDE CODE]** fixes any bugs found. **[PERPLEXITY]** drives the hand-testing
UI walk (it's exactly the kind of structured repeated-probe task Perplexity's
Computer is good at).

---

## Part 9B — Verify QBO integration end-to-end (1 day)

### Intent

QBO OAuth + 3 sync routes are code-complete but **never confirmed to work end-to-end
against the sandbox**. CLAUDE.md admits: "Sync cron worker not built — `qbo_sync_log`
rows are written by ship/receive/complete actions but no automated dispatcher consumes
them yet." Before building the dispatcher in Part 11, prove the routes themselves
are correct by hand-triggering each one and confirming the doc lands in QBO.

### Sandbox facts (from `docs/oauth for qbo secrets.txt`)

- Sandbox Company US 74a4
- Realm ID: `9341456849762719`
- Env vars already set in Vercel + `.env.local`:
  `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT=sandbox`,
  `QBO_TOKEN_ENCRYPTION_KEY`

### 9B.1 — OAuth connect flow

**Happy path:**
- Log in, visit `/api/qbo/connect?orgId={your_org_id}`. Note the CSRF state cookie.
- Browser redirects to Intuit, pick Sandbox Company US 74a4, consent.
- Callback fires to `/api/qbo/callback`. Validates state. Encrypts + stores refresh
  token. Redirects to `/dashboard/settings?qbo=connected`.
- **`/dashboard/settings` does not exist yet — you WILL hit a 404.** Manually verify
  success by querying Supabase:
  ```sql
  SELECT qbo_realm_id, qbo_environment, qbo_connected_at, qbo_refresh_token_encrypted IS NOT NULL AS token_present
  FROM orgs
  WHERE id = 'YOUR_ORG_ID';
  ```
- Expected: `qbo_realm_id = '9341456849762719'`, `qbo_environment = 'sandbox'`,
  `qbo_connected_at` = now, `token_present = true`.

**Break-point probes:**
- Tamper with the state cookie (edit it in DevTools) → callback should 401.
- Try the flow with a different `orgId` than the session → callback should 401.
- Complete the flow, then immediately retry. Should rotate the refresh token cleanly.

**Pass when:** [ ] Row exists in `orgs` with realm + encrypted token.

### 9B.2 — Account mapping seed (direct DB, no UI yet)

Part 13 adds the settings-page UI. For now, seed the mappings manually. You need
four QBO Account IDs from the Sandbox company's Chart of Accounts:

- **COGS** account (any expense account you want to debit on production completion)
- **Inventory** account (any asset account you want to credit on production completion)
- **AR** (Accounts Receivable)
- **AP** (Accounts Payable)
- **Default Item** ID (a generic Inventory Part item for invoice lines that have no
  SKU-level override)
- **Income** account (for invoice lines)

**How to find the IDs:**
- Log into sandbox UI → Accounting → Chart of Accounts. The IDs aren't surfaced in
  the UI — query the QBO API directly:
  ```bash
  curl -H "Authorization: Bearer $ACCESS" \
    "https://sandbox-quickbooks.api.intuit.com/v3/company/9341456849762719/query?query=SELECT%20*%20FROM%20Account&minorversion=75"
  ```
- Simpler: run a one-off Node script that reuses `src/lib/qbo/client.ts` to issue
  the same query, print the top 30 accounts, and pick IDs by hand.
  **[CLAUDE CODE]** can scaffold this script in 10 min.

**Seed via SQL.** QBO account refs live as columns on `orgs` (migrations 004
+ 005) — there is no `qbo_account_mappings` junction table. Update the row
in place:

```sql
UPDATE orgs
SET qbo_cogs_account_id      = '<id>',
    qbo_inventory_account_id = '<id>',
    qbo_ar_account_id        = '<id>',
    qbo_ap_account_id        = '<id>',
    qbo_income_account_id    = '<id>',
    qbo_default_item_id      = '<item_id>'
WHERE id = '$ORG_ID';
```
(Confirm the exact column names in migrations 004 + 005 before pasting.)

**Pass when:** [ ] All six `qbo_*` columns on the test org row in `orgs` are
populated with valid QBO IDs from the connected sandbox realm.

### 9B.3 — Manual trigger of each sync route

The routes are cron-authenticated; you can hit them two ways:
- **With CRON_SECRET** (cleanest): `Authorization: Bearer $CRON_SECRET`
- **With session cookie** (if the route supports user auth mode — check each route's
  guard). **[CLAUDE CODE]** to confirm which mode each route accepts before testing.

#### 9B.3.a — Journal Entry (completed production run)

**Precondition:** Complete a production run in Part 9A.9. Copy its `id`.

**Trigger:**
```bash
curl -X POST "https://www.lotmonster.co/api/qbo/sync/journal-entry" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"productionRunId":"<uuid>"}'
```

**Verify:**
1. Response is 200 with `{ qbo_journal_entry_id: '...' }`.
2. DB: `SELECT qbo_journal_entry_id FROM production_runs WHERE id='<uuid>';` is set.
3. Sandbox QBO UI: Accounting → Chart of Accounts → click the COGS account → latest
   entry should be a JE with the debit amount = `total_cogs`, memo referencing the
   run number.
4. DB: `qbo_sync_log` row for this entity has `status='synced'` and `synced_at` set.

#### 9B.3.b — Invoice (shipped sales order)

**Precondition:** Ship an SO from Part 9A.11. Copy its `id`.

**Trigger:**
```bash
curl -X POST "https://www.lotmonster.co/api/qbo/sync/invoice" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"salesOrderId":"<uuid>"}'
```

**Verify:**
1. Response 200 with `qbo_invoice_id`.
2. DB: `sales_orders.qbo_invoice_id` set AND `status` promoted to `invoiced`.
3. Sandbox UI: Sales → Invoices → latest invoice exists with the right customer
   (find-or-created) and lines with correct qty + price.
4. `qbo_sync_log` row marked synced.

#### 9B.3.c — Bill (received purchase order)

**Precondition:** Receive a PO from Part 9A.10. Copy its `id`.

**Trigger:**
```bash
curl -X POST "https://www.lotmonster.co/api/qbo/sync/bill" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"purchaseOrderId":"<uuid>"}'
```

**Verify:**
1. Response 200 with `qbo_bill_id`.
2. DB: `purchase_orders.qbo_bill_id` set.
3. Sandbox UI: Expenses → Bills → latest bill exists with vendor (find-or-created)
   and expense lines.
4. `qbo_sync_log` row marked synced.

#### Break-point probes across all 3 routes:

- Hit each route **twice** for the same entity. Idempotency: second call should be
  a no-op (the stored doc ID guards against duplicates).
- Revoke the refresh token in the QBO sandbox connection settings, then hit any
  route. Expected: typed `QBOTokenExpiredError` → the org's connection is auto-
  disconnected, row marked 'failed' with a clear error.
- Hit without the Bearer → 401.

### 9B.4 — Disconnect flow

**Trigger:** `POST /api/qbo/disconnect` (with session cookie).

**Verify:**
```sql
SELECT qbo_realm_id, qbo_refresh_token_encrypted, qbo_connected_at
FROM orgs WHERE id='YOUR_ORG_ID';
```
All three should be NULL.

**Pass when:** [ ] Disconnect nulls the columns. A subsequent sync call fails with
`QBONotConnectedError`.

### 9B.5 — Known gap (carry to Part 11)

- No cron dispatcher exists. `qbo_sync_log` rows with `status='pending'` written by
  ship/receive/complete actions just sit there. The dispatcher in Part 11 fixes this.
- **Do NOT build it yet.** Part 9B's whole purpose is to prove the sync routes work
  in isolation so the dispatcher is just plumbing.

### Pass criterion for Part 9B

All three sync routes successfully posted to sandbox, all three DB doc-ID columns
populated, disconnect works, idempotency verified.

**Estimated effort:** 1 day.
**[PERPLEXITY]** drives the sandbox UI verifications. **[CLAUDE CODE]** writes the
one-off account-ID discovery script and fixes any sync bugs found.

---

## Part 9 — SKUs + Finished Goods Inventory (~8.5 days)

### Intent

Lotmonster today conflates "what you make" (a recipe) with "what you sell" (a SKU).
This breaks the moment a batch fills into two bottle sizes, and it leaves packaging
(bottles/caps/labels) invisible to unit-COGS. Part 9 introduces `skus`, polymorphic
finished-goods `lots`, a `sku_packaging` BOM, and a multi-SKU production-run
completion flow.

### Authoritative spec

**Full design + schema + phasing lives in:** `docs/plans/2026-04-16-skus-and-finished-goods.md`

Do not duplicate that spec here. When building Part 9, work from that plan.

### Milestones for tracking in this doc

| # | Milestone | Effort (days) | Done when |
|---|---|---|---|
| 9.1 | Migration 007 applied in staging (new tables: `skus`, `production_run_outputs`, `sku_packaging`; `lots` polymorphic; `ingredients.kind`; `sales_order_lines.sku_id`; backfill DO block) | 0.75 | Row-count asserts pass; existing data readable; a SKU row exists for every pre-existing recipe |
| 9.2 | `src/lib/skus/{schema,queries,actions}.ts` + BOM CRUD | 1.25 | Server actions unit-tested for create/update/delete on SKU + BOM |
| 9.3 | FEFO allocator generalized to `{ kind, id }` + call-site audit | 0.5 | grep shows zero callers using the old signature; existing raw-ingredient allocation still works |
| 9.4 | `completeRun` rewrite: multi-SKU outputs + packaging consumption + operator-editable expiry + liquid/packaging cost split + invariant check | 1.5 | Test fixture: 10-gal batch filled as 40×16oz + 20×32oz produces two finished lots with correct unit-COGS (~$1.90 and ~$3.55 per the spec) |
| 9.5 | `shipSalesOrder` rewrite: real FEFO allocation against `line.sku_id` | 0.5 | Ship without free-text lot chips; system draws from finished lots and decrements them |
| 9.6 | `/dashboard/skus` list + create + detail + BOM editor UI | 1.25 | Can create a SKU + attach 3 packaging components from the UI |
| 9.7 | `/dashboard/ingredients` kind filter tab + kind radio on /new | 0.25 | Packaging and raw ingredients visually separated; can create packaging ingredients |
| 9.8 | Production-run complete UI: SKU-yield inputs + expiry date override + live cost-split preview + packaging shortfall warning | 1.0 | Multi-SKU run completes through UI; shortfall warning blocks commit when a bottle is short |
| 9.9 | SO /new + /ship UI update: product picker → SKU; ship modal uses allocator | 0.5 | SO shipped without manual lot chips |
| 9.10 | QBO invoice sync: `sku.qbo_item_id ?? org.qbo_default_item_id` fallback | 0.25 | Invoice sync posts to sandbox with correct Item ID when SKU has one, falls back when it doesn't |
| 9.11 | End-to-end smoke: recipe + 2 SKUs + 4 packaging ingredients with BOMs + multi-size run + ship + QBO invoice | 0.75 | "Definition of done" from the SKU plan passes end-to-end |
| **Total** | | **8.5** | |

### Cut lines (if time runs short)

From the SKU plan's "if a late scope-cut IS needed" list, in priority order:
1. Flat BOM form instead of per-row add/remove (~0.25 back)
2. Post-save cost-split preview instead of live (~0.25 back)
3. Defer kind filter tab on /ingredients (~0.25 back)
4. Defer expiry override at completion (~0.25 back)

Do NOT cut packaging entirely — shipping a contest demo where "bottle COGS $1.50"
looks inexplicable is worse than shipping 0.25 day late.

### Cross-team tags (carried from the SKU plan)

- [DANNY] Migration 007 is wide; run in a transaction with row-count asserts. See SKU plan handoff.
- [DANNY] `completeRun` now writes to 5 tables atomically; RPC upgrade is more urgent.
- [RAY] UPC uniqueness per-org (partial unique WHERE upc IS NOT NULL) — confirm semantics.
- [RAY] XOR CHECK on `lots` (ingredient_id vs sku_id) at every write site.
- [RAY] `ingredients.kind` cannot be flipped after first lot exists — server-side lock.
- [RAY] COGS invariant: `sum(production_run_outputs.allocated_cogs_total) == run.total_cogs == sum(production_run_lots.line_cost)` within ±$0.01.
- [RAY] `shipSalesOrder` joins the overdraft-under-concurrency list.

**Pass criterion for Part 9:** the SKU plan's "Definition of done" (that section's
last paragraph) holds end-to-end in production.

---

## Part 10 — AI Assistant (rewritten for SKUs + finished goods, 4.5 days)

### Intent

The original guide's Part 9 specced 10 Claude tool_use functions against a
pre-SKU schema. Finished goods, packaging ingredients, and per-SKU COGS all change
what each tool should read. This part re-specs the tool set post-Part-9 and builds it.

### 10.1 — Tool audit: which tools change, which stay

| # | Tool | Change needed (post-Part-9) | Impact |
|---|---|---|---|
| 1 | `get_cogs_summary` | Should break down COGS by **liquid + packaging** per run (not just "by recipe"). `production_runs.total_cogs` already sums both buckets, so the **top-line stays the same** — the breakdown jsonb gains a `{liquid_cogs, packaging_cogs}` split. | Small |
| 2 | `get_expiring_lots` | Must span **both raw lots AND finished-goods lots** (`lots.sku_id IS NOT NULL`). JOIN changes: `LEFT JOIN ingredients` + `LEFT JOIN skus`; name + unit resolve from whichever side is non-null. | Medium |
| 3 | `get_low_stock_ingredients` | Now also surfaces **packaging ingredients** (`kind='packaging'`) that are below threshold. Add `kind` to the output so the AI can render "bottles low" differently from "peppers low". | Small |
| 4 | `get_ingredient_cost_history` | Unchanged. Still ingredient-scoped. If the user asks about SKU cost over time, tool 5 or a new tool is the answer. | None |
| 5 | `get_production_run_detail` | Must surface `production_run_outputs` rows: per-SKU yield, per-SKU unit-COGS, per-SKU liquid + packaging split. Also surface which packaging lots were consumed (they flow through `production_run_lots` now). | **Large** |
| 6 | `get_recipe_cost_estimate` | Still estimates from avg lot cost, but for each SKU the recipe yields it should factor the SKU's `sku_packaging` BOM into the estimate. **Ambiguity:** a recipe yields N SKUs; what does "the estimate" mean? Recommendation: return estimate **per SKU**, not per recipe. Update signature: takes `recipe_id`, returns `{liquid_estimate, by_sku: [{sku_id, name, packaging_estimate, unit_cogs_estimate}]}`. | **Large** |
| 7 | `get_sales_summary` | Minor. Revenue is still from SO shipments. Line description shifts from recipe name to SKU name in the "top products" breakdown. | Small |
| 8 | `get_lot_traceability` | **This one gets interesting.** Forward trace now flows: raw lot → production run → production_run_outputs → finished lot → sales_order_line (via `sku_id` + future `sales_order_line_lots` junction if phase-2; for phase-1 with free-text `lot_numbers_allocated` this is messy). Reverse trace same chain backward. Must handle a **finished-lot input** as well as a raw-lot input. | **Large** |
| 9 | `get_inventory_valuation` | Sum must span raw **and** finished lots. Two breakdowns: `by_ingredient` (raw + packaging) and `by_sku` (finished). Top-line valuation = raw $ + finished $. | Medium |
| 10 | `get_supplier_spend` | Unchanged. Still from PO bills. | None |

### 10.2 — Recommended 11th tool

**Add `get_finished_goods_status`.**

The contest demo answer to "how many cases of jalapeño do I have ready to ship"
should be one tool call, not a chain of tools. Proposed signature:

```
get_finished_goods_status(p_org_id uuid, p_sku_id uuid OPTIONAL) →
  table of (sku_id, sku_name, total_on_hand, earliest_expiry, lot_count, retail_price, on_hand_value)
```

- If `p_sku_id` is null, return all finished SKUs with positive stock.
- If set, return just that row (plus the lots backing it, as a sub-array).
- Drives both "what's in stock" and "when will the oldest lot expire".

This is the tool that makes demo questions like "what can I sell today?" work with
a single call.

### 10.3 — Named Postgres functions (migration 009)

Store the SQL at `supabase/migrations/009_ai_functions.sql`. All functions:
- `SECURITY DEFINER`
- Scoped to `p_org_id`; server-side route injects `org_id` from the authenticated
  JWT / session and **ignores whatever Claude passes** (security note from the
  original guide still applies).
- Return `jsonb` when the shape is a tree (e.g. breakdowns, traceability chains);
  return `TABLE (...)` when the shape is a list.

Carry the original guide's Part 9.3 "SELECT-only role" concept forward:
- Migration 010: `ai_readonly` NOLOGIN role with SELECT
  on all public tables + EXECUTE on only the 11 whitelisted AI functions.
- Wrapper: `execute_ai_query(function_name text, params jsonb)` sets role, validates
  against the whitelist, returns the result. This is defense-in-depth — if a future
  bug in the route layer ever forwards Claude's raw SQL-ish output, the role boundary
  catches it.

### 10.4 — Route: `/api/ai/query`

Two-turn tool_use pattern with `claude-sonnet-4-6`. Keep the original guide's
implementation skeleton; three deltas:

1. **System prompt.** Update to know SKUs exist. Rough text: "Lotmonster tracks both
   raw ingredient inventory (lots of peppers, vinegar, bottles, caps, labels) AND
   finished-goods inventory (lots of sellable SKUs like '16oz Jalapeño Hot Sauce').
   A production run consumes raw + packaging lots and produces one or more finished
   lots. Use the appropriate tool for each."
2. **Org-ID injection.** Override `input.org_id` from the authenticated session
   before every RPC. Never trust Claude.
3. **No `thinking` parameter.** Tool-use + extended thinking are incompatible in
   claude-sonnet-4-6. The original guide's warning still applies — do not enable it.

### 10.5 — Chat UI: `/dashboard/ai`

Route exists as a sidebar link today; the page 404s. Build it.
- Full-height chat in the dashboard shell.
- User bubbles right / teal; assistant bubbles left / gray.
- Markdown renderer for assistant responses (tables, bold, lists).
- Loading state: three-dot pulse in an assistant bubble.
- Error state: red bubble with "Retry".
- 5 suggested-question chips when empty. Tune them for the new schema:
  - "What's my COGS this month, split by liquid and packaging?"
  - "What finished goods expire in the next 30 days?"
  - "Which packaging components are low on stock?"
  - "How many 16oz cases of Jalapeño can I sell today?"
  - "Trace finished lot JAL16-20260412-001"

### 10.6 — Milestones

| # | Milestone | Effort (days) |
|---|---|---|
| 10.1 | Migration 009: 11 SECURITY-DEFINER functions | 1.25 |
| 10.2 | Migration 010: `ai_readonly` role + `execute_ai_query` wrapper | 0.5 |
| 10.3 | `/api/ai/query` route with two-turn tool_use | 1.0 |
| 10.4 | `/dashboard/ai` chat UI | 1.0 |
| 10.5 | End-to-end test of the 5 suggested questions against real data | 0.75 |
| **Total** | | **4.5** |

### Cross-team tags

- [DANNY] Migration 009+010 run in order; 010 depends on 009. Role creation needs
  `CREATEROLE` — confirm Supabase Postgres grants it to the migration runner.
- [RAY] Confirm `execute_ai_query` cannot be called directly by an authenticated
  user — only from the route. If the grant is wrong, a client could bypass the
  route's org-id injection.
- [RAY] `get_lot_traceability` spans free-text `lot_numbers_allocated TEXT[]` on
  SO lines in phase 1 — fuzzy match surface. Exact-string match only; no LIKE.
- [RAY] Confirm the 11-function whitelist in `execute_ai_query` is hard-coded
  (no dynamic SQL building from the function_name param).

**Pass criterion for Part 10:** the 5 suggested-question chips all return accurate
answers against the demo seed data with response time < 5s each.

**[PERPLEXITY]** designs the 11 JSON tool schemas + updated system prompt.
**[CLAUDE CODE]** writes the migrations, the route, the UI.

---

## Part 11 — Cron Jobs + QBO Sync Dispatcher (1.5 days)

### Intent

The QBO sync routes are code-complete and (post-Part-9B) confirmed to work. But
nothing consumes `qbo_sync_log` rows with `status='pending'`, so every ship / receive
/ complete currently requires a manual curl to sync. The dispatcher fixes this.

### 11.1 — Dispatcher route: `/api/cron/qbo-sync`

- `GET` handler (Vercel Cron only supports GET).
- `export const dynamic = 'force-dynamic'`.
- Bearer auth: `Authorization: Bearer ${CRON_SECRET}` — already pattern-matched by
  `src/proxy.ts`'s cron block (`cronPattern = /^\/api\/cron(\/.*)?$/`). No proxy
  changes needed.

### 11.2 — Dispatcher logic

```
1. Query qbo_sync_log WHERE status IN ('pending','failed')
   AND attempt_count < 5
   ORDER BY created_at ASC
   LIMIT 25.
2. For each row:
   - Load the entity (production_run / sales_order / purchase_order)
   - If the org has no QBO connection, mark row 'failed' with reason
     "not connected", skip.
   - POST to the appropriate /api/qbo/sync/{journal-entry,invoice,bill} with
     the same CRON_SECRET bearer (internal call).
   - On 200: mark 'synced', store returned doc ID (routes already persist it
     on the entity row, so dispatcher just needs to confirm).
   - On error: increment attempt_count, store error_message, stamp
     last_attempted_at, status = 'failed'. No time-based backoff —
     dispatcher re-picks 'failed' rows on the next tick until
     attempt_count reaches MAX_ATTEMPTS (5).
3. Log summary: { attempted, succeeded, failed, skipped }.
```

### 11.3 — Schema addition — migration 011

[DANNY] `qbo_sync_log` likely doesn't yet have `attempt_count`,
`last_attempted_at`, `error_message`. **Check migration 001 before writing
011.** If the columns exist, skip the migration; if not, add:

```sql
ALTER TABLE qbo_sync_log
  ADD COLUMN IF NOT EXISTS attempt_count     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message     text;
```

(V4 canonical column names. Simple retry-up-to-5 design — no exponential
backoff in MVP; the dispatcher just filters `attempt_count < 5`.)

### 11.4 — Vercel cron schedule

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/qbo-sync", "schedule": "*/15 * * * *" }
  ]
}
```

Every 15 min. On Vercel Hobby, that's below the 1 invocation/day limit — **will need
Pro plan** for this cadence. If contest budget is an issue, fall back to hourly
(`0 * * * *`) on Hobby, which keeps the demo feeling live without Pro.

[DANNY] Flag the plan decision. Hobby = 1/day (useless for demo); Pro = every 15 min
is fine.

### 11.5 — Backoff

Hard cap at `attempt_count=5` — don't retry further. User must intervene via a
future "retry sync" button on the settings page.

### 11.6 — Other cron candidates (defer)

- Low-stock email alerts → defer to post-contest.
- Expiring-lot email alerts → defer to post-contest.
- Stale QBO-token renewal (proactive refresh) → the sync routes refresh lazily on
  401 today; good enough for contest.

### 11.7 — Milestones

| # | Milestone | Effort (days) |
|---|---|---|
| 11.1 | Migration 011 (if needed) | 0.25 |
| 11.2 | `/api/cron/qbo-sync` route | 0.75 |
| 11.3 | `vercel.json` crons block + Pro-plan decision | 0.1 |
| 11.4 | End-to-end test: ship SO → wait 15 min → confirm invoice in sandbox | 0.4 |
| **Total** | | **~1.5** |

### Cross-team tags

- [DANNY] Confirm Vercel plan tier; schedule falls back to hourly on Hobby.
- [RAY] Dispatcher internal calls use `CRON_SECRET` as bearer — confirm the secret
  is never logged and never exposed to the browser.
- [RAY] Failed-row retries could amplify a QBO API outage; confirm the dispatcher
  respects `attempt_count < 5` strictly and never sets `attempt_count = 0` except
  on initial insert.

**Pass criterion:** ship a new SO, wait 15 min, find the invoice in QBO sandbox
without any manual intervention.

**[CLAUDE CODE]** writes the route + migration. **[PERPLEXITY]** configures Vercel
crons dashboard-side + verifies the first automated run.

---

## Part 12 — Stripe Billing (3 days)

### Intent

The original guide's Part 11 is **nearly correct as-is**. Major delta: `orgs.stripe_customer_id`
already exists (migration 001), so the schema work is minimal. Reference the original guide
rather than rewriting.

### 12.1 — Reference the original guide

Use these sections from `docs/lotmonster-build-guide-v3.md` as the base:
- **Step 11.1** — Stripe products setup (Starter / Growth / Scale; 14-day trial)
- **Step 11.2** — `/api/stripe/checkout` route
- **Step 11.3** — `/api/stripe/webhook` route (raw body via `request.text()`,
  `constructEvent`)
- **Step 11.4** — Plan-based feature gating (`src/lib/plans.ts`)
- **Step 11.5** — Customer portal + billing settings page

### 12.2 — Deltas from the original plan

1. **Schema.** `orgs.stripe_customer_id` exists. **Confirm these columns also exist
   (if not, migration 012 adds them — v4 canonical Stripe-schema slot):**
   - `stripe_subscription_id text`
   - `plan text` (values: 'starter' | 'growth' | 'scale' | 'canceled')
   - `subscription_status text` ('trialing' | 'active' | 'past_due' | 'canceled')
   - `trial_ends_at timestamptz`
   [DANNY] verify migration 001 and flag what's missing.

2. **Settings page integration.** The original guide had `/dashboard/settings/billing`
   as its own page. Merge it into the settings shell that Part 13 builds — billing
   becomes a tab alongside QBO and Account Mapping.

3. **Proxy.ts exclusion.** `/api/stripe/webhook` must be in the public-routes list
   in `src/proxy.ts` (Stripe posts there without a session cookie). Verify the
   current allow-list.

4. **Plan gating surface.**
   - AI query count/day: needs a counter. Simplest: a `ai_usage` table with
     `(org_id, date)` PK and `count int`. Next available migration slot
     (013+) if needed — post-Stripe, beyond v4's explicit 007–012 canonical
     list. Note the phase-2 SKU-plan migrations also land in the 013+ range;
     exact numbering is first-come, first-served at build time.
   - Ingredient/Lot/Recipe counts: real-time SELECT COUNT(*) in the create handler
     — no new table.
   - QBO sync: gate the sync routes + dispatcher on `orgs.plan != 'starter'`.

### 12.3 — Milestones

| # | Milestone | Effort (days) |
|---|---|---|
| 12.1 | Stripe products + prices (via Perplexity-guided dashboard setup) | 0.25 |
| 12.2 | Schema catch-up (migration 012 if needed) + plan gating lib | 0.5 |
| 12.3 | `/api/stripe/checkout` route | 0.25 |
| 12.4 | `/api/stripe/webhook` route | 0.5 |
| 12.5 | `/api/stripe/portal` route | 0.25 |
| 12.6 | Pricing page (`/pricing`) + billing tab on settings | 0.75 |
| 12.7 | End-to-end test: signup → checkout → webhook → plan active → portal | 0.5 |
| **Total** | | **~3.0** |

### Cross-team tags

- [DANNY] Stripe env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 3 price
  IDs) all need to land in Vercel AND `.env.local`.
- [RAY] Raw-body verification on the webhook is non-negotiable — audit that the
  handler uses `request.text()` not `request.json()`.
- [RAY] Plan-gating on server actions, not just UI. A maliciously crafted request
  should not bypass the ingredient/lot/recipe limit even if the Upgrade button is
  hidden in the UI.
- [RAY] Stripe customer portal must require session auth on `/api/stripe/portal`
  and must only generate portal sessions for the user's own org's `stripe_customer_id`.

**Pass criterion:** new signup → Stripe Checkout → webhook fires → `orgs.plan` set
to 'growth' → `/pricing` shows "Current Plan" badge → Customer Portal opens and
allows plan change.

**[PERPLEXITY]** guides the Stripe dashboard setup. **[CLAUDE CODE]** writes routes,
schema, UI.

---

## Part 13 — Demo Seeder + Polish + Settings Shell (2.5 days)

### Intent

Three things bundled because they all serve "make the contest submission look
professional":
1. A realistic demo dataset (rewritten for SKUs + packaging).
2. UI polish across the app (loading states, empty states, toasts).
3. A settings-page shell that unblocks the QBO callback 404 AND hosts the plan-
   gating UI AND the QBO account-mapping form.

### 13.1 — Demo Seeder

Replace the original guide's Part 12.1 seeder. New scenario: **"Lone Star Heat"**
(keep the name; it's good).

**Ingredients — raw (8):**
- Jalapeño Peppers, lb, $3.20/lb
- Habanero Peppers, lb, $4.50/lb
- Ghost Peppers, lb, $8.75/lb
- Apple Cider Vinegar, gal, $9.00/gal
- Garlic Cloves, lb, $5.50/lb
- Sea Salt, lb, $1.20/lb
- Lime Juice, gal, $12.00/gal
- Mango Puree, lb, $3.80/lb

**Ingredients — packaging (6):**
- 16oz Hot Sauce Bottle, each, $0.32
- 5oz Hot Sauce Bottle, each, $0.22
- Cap (standard), each, $0.05
- Front Label, each, $0.08
- Back Label (nutrition), each, $0.04
- Shipping Carton (12-ct), each, $0.95

**Recipes (3):**
- "Jalapeño Classic" — target 640 fl oz (10 gal)
- "Habanero Blaze" — target 640 fl oz
- "Ghost Pepper Reaper" — target 320 fl oz (5 gal)

**SKUs (5 — phase-1 unit kind only):**
- Jalapeño Classic 16oz (UPC, shelf_life_days=365, retail $9.99, lot_prefix JAL16)
- Jalapeño Classic 5oz (UPC, retail $4.99, lot_prefix JAL5)
- Habanero Blaze 16oz (retail $11.99, lot_prefix HAB16)
- Habanero Blaze 5oz (retail $5.99, lot_prefix HAB5)
- Ghost Pepper Reaper 5oz (retail $8.99, lot_prefix GHO5)

**sku_packaging BOMs:** each 16oz SKU = 1 × 16oz bottle + 1 cap + 1 front label +
1 back label. Each 5oz SKU same but with the 5oz bottle.

**Raw lots (16, 2 per raw ingredient), packaging lots (12, 2 per packaging
ingredient)** with realistic dates and expiries.

**Purchase orders (3):** 1 sent, 1 partial, 1 received. Include packaging POs
(bottles from "Global Container Co").

**Production runs (5):**
- PR-2026-001: Jalapeño Classic completed 2026-02-10. Output: 32 × 16oz + 0 × 5oz.
- PR-2026-002: Jalapeño Classic completed 2026-03-05. Output: 16 × 16oz + 32 × 5oz. (Mixed fill — this is the demo moneyshot.)
- PR-2026-003: Habanero Blaze completed 2026-03-20. Output: 20 × 16oz + 20 × 5oz.
- PR-2026-004: Ghost Pepper Reaper completed 2026-04-01. Output: 0 × 16oz + 40 × 5oz.
- PR-2026-005: Jalapeño Classic draft (not started).

Each completed run writes `production_run_outputs` rows + a finished-goods `lot` per
output SKU + packaging consumption in `production_run_lots` + a `qbo_sync_log`
journal-entry row.

**Sales orders (10):** mix of draft / confirmed / shipped / delivered. Customers:
"Whole Foods Austin", "Central Market Dallas", "HEB San Antonio", "Torchy's Tacos",
"Salt Lick BBQ". SO lines reference SKUs (post-Part-9).

**QBO sync log:** 1 synced journal entry for PR-2026-001, 1 pending journal entry
for PR-2026-002, 1 synced invoice for a shipped SO.

**Runnable as:** `npm run seed`. Script: `src/scripts/seed-demo.ts`.

### 13.2 — Settings Shell

**Path:** `/dashboard/settings` (currently 404s — this is what the QBO OAuth
callback redirects to).

**Tabs:**
- **Organization** — name, member list (single member for now), plan + usage
  counters.
- **Billing** (merges the original guide's `/dashboard/settings/billing`) — current
  plan card, trial info, change-plan section, invoice history, Manage Subscription
  button (→ Stripe Customer Portal).
- **QuickBooks** — connection status, Connect / Disconnect button, realm ID + company
  name (fetched once at connect time from QBO CompanyInfo), account-mapping form
  (COGS / Inventory / AR / AP / Income / Default Item — dropdowns populated from
  `/api/qbo/accounts` which queries sandbox). Replaces the direct-DB workflow from
  Part 9B.2.
- **Account** — email, sign out.

**Minimum viable shell for Part 13:** Organization tab + QuickBooks tab. Billing
and Account tabs can stub to "Coming soon" cards if timing is tight. The
QuickBooks tab is load-bearing because without it the QBO callback still 404s.

### 13.3 — UI Polish (carry from original guide 12.2)

Run a UI audit pass. Check:
- **Branding** — grep for any leftover "Stackline" text (the original guide was
  templated from a different project).
- **Loading states** — every list page needs a skeleton or spinner.
- **Empty states** — every list handles zero rows with friendly CTA + not a broken table.
- **Error toasts** — failed server actions surface a red toast, not a silent fail.
- **Mobile layout** — check 375px width. Sidebar collapses, tables scroll horizontally.
- **Toast library** — pick one (shadcn/ui has one, or sonner). Apply consistently.

### 13.4 — Milestones

| # | Milestone | Effort (days) |
|---|---|---|
| 13.1 | Demo seeder rewrite (raw + packaging + SKUs + BOMs + multi-SKU runs) | 1.0 |
| 13.2 | Settings shell — Organization + QuickBooks tabs | 0.75 |
| 13.3 | Account-mapping form + QBO CompanyInfo fetch | 0.25 |
| 13.4 | UI audit + fixes (branding, loading, empty, mobile) | 0.5 |
| **Total** | | **~2.5** |

### Cross-team tags

- [DANNY] Seeder must be idempotent (re-runnable) or **hard-fail** on re-run. Pick
  one. Recommend hard-fail with a "--reset" flag that truncates first.
- [DANNY] `/api/qbo/accounts` is a new internal route that proxies to QBO's
  `/account` query. Lives under the same CRON/user auth split as the sync routes.
- [RAY] Settings page reads/writes sensitive config (QBO refresh token exists in
  the DB; this page must never display it). Audit the QBO tab's server component
  to confirm it only reads the encrypted status columns, not the token itself.
- [RAY] Account-mapping form lets operators set arbitrary QBO account IDs. Validate
  the IDs exist in the connected realm at save time (one QBO query per save);
  reject invalid IDs with a clear message.

**Pass criterion for Part 13:** `npm run seed` runs clean from a fresh DB, all 4
sidebar screens render the seeded data correctly, `/dashboard/settings` exists and
the QBO OAuth callback lands on it successfully, a full UI pass finds no branding
leaks and no broken empty states.

**[PERPLEXITY]** drives the UI audit. **[CLAUDE CODE]** writes seeder, settings
shell, route, fixes.

---

## Part 14 — Security + Submission (1 day)

### Intent

One-day final sweep before contest submission. The original guide's Part 13 is close
but predates migrations 007–012 and the SKU model.

### 14.1 — Security Audit

Carry the original guide's 10 checks forward. Add these post-SKU-plan items:

| # | New check | How to verify |
|---|---|---|
| 11 | RLS on `skus`, `production_run_outputs`, `sku_packaging` | For each table: `SELECT relrowsecurity FROM pg_class WHERE relname IN (...)` should return true; 4 policies each should exist. |
| 12 | UPC partial uniqueness per-org | Try inserting a duplicate UPC in the same org → should fail. Try the same UPC in two different orgs → should succeed. |
| 13 | `lots` XOR CHECK | Try inserting a lot with BOTH `ingredient_id` + `sku_id` set → should fail. With NEITHER → should fail. |
| 14 | `ingredients.kind` lock after first lot | Create ingredient, create a lot against it, try to PATCH `kind` → should fail with a clear message. |
| 15 | COGS invariant on run completion | Artificially introduce a rounding error in `production_run_outputs.allocated_cogs_total` via direct UPDATE, then try to complete another run — should still pass (it's a completion-time check, not a continuous one). Confirm the completion-time path is wired. |
| 16 | `shipSalesOrder` can no longer accept bogus lot numbers | Try submitting a ship payload referencing a non-existent lot — should reject. |
| 17 | QBO account-mapping form rejects IDs not in the realm | Seed a bogus QBO account ID via the form → should reject at save. |
| 18 | Cron secret never logged | grep server logs + `console.log` for `CRON_SECRET` leaks. |
| 19 | No sensitive data in error toasts | Trigger 5 random errors in the UI; inspect toast content; confirm no JWTs, Supabase URLs, encrypted token fragments, or QBO refresh-token bytes leak. |
| 20 | AI readonly wrapper can't be called directly | With an authenticated session, POST to `/rest/v1/rpc/execute_ai_query` directly (bypassing `/api/ai/query`). Should 401 or 403 — the role must gate it. |

Plus all 10 original checks:
- CRON_SECRET bearer on cron routes
- RLS enabled on ALL tables (now 13 original + `skus` + `production_run_outputs` +
  `sku_packaging` + others from 009/010/012)
- Auth redirect on /dashboard
- No hardcoded API keys in source
- Stripe raw-body webhook
- QBO refresh token encrypted at rest (migration 003 AES-256-GCM via `QBO_TOKEN_ENCRYPTION_KEY`)
- AI readonly role restrictions
- CORS (no wildcard on API routes)
- Rate limiting (AI query is the exposure — add if not present; simple in-memory
  bucket per-org is sufficient for contest)
- Input validation (Zod schemas on every server action)

### 14.2 — Pre-deploy checklist

Rewritten from the original guide's Part 15, expanded:

| # | Check | Verify |
|---|---|---|
| 1 | All env vars in Vercel | Vercel → Settings → Environment Variables |
| 2 | RLS enabled on ALL tables (original 13 + SKU-plan 3 + Part 10 AI usage table + Part 12 stripe tables if any) | Supabase → Database → Tables → each should show RLS on |
| 3 | No leftover "Stackline" / template text | `grep -r -i "stackline" src/` |
| 4 | No $0.00 lots | `SELECT id FROM lots WHERE unit_cost = 0` → 0 rows |
| 5 | All three onboarding paths functional | Part 9A pass criterion |
| 6 | Active `save-ingredients` bug fixed | Part 9A.4 pass criterion |
| 7 | Multi-SKU production run works end-to-end | Part 9 milestone 9.11 |
| 8 | Finished-goods lots appear on dashboard stats | Verify in UI |
| 9 | Traceability works for finished lots | Search a finished lot → see its run + its SOs |
| 10 | QBO OAuth + disconnect work (Part 9B) | Already verified |
| 11 | All three QBO syncs post to sandbox (Part 9B) | Already verified |
| 12 | Dispatcher cron syncs without manual curl (Part 11) | Already verified |
| 13 | Stripe Checkout → webhook → plan active | Part 12 pass criterion |
| 14 | Customer portal opens | Part 12 pass criterion |
| 15 | Plan gating blocks over-limit creates | Try creating a 51st ingredient on Starter plan |
| 16 | AI assistant returns real data on all 5 suggested questions | Part 10 pass criterion |
| 17 | AI can't write (read-only role enforced) | Check 20 above |
| 18 | Settings page loads, QBO tab functional | Part 13 pass criterion |
| 19 | Mobile layout usable at 375px | UI audit passes |
| 20 | Demo seeder runs clean | `npm run seed` exits 0 on fresh DB |

### 14.3 — Submission package

What Perplexity wants (confirm on contest page; this is my best guess given the
"Billion Dollar Build" framing):

- **Live URL** — https://www.lotmonster.co
- **GitHub repo link** — https://github.com/ntangborn/lotmonster
- **Demo credentials** — a test user + seeded org. Put these in the submission form;
  do NOT commit them.
- **Demo video (5 min)** — screen-capture the 5-moment demo script below. Upload to
  YouTube unlisted or Loom.
- **Submission narrative** — keep the original guide's Step 13.3 structure:
  1. WHAT WE BUILT (2 graphs) — Lotmonster + key capabilities, including finished-
     goods tracking + packaging BOMs + per-SKU COGS.
  2. WHO IT'S FOR (1 graph) — small CPG manufacturers.
  3. HOW PERPLEXITY COMPUTER WAS CENTRAL (3 graphs) — day-by-day recap.
  4. THE MARKET OPPORTUNITY (2 graphs).
  5. WHAT WE'D BUILD WITH $1B (2 graphs) — case packing, barcode scanning, accrual
     accounting, multi-facility, predictive replenishment.

### 14.4 — Demo script (5 min)

**0:00–0:30** — Login, landing on dashboard. "This is Lotmonster — AI-native
inventory for small CPG manufacturers. I'm showing you the Lone Star Heat demo
account, a Texas hot sauce maker."

**0:30–1:30** — Onboarding tour. Show the 3 paths. Demo Path A with a CSV of
ingredients. "Most inventory systems make you type everything in — Lotmonster lets
you upload a spreadsheet or a photo and the AI extracts the data."

**1:30–3:00** — Production run with finished goods. Start PR-2026-002 (mixed fill).
Complete with 16 × 16oz + 32 × 5oz outputs. Show the live cost-split preview
(liquid by volume, packaging deterministic). Point out that each finished lot has
its own unit-COGS. "A 16oz bottle costs $X to produce — that includes $Y of sauce
and $Z of packaging. The 5oz costs less because it holds less sauce, but the
packaging-per-bottle is nearly the same."

**3:00–4:00** — QBO journal entry + sales order invoice. Ship an SO. Wait (or show
the pre-synced one). Flip to QBO Sandbox tab — the invoice is there. "Every ship
creates an invoice in QuickBooks. Every completed run creates a journal entry. This
is full double-entry accounting on autopilot."

**4:00–4:45** — AI assistant. Type: "How many 16oz cases of Jalapeño Classic can I
sell today?" Show the response. Type: "Trace finished lot JAL16-20260305-001." Show
the traceability chain from raw jalapeños → production run → finished lot → SOs
→ customers.

**4:45–5:00** — Recall traceability. "If there's a recall on that jalapeño lot,
here's every finished lot it touched, every SO it shipped in, and every customer
we need to call. Two clicks to audit."

### 14.5 — Milestones

| # | Milestone | Effort (days) |
|---|---|---|
| 14.1 | Security audit (20 checks) | 0.4 |
| 14.2 | Pre-deploy checklist walk | 0.2 |
| 14.3 | Demo video recording + upload | 0.2 |
| 14.4 | Submission narrative + form fill | 0.2 |
| **Total** | | **~1.0** |

### Cross-team tags

- [RAY] Full security audit, all 20 items.
- [DANNY] Confirm all env vars in Vercel production match the `.env.local` list in
  CLAUDE.md. Rotate the exposed Supabase service-role key and access token noted in
  CLAUDE.md's "Known issues / deferred" section before submission.

**Pass criterion:** all 20 checklist items green; demo video recorded; submission
form filled.

**[PERPLEXITY]** runs the audit + writes the submission narrative.
**[CLAUDE CODE]** fixes anything the audit catches.

---

## Part 15 — Phase 2/3 Backlog (reference only)

Everything explicitly out of the contest cut. For each item: one-line context so
the user can prioritize post-contest.

### Data model / business logic

- **Case packing (phase 2).** `case_pack_events` table + `packCases` action. See
  SKU plan phase 2.
- **Case-price display toggle on invoices (phase 2).** `price_display_mode` +
  `unit_price_override` on SO lines. See SKU plan Q12.
- **`sales_order_line_lots` junction (phase 2).** Replaces free-text
  `lot_numbers_allocated TEXT[]`. Migration 013+.
- **Drop `sales_order_lines.recipe_id` (phase 2, migration 013+).** After all
  app code reads from `sku_id`. Probably safe 2 deploys after Part 9 ships.
  (Migration 008 does the cutover — sets `sku_id NOT NULL` and relaxes
  `recipe_id` — but keeps the column as a safety net; the actual DROP
  COLUMN lands in the first phase-2 migration.)
- **Postgres RPC for atomicity.** `startRun`, `completeRun`, `shipSalesOrder`,
  `receivePO`, `packCases` all currently sequential-writes with best-effort rollback.
  Move to server-side RPC functions to eliminate overdraft under concurrency.
- **Per-SKU QBO Item mapping UI (phase 2).** Settings tab gains a per-SKU QBO Item
  picker. Currently uses default item.
- **Auto-create QBO Items on SKU creation (phase 3).** POST to QBO `/item`.
- **COGS at ship, not at completion (phase 3).** Moves half of the JE from
  run-completion to ship-time for accrual-basis customers. Finished-goods inventory
  appears on the balance sheet.
- **Deep SKU nesting (phase 3).** Pallet → case → unit. Schema already supports it;
  just UI.
- **Mixed cases (phase 3).** Migrate `parent_sku_id` self-reference to a
  `sku_components` junction.

### UX / UI

- **Recipe edit page** (`/dashboard/recipes/[id]/edit`). PATCH API exists; no UI.
- **Lot detail page** (`/dashboard/lots/[id]`). List exists, detail doesn't.
- **Real landing page.** Current homepage is a placeholder.
- **Barcode / UPC scanning at fill step.** Physical device integration; big lift.
- **Multi-user member management.** Currently one member per org (signup creates org).
- **Audit log.** For cost overrides, expiry overrides, role changes. Schema +
  query UI.
- **Forecasting / replenishment recommendations.** The "AI-native" promise at
  the limit. Currently low-stock alerts only.

### Ops

- **Low-stock email alerts.** Cron + email template.
- **Expiring-lot email alerts.** Cron + email template.
- **Proactive QBO token renewal cron.** Refresh before 401, instead of lazily on 401.

### Tech debt

- **Rotate the leaked Supabase service-role key + access token.** From CLAUDE.md:
  "Exposed credentials: service role key + Supabase access token were pasted in a
  previous Claude session. Rotate when convenient." Do this before contest if
  possible, ASAP after.
- **Recipe SKU + Active flag.** Schema doesn't have columns; CLAUDE.md flags
  migration 004 needed if/when wanted.
- **PO `order_date` column** (currently uses `created_at`).
- **Comprehensive test coverage.** Only `cogs.ts` and `units.ts` are covered today.
  Add vitest coverage for: FEFO allocator, traceability, completeRun invariants,
  QBO sync error handling.

---

## Handoff to Danny

Infrastructure + ops concerns across the full plan:

- **New migrations this plan introduces (v4 canonical numbering):** 007 (SKU
  plan, wide), 008 (SKU cutover, post-Part-9), 009 (AI functions), 010 (AI
  readonly role), 011 (qbo_sync_log retry columns — `attempt_count`,
  `last_attempted_at`, `error_message` — if not already there), 012 (Stripe
  schema catch-up if needed). Beyond v4's explicit list, the 013+ slot absorbs
  whichever post-012 add lands first: either the AI usage counter (this plan,
  Part 12) or the phase-2 SKU-plan migrations (`sales_order_line_lots`,
  `case_pack_events`, drop `recipe_id`). That's 5–7 migrations across
  ~3 weeks. All additive except 008. All should run in transactions.
- **Vercel cron — Hobby vs Pro.** Every-15-min cadence for `/api/cron/qbo-sync`
  requires Pro. Hobby allows 1 invocation/day which is demo-unusable. Flag the
  plan upgrade decision early in the Part 11 window.
- **Env vars added across the plan:**
  - Part 12: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`,
    `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE` (5 new).
  - Parts 9/10/11/13/14: zero new env vars.
- **Backfill runtime.** Migration 007 runs a DO block that creates one SKU per
  recipe + populates `sales_order_lines.sku_id`. Demo-scale (< 100 rows per org);
  expected runtime < 1s.
- **Rotation reminder.** CLAUDE.md flags the service-role key + Supabase access
  token as leaked. Rotate before contest submission.
- **Supabase role creation.** Migration 010 creates `ai_readonly` via
  `CREATE ROLE ... NOLOGIN`. Confirm the Supabase migration
  runner has CREATEROLE — if not, document a one-time Management-API or
  SQL-editor step.
- **Proxy.ts public routes.** `/api/stripe/webhook` must be explicitly allowed (no
  session cookie). Already have `/api/cron/*` pattern; add webhook in Part 12.
- **`completeRun` atomic complexity.** Post-Part-9 it writes to 5 tables in a
  best-effort sequence. The Postgres RPC upgrade is listed in the phase-2+ backlog
  but becomes operationally urgent the moment a second org signs on.

## Handoff to Ray

Security + integrity review items across the full plan:

- **Part 9 (SKU plan) [RAY] items** — all carry forward: UPC uniqueness scoping,
  lots XOR CHECK, `ingredients.kind` lock, COGS invariant at completion, packaging
  FK server-side validation, override audit trail, idempotency UNIQUE `(run_id, sku_id)`
  on outputs, lot-number auto-gen uniqueness probe.
- **Part 10 (AI) [RAY] items** — `execute_ai_query` whitelist is hard-coded; the
  wrapper can't be called by authenticated users directly (role gated); `org_id`
  always injected server-side and never trusted from Claude; traceability tool
  uses exact-string match (no LIKE) against free-text lot numbers.
- **Part 11 (Cron) [RAY] items** — `CRON_SECRET` never logged; `attempt_count` is
  monotonic (no resets); failed-row backoff respected.
- **Part 12 (Stripe) [RAY] items** — raw-body webhook verification; plan gating on
  server actions not just UI; customer-portal session only for the user's own org;
  env-var-set audit in Vercel.
- **Part 13 (Settings) [RAY] items** — QBO refresh token never rendered in settings
  UI (only the connection-status flag); account-mapping form validates IDs exist in
  the realm at save time.
- **Part 14 (Audit) [RAY] items** — all 20 pre-deploy items.
- **Cross-cutting** — leaked service-role key and Supabase access token rotation
  (from CLAUDE.md Known Issues). `shipSalesOrder` + `startRun` + `completeRun`
  concurrency overdraft (documented; phase-2 RPC fix).

---

*Lotmonster revised build plan, 2026-04-16. Supersedes Parts 9–15 of v3 guide.*
