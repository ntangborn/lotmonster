# Lotmonster — Step-by-Step Build Guide v4

**AI-Native Inventory Management for Small CPG Manufacturers**

| Field | Value |
|---|---|
| Stack | Next.js 16.2.3 (App Router, `proxy.ts` middleware) · Supabase SSR v0.10.2 · Vercel · Anthropic Claude (claude-sonnet-4-6) · Stripe Billing · QuickBooks Online REST API v3 |
| Domain | https://www.lotmonster.co |
| Local Path | `F:\Projects\lotmonster` |
| Contest | Perplexity Billion Dollar Build |
| Backbone plan | `docs/plans/2026-04-16-build-plan-revised-from-part-9.md` (Bob) |
| SKU spec | `docs/plans/2026-04-16-skus-and-finished-goods.md` (Bob) |
| Supersedes | `docs/lotmonster-build-guide-v3.md` Parts 9–15 |
| Start date | 2026-04-16 |

---

## Intro — How to Use This Guide

This is v4. It starts at **Part 9A** and runs through contest submission. Parts 0–8
(scaffold, auth, schema, onboarding, ingredients, lots, recipes, production runs,
POs, SOs, traceability) were built by following `docs/lotmonster-build-guide-v3.md`
and are **already shipped to production** at https://www.lotmonster.co. Do not
re-read v3's Parts 0–8 for new work.

### The three-actor pattern

You are not doing this alone. You're orchestrating three actors:

- **[PERPLEXITY COMPUTER]** — paste these prompts into Perplexity's Computer mode.
  Perplexity is the research partner: it reads docs, walks browser UIs, runs the
  hand-testing scripts, writes narratives, and verifies deployments. It can
  navigate the Supabase dashboard, the Vercel dashboard, the QBO sandbox, and
  your own production app.
- **[CLAUDE CODE]** — paste these prompts into this same Claude Code CLI, pointed
  at `F:\Projects\lotmonster`. Claude Code is the builder: it writes migrations,
  API routes, components, scripts. It can read and edit the codebase.
- **[USER]** — these are steps **you** do yourself. Clicking a button in the
  Supabase dashboard, pasting a Bearer token into a curl command, visiting a URL,
  pushing a git commit. The step text tells you exactly what to type or click.

### How to read a prompt

Every prompt block is labeled. When you see a `[PERPLEXITY COMPUTER]`, open
Perplexity and paste. When you see a `[CLAUDE CODE]`, paste into the Claude Code
CLI. When you see `[USER]`, that's on you.

Every step ends with a **Done when:** line. Tick the box, move on. If the Done
criterion doesn't hold, recover per the "When a step fails" block below.

### When a step fails

1. Grab the error digest from the browser (production builds hide the real
   message; the digest is the hook). Or capture the stack from `npm run dev` if
   you're local.
2. Pull the matching server log. The universal recovery prompt:

   **[CLAUDE CODE]**
   ```
   I just hit a server error in Lotmonster. The digest is <PASTE>. Run:
     npx vercel logs --no-follow --since 1h --level error --expand
   Find the matching stack trace, diagnose the root cause, and propose a fix.
   Do NOT apply the fix until I confirm.
   ```

3. If the fix needs a schema change, propose it as a new numbered migration;
   do not amend an already-applied migration.

### Environment

- **OS:** Windows 11 Pro. **Shell:** Git Bash. Commands assume POSIX-style
  paths.
- **Vercel CLI:** installed, authed as `ntangborn-3191`.
- **Supabase CLI:** installed, linked to project ref `vvoyidhqlxjcuhhsdiyy`.
- **Env vars:** Supabase, Anthropic, QBO sandbox already set in Vercel + `.env.local`
  per CLAUDE.md. Stripe vars get added in Part 12.

### What's in v4 vs v3

| Part | Topic | Source |
|---|---|---|
| **Intro** | This page | new |
| **9A** | Test existing functionality | new (was implicit in v3) |
| **9B** | Verify QBO integration end-to-end | new |
| **9** | SKUs + finished goods (SKU plan rev 2) | new |
| **10** | AI assistant — Claude tool_use (re-specced for SKUs) | v3 Part 9 + SKU plan |
| **11** | Cron jobs + QBO sync dispatcher | v3 Part 10 + dispatcher logic |
| **12** | Stripe billing | **carried forward from v3 Part 11** (minor deltas) |
| **13** | Demo seeder + polish + settings shell | v3 Part 12 (rewritten seeder) |
| **14** | Security + submission | v3 Part 13 (expanded) |
| **15** | Phase 2/3 backlog (reference only) | new |
| **Appendix A** | Troubleshooting | v3 Part 14 + new failure modes |
| **Appendix B** | Pre-deploy checklist | v3 Part 15 (expanded) |

You'll see explicit "carried forward from v3" notes where large blocks are lifted.
Everything else is fresh.

---

# Part 9A — Test Existing Functionality

| Field | Value |
|---|---|
| Why this part matters | You're about to rewrite the core production-run flow. The surface underneath has 8 feature areas and 2 vitest files. Walk it end-to-end with a fresh user; fix whatever shakes out. The active `save-ingredients` bug blocks everything downstream. |
| Estimated days | 1.0–1.5 (1.0 walk + 0.5 buffer for the save-ingredients fix) |
| Prerequisites | Parts 0–8 shipped to production (they are) |
| Outputs | Confirmed-working baseline for Parts 9B+ · any bugs found are filed and fixed · 13 feature-area checkboxes ticked |

## How to run Part 9A

For each of the 13 sections below, Perplexity runs the hand-test and you confirm.
Use a **fresh Supabase user** (a new email you haven't used yet) on
https://www.lotmonster.co. When a step reproduces an error, jump to the
failure-recovery pattern in the "When a step fails" block above.

Open a single shared scratchpad (markdown or a sticky note) before starting. For
each section, record: section number, pass/fail, digest if fail, root-cause note
if fixed.

### What's already under automated test

- `src/lib/__tests__/cogs.test.ts` (19 tests)
- `src/lib/__tests__/units.test.ts`

**Everything else is manual.** Specifically uncovered: every server action, every
API route, every `/dashboard/**` page, FEFO decrement, QBO sync logic, traceability
queries, zero-cost guard.

---

### Step 9A.1 — Auth (email OTP + Google OAuth)

**[PERPLEXITY COMPUTER]**

```
Go to https://www.lotmonster.co. Walk this test script and report pass/fail
on each probe. For each failure, capture the URL, the on-screen error text,
and the browser console (F12 → Console tab).

HAPPY PATH:
1. Click "Sign Up".
2. Enter a fresh email (one never used on lotmonster.co) and an org name
   like "QA Sample Co". Submit.
3. Wait for the email. Open it. Paste the 8-digit OTP into the code stage
   of the form. Submit. Expected: land on /dashboard.
4. Click the user menu → Log out. Expected: redirect to /.
5. Click "Log In". Enter the same email. Paste the new OTP. Expected: land
   on /dashboard.

BREAK-POINT PROBES:
A. Submit a wrong 8-digit OTP. Expected: inline error, no redirect.
B. Wait >10 minutes after the OTP email arrives, then try. Expected:
   graceful "code expired" message, not a 500.
C. Click "Log in with Google" on /login. Complete Google's consent.
   Expected: land on /dashboard. Specifically watch for "PKCE code verifier
   not found in storage" — if you see it, the Google OAuth path is broken.

Report results as a table: { step, pass/fail, notes }.
```

**Done when:** [ ] Fresh user signs up, logs out, logs back in. Google OAuth lands
on dashboard without a PKCE error.

If the Google OAuth probe fails: **[CLAUDE CODE]** "The Google OAuth callback at
`src/app/auth/callback/page.tsx` is throwing a PKCE error. Read the file,
diagnose, propose a fix."

---

### Step 9A.2 — Dashboard home

**[PERPLEXITY COMPUTER]**

```
Still logged in as the fresh QA user from 9A.1. Walk this:

HAPPY PATH:
1. You should be on /dashboard. Confirm 4 stat cards render. With zero data
   they should show "0 active ingredients", "0 active lots", "0 expiring
   this week", "$0.00" COGS — NOT "NaN" or "undefined".
2. Confirm "Expiring Soon" card is empty.
3. Confirm "Low Stock" card is empty.
4. Confirm the sidebar shows exactly 10 nav items.
5. Click each sidebar item in turn. Expected: each page renders. One known
   exception: "AI" will 404 — that's Part 10's job. Log it as "expected
   404" in your results.

BREAK-POINT PROBES:
A. Is there any stat card that shows "NaN" or an error? Flag it.
B. Fresh users have no org_id on their JWT — the page code must look up
   org from org_members. If any card renders an empty org error, that's
   a regression worth flagging.

Report results.
```

**Done when:** [ ] Dashboard renders without throws. All 10 sidebar links resolve
(AI is an expected 404).

---

### Step 9A.3 — Onboarding Path A (Upload)

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard/onboarding. Pick "Upload a spreadsheet or photo".

HAPPY PATH:
1. Prepare a CSV with these 6 rows (headers required):
   name,unit,category,cost_per_unit,quantity
   Habanero,lb,produce,4.50,20
   Vinegar,gal,pantry,9.00,10
   Garlic,lb,produce,5.50,5
   Salt,lb,pantry,1.20,3
   16oz Bottle,each,packaging,0.32,200
   Cap,each,packaging,0.05,200
2. Drag the CSV onto the dropzone.
3. Wait for Vision extraction → column mapping → editable table.
4. Confirm all 6 rows populated with correct values.
5. Click Save. Expected: redirect to /dashboard/ingredients, which shows
   the 6 ingredients.

BREAK-POINT PROBES:
A. Take a phone photo of a handwritten 5-ingredient list and upload it.
   Report whether Vision extracted reasonably (not demanding perfection,
   just "recognizable").
B. In the editable table, set one row's cost_per_unit = 0. Try to save.
   Expected: zero-cost guard blocks the save OR warns inline.
C. (Skip if plan-limited) Upload a 10+ MB file. Expected: clean error
   message, not a timeout.

Report.
```

**Done when:** [ ] A parsed file saves 5+ ingredients, AND zero-cost guard fires
on a zeroed row.

---

### Step 9A.4 — Onboarding Path B (Manual) — **CONTAINS THE ACTIVE BUG**

**[PERPLEXITY COMPUTER]**

```
This is the path CLAUDE.md says has an active bug. Walk it carefully and
capture the error digest if it reproduces.

HAPPY PATH:
1. Go to /dashboard/onboarding, pick "Enter manually".
2. Add 6 ingredients, one at a time, filling every field:
   - name, unit, category, low-stock threshold
   - bulk cost derivation (e.g., $18 for 5 lb → $3.60/lb live-derived)
   - starting quantity
3. After adding all 6, click "Save All Ingredients".
4. EXPECTED: redirect to /dashboard/ingredients showing all 6 rows.
5. ACTUAL per CLAUDE.md: the redirect goes to /dashboard/ingredients and
   that page throws a server-component render error. Production hides the
   message behind a digest like "Error: An error occurred in the Server
   Components render".

IF YOU SEE THE ERROR:
- Screenshot the browser.
- Copy the full digest string (the long hex value).
- Capture the URL bar.
- Note exactly after how many rows the save was attempted.

BREAK-POINT PROBES:
A. Save 1 ingredient instead of 6. Does it still break? (Narrow the
   trigger.)
B. Save exactly 5 (not 6). Does it break? (Narrow further.)
C. Try setting quantity = 0 with cost = 1 on one row. Does the zero-guard
   behave sensibly (allow zero qty, block zero cost)?
D. Try a unit string that's not in the enum ("xyz"). Should be a Zod
   rejection, not a 500.

Report everything.
```

Then pass the digest to Claude Code:

**[CLAUDE CODE]**

```
I just reproduced the save-ingredients bug noted in CLAUDE.md. The error
digest is <PASTE FROM PERPLEXITY>. The user saved 6 ingredients on a fresh
org and landed on /dashboard/ingredients, which threw.

Step 1: Pull the Vercel logs to find the matching stack trace.
  npx vercel logs --no-follow --since 1h --level error --expand | grep -i <FIRST-8-DIGEST-CHARS>

Step 2: Read src/app/dashboard/ingredients/page.tsx and
src/lib/ingredients/queries.ts (especially the listIngredients function
and resolveOrgId). Also read src/lib/actions/ingredients.ts and the save
server action triggered from /dashboard/onboarding/manual.

Step 3: Diagnose. Candidates to consider:
- bulkInsertIngredients returning a shape the list page doesn't expect
- resolveOrgId throwing because the user's org_members row hasn't
  propagated yet
- a Zod schema mismatch between create and read
- a null-ref on a joined relation

Step 4: Propose a fix. Do NOT apply until I confirm. Include a short test
plan that reproduces the fix locally (npm run dev + save 6 ingredients).
```

**Done when:** [ ] Bug reproduces and root cause is identified → fix shipped
→ saving 6 ingredients on a fresh org lands on a clean ingredient list.
**This bug blocks every downstream section.**

---

### Step 9A.5 — Onboarding Path C (Chat)

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard/onboarding → "Chat with AI".

HAPPY PATH:
1. Type: "I sell hot sauce. My ingredients: habanero peppers at about
   $4/lb, apple cider vinegar at $9/gal, garlic cloves at $5.50/lb, sea
   salt at $1.20/lb. I also buy 5oz bottles at $0.22 each, caps at $0.05,
   and front labels at $0.08. Let's add 20 lb habanero, 8 gal vinegar, 5
   lb garlic, 3 lb salt, 500 bottles, 500 caps, 500 labels."
2. Watch the streaming response. Watch the right-side staging panel
   populate with rows.
3. Confirm the AI correctly inferred unit + category for each.
4. Click Save. Expected: redirect to /dashboard/ingredients with 7 rows.

BREAK-POINT PROBES:
A. Start typing a follow-up, then close the tab mid-stream. Reopen. No
   partial save should have committed.
B. Ask: "What's the weather?" — AI should politely decline / stay on-task.
C. Add a row, then delete it from the staging panel before saving.

Report.
```

**Done when:** [ ] Chat staging flow commits 3+ ingredients and they appear on the
ingredient list.

---

### Step 9A.6 — Ingredients list + detail

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard/ingredients.

HAPPY PATH:
1. Confirm list renders with columns: name, category, current stock, avg
   cost, status badge.
2. Search by a substring of an ingredient name. Confirm the list filters.
3. Filter by a category. Confirm.
4. Click a row. Confirm detail page renders with 3 tabs: Lots, Used In,
   Purchase History.
5. Inline-edit the name on the detail page. Save. Confirm update.
6. Try to delete an ingredient referenced by a recipe or a lot. Expected:
   blocked with a clear message.
7. Create a brand-new ingredient (not referenced anywhere). Delete it.
   Expected: success, disappears from list.

BREAK-POINT PROBES:
A. Toggle category filter to one that matches zero ingredients. Empty
   state must render cleanly (no broken table).
B. On an ingredient with 2 lots at different unit_costs, does the list's
   avg cost match (qty1*cost1 + qty2*cost2) / (qty1+qty2)? Compute by hand.
C. Edit the unit column from 'lb' to 'kg' on an ingredient that has lots.
   Does the system warn, or silently accept? (If silent: flag for Part 9,
   not a blocker here.)

Report.
```

**Done when:** [ ] List + filter + detail + edit + delete all work. Avg cost
matches manual math on a 2-lot fixture.

---

### Step 9A.7 — Lots + FEFO

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard/lots.

HAPPY PATH:
1. Click "Create Lot".
2. In the searchable ingredient dropdown, pick habanero.
3. Confirm the auto-suggested lot number format: {PREFIX}-{YYYYMMDD}-{NNN}.
4. Fill: received date (today), expiry date (30 days out), qty (10 lb),
   unit cost ($4.00).
5. Save. Confirm the row appears in the list, sorted by expiry ASC.
6. Create two more lots on the same ingredient with different expiry dates
   (one 5 days out, one 60 days out). Confirm FEFO order: 5d → 30d → 60d.

BREAK-POINT PROBES:
A. Create a lot with unit_cost = 0. Expected: blocked by zero-cost guard
   (migration 002 has a CHECK constraint too).
B. Create a lot with expiry 5 days out. Confirm the row is RED-tinted.
C. Create a lot with expiry 25 days out. Confirm the row is YELLOW-tinted.
D. Use filters: by ingredient, by status (available/depleted), by
   "expiring soon". Each filter should show the expected subset.

Report.
```

**Done when:** [ ] A 3-lot fixture renders in expected FEFO order. Red/yellow row
tints match the 7d/30d thresholds.

---

### Step 9A.8 — Recipes

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard/recipes.

HAPPY PATH:
1. Click "New recipe".
2. Name: "Jalapeño Classic" (we'll reuse this in Part 9). Target yield:
   100 (units: bottles).
3. Add 4 ingredient lines: habanero (10 lb), vinegar (1 gal), garlic
   (2 lb), salt (0.5 lb). Watch the live cost preview update as you add
   each line.
4. Drag the salt line up one slot to reorder.
5. Save. Go back to the list, confirm the recipe exists.
6. Click into it, flip to the "Production History" tab. It should be
   empty (no runs yet).

BREAK-POINT PROBES:
A. Try to add the same ingredient twice. Does the UI dedupe or allow it?
B. Set a line to quantity = 0. Does it block or allow?
C. Try to save a recipe with zero lines. Expected: blocking error.

Confirm the cost preview equals sum(line.qty * ingredient.avg_cost) by
hand on at least one line. Report.
```

**Done when:** [ ] Recipe saves and cost preview matches hand-math.

---

### Step 9A.9 — Production runs

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard/production-runs.

HAPPY PATH:
1. Click "New run", pick "Jalapeño Classic".
2. Confirm the FEFO preview renders: for each ingredient line, which lot
   will be drawn, how much, at what unit cost.
3. Click "Start Run". Expected: status moves to "In Progress", lots on
   /dashboard/lots show decremented quantities.
4. Click "Complete Run". Enter actual yield = 98. Expected: status →
   Completed. total_cogs computed. waste_pct ≈ 2.

VERIFY QBO SYNC LOG ROW WAS WRITTEN:
- Perplexity: open the Supabase SQL editor
  (https://supabase.com/dashboard/project/vvoyidhqlxjcuhhsdiyy/editor/sql)
- Run:
    SELECT entity_type, entity_id, status, created_at
    FROM qbo_sync_log
    WHERE org_id = '<YOUR_ORG_ID>'
    ORDER BY created_at DESC LIMIT 5;
- Expected: a row with entity_type='journal_entry' and
  entity_id=<your_run_id>, status='pending'. This is what the Part 11
  dispatcher will consume.

BREAK-POINT PROBES:
A. Plan a run that exceeds available stock (set recipe line qty too high,
   or run with insufficient lot qty). Expected: Start Run blocks with
   "InsufficientStockError: needed X, only Y available".
B. Start a run, then Cancel (before completing). Confirm lots are
   restored to quantity_remaining from before Start, and status returns
   to 'available'.
C. Complete a run with actual_yield = 0. Expected: waste_pct = 100%,
   cost_per_unit = null. No crash.
D. CONCURRENCY PROBE (only if you want to): open two tabs on /new for
   the same recipe when stock barely suffices. Click Start in both
   fast. CLAUDE.md warns about possible overdraft here — note behavior
   for [RAY], do NOT block on this, just log it.

Report.
```

**Done when:** [ ] Draft → Start → Complete flow runs cleanly. Cancel correctly
restores stock. `qbo_sync_log` row is written on complete.

---

### Step 9A.10 — Purchase orders

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard/purchase-orders.

HAPPY PATH:
1. Click "New PO".
2. Supplier autocomplete: type "Texas Pepper Farms" (new supplier, use
   the "add new" option if no match).
3. Add 2 lines: habanero (50 lb @ $3.50), vinegar (10 gal @ $8.75).
4. Save as draft. Approve. Send. (Watch status chips change.)
5. Click "Receive". On the /receive page: enter qty received =
   qty ordered on both lines. Auto-suggested lot numbers should pre-fill.
   Set expiry dates (90 days out for habanero, blank for vinegar).
6. Confirm Receive. Expected: status → Received. Go to /dashboard/lots
   and confirm 2 new lots appeared with the right costs.

VERIFY QBO SYNC LOG ROW:
    SELECT entity_type, entity_id, status
    FROM qbo_sync_log
    WHERE org_id='<YOUR_ORG>' AND entity_type='bill'
    ORDER BY created_at DESC LIMIT 3;
Expected: a row for this PO with status='pending'.

BREAK-POINT PROBES:
A. Receive only 40 lb of the 50 ordered on line 1, and full qty on line
   2. Status should move to "Partial" (not Received).
B. Receive qty = 0 on a line. Should either block or silently skip that
   line.
C. Try to save a PO line with unit_cost = 0. Blocked.

Report.
```

**Done when:** [ ] Receive creates lots with correct cost + expiry. Bill sync log
row written.

---

### Step 9A.11 — Sales orders — **LOG THE LOT-NUMBERS VULNERABILITY**

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard/sales-orders.

HAPPY PATH:
1. Click "New SO".
2. Customer datalist: type "HEB San Antonio".
3. Add a line: Jalapeño Classic × 50 @ $5 each. Save.
4. Confirm. Click "Ship". The ship modal appears with a per-line lot
   chip input AND an auto-suggested production run.
5. Click the suggestion. It fills PR-2025-001 (or whichever completed
   run you have). Ship.
6. Expected: status → Shipped. Then click "Mark Delivered".
7. Click "View Traceability". Should deep-link to /dashboard/traceability
   with the lot chain pre-loaded.

VERIFY QBO SYNC LOG ROW:
    SELECT entity_type, entity_id, status
    FROM qbo_sync_log
    WHERE org_id='<YOUR_ORG>' AND entity_type='invoice'
    ORDER BY created_at DESC LIMIT 3;
Expected: a row for this SO with status='pending'.

BREAK-POINT PROBES:
A. On a new SO, click Ship WITHOUT filling lot chips. Expected: blocked.
B. ⚠️ KNOWN GAP: On a new SO, put a garbage lot number in the chip input
   ("FAKE-999"). Confirm ship succeeds anyway — this is the
   free-text-lot-numbers vulnerability CLAUDE.md flagged. Part 9
   milestone 9.5 fixes it. Log the behavior, do NOT fix here.
C. Ship for qty > what's been produced. Currently will succeed
   incorrectly. Same Part 9 fix.

Report both the good path AND confirm the free-text vulnerability is
reproducible.
```

**Done when:** [ ] Ship flow completes, traceability deep-link renders, invoice
sync row written. **Vulnerability confirmed and logged (explicitly NOT fixed — Part
9 milestone 9.5 owns it).**

---

### Step 9A.12 — Traceability

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard/traceability.

HAPPY PATH:
1. Search by lot — use a habanero lot number from the runs above. Click
   search. Expected: flow arrows render Lot → Production Runs → Sales
   Orders → Customers.
2. Search by run — use PR-2025-001 (or your run number). Middle-out
   trace renders.
3. Search by order — use SO-2025-001 (or your SO number). Reverse trace
   renders.

BREAK-POINT PROBES:
A. Search for a lot number that doesn't exist ("FAKE-999"). Expected:
   empty-state render, not an error page.
B. Does partial-string search work (typing "HAB" matches "HAB-2025-..."),
   or only exact match?
C. Cross-org isolation: in a separate incognito window, sign up as a
   DIFFERENT org (you'll need a second email). Try to search for the
   first org's lot number in that second org. Expected: empty (RLS
   enforces isolation).

Report.
```

**Done when:** [ ] All 3 search modes render correctly, cross-org isolation holds.

---

### Step 9A.13 — COGS dashboard stat

**[PERPLEXITY COMPUTER]**

```
Go to /dashboard. The "This Month's COGS" stat card.

HAPPY PATH:
1. Note the value shown.
2. In Supabase SQL editor:
     SELECT SUM(total_cogs)
     FROM production_runs
     WHERE org_id='<YOUR_ORG>'
       AND status='completed'
       AND completed_at >= DATE_TRUNC('month', CURRENT_DATE)
       AND completed_at <  DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
3. Expected: equals the card value.

BREAK-POINT PROBES:
A. On an org with zero completed runs, the card shows $0.00 — NOT "NaN"
   or "$null".

Report.
```

**Done when:** [ ] Card matches manual SUM on completed runs this month.

---

### Part 9A — Pass criterion

All 13 checkboxes ticked. The save-ingredients bug is fixed. The two known gaps
(free-text lot numbers on SO ship, concurrent-start overdraft) are documented for
Part 9 and [RAY].

Before moving on: **[USER]** commit the fix:

```bash
cd /f/Projects/lotmonster
git add -A
git status    # review
git commit -m "fix: save-ingredients server-render error on fresh org"
git push
```

Wait for Vercel to deploy. Re-run 9A.4 on production. Confirm green. Then proceed
to Part 9B.

---

# Part 9B — Verify QBO Integration End-to-End

| Field | Value |
|---|---|
| Why this part matters | The QBO OAuth + 3 sync routes are code-complete but never hand-verified against the sandbox. Before the Part 11 dispatcher consumes `qbo_sync_log` rows automatically, prove each route works in isolation. |
| Estimated days | 1.0 |
| Prerequisites | Part 9A green |
| Outputs | QBO sandbox connected (refresh token encrypted in `orgs`) · account-mapping columns on `orgs` populated · 1 journal entry, 1 invoice, 1 bill visibly posted to sandbox · idempotency verified · disconnect path verified |

Sandbox facts (per `docs/oauth for qbo secrets.txt`):

- Company: **Sandbox Company US 74a4**
- Realm ID: **9341456849762719**
- Env vars already set: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`,
  `QBO_ENVIRONMENT=sandbox`, `QBO_TOKEN_ENCRYPTION_KEY`

> **Schema note.** Migration 004 stores QBO chart-of-accounts mappings as plain
> columns on `orgs` (`qbo_cogs_account_id`, `qbo_inventory_account_id`,
> `qbo_ar_account_id`, `qbo_ap_account_id`). Migration 005 adds
> `qbo_default_item_id` and `qbo_income_account_id`. There is **no separate
> `qbo_account_mappings` table**. Bob's plan assumed one; the codebase is the
> source of truth. Seed these by `UPDATE`-ing the `orgs` row, not by INSERTing
> into a junction table.

---

### Step 9B.1 — Connect QBO via OAuth

**[USER]**

Grab your org ID first. In the Supabase SQL editor:

```sql
SELECT id AS org_id, name FROM orgs ORDER BY created_at DESC LIMIT 5;
```

Copy the `org_id` of the QA test org you used in 9A. Then visit in your browser:

```
https://www.lotmonster.co/api/qbo/connect?orgId=<PASTE_ORG_ID>
```

You'll redirect to Intuit, pick "Sandbox Company US 74a4" from the dropdown, click
Connect, and redirect back. **You WILL hit a 404 on `/dashboard/settings?qbo=connected`** —
that page doesn't exist yet (Part 13 builds it). Don't panic; the connect already
succeeded on the server.

**[PERPLEXITY COMPUTER]**

```
Verify the QBO connection stored correctly. In the Supabase SQL editor at
https://supabase.com/dashboard/project/vvoyidhqlxjcuhhsdiyy/editor/sql, run:

  SELECT id, name,
         qbo_realm_id,
         qbo_environment,
         qbo_connected_at,
         qbo_refresh_token_encrypted IS NOT NULL AS token_present
  FROM orgs
  WHERE id = '<PASTE_ORG_ID>';

Report the row. Expected:
  qbo_realm_id        = '9341456849762719'
  qbo_environment     = 'sandbox'
  qbo_connected_at    = recent timestamp
  token_present       = true

BREAK-POINT PROBES:
A. Open DevTools in another tab, navigate to /api/qbo/connect again,
   tamper with the state cookie (edit the value via Application →
   Cookies), then let the redirect complete. Expected: /api/qbo/callback
   returns 401 (CSRF guard).
B. Try /api/qbo/connect?orgId=<SOME_OTHER_ORG_UUID> while signed in as
   the QA user. Expected: 401 or redirect to /login or an error.

Report.
```

**Done when:** [ ] `orgs` row has realm id, encrypted token, and connected_at set.

---

### Step 9B.2 — Seed account mappings (direct SQL, no UI yet)

Part 13 will give this a real UI. For now, seed directly. You need 6 QBO account IDs:

- COGS expense account
- Inventory asset account
- AR (Accounts Receivable)
- AP (Accounts Payable)
- Income account
- Default Item (a SalesItem)

**[CLAUDE CODE]**

```
Scaffold a one-shot discovery script at src/scripts/qbo-find-accounts.ts
for the Lotmonster project at F:\Projects\lotmonster.

Requirements:
- Reads QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, QBO_ENVIRONMENT,
  QBO_TOKEN_ENCRYPTION_KEY from process.env.
- Reads the caller's org_id from a CLI arg: `tsx src/scripts/qbo-find-accounts.ts <org_id>`.
- Uses src/lib/qbo/tokens.ts (getAccessToken) and src/lib/qbo/client.ts
  (qboJson) to query:
    SELECT * FROM Account WHERE Active = true STARTPOSITION 1 MAXRESULTS 100
  AND
    SELECT * FROM Item WHERE Active = true STARTPOSITION 1 MAXRESULTS 50
- Prints a two-section table to stdout:
  1) Accounts: Id | Name | AccountType | AccountSubType
  2) Items:    Id | Name | Type
- Does NOT mutate the DB. Read-only.

Add an npm script "qbo:accounts": "tsx src/scripts/qbo-find-accounts.ts".
Do not commit any secrets.

Acceptance: `npm run qbo:accounts <org_id>` prints a clean table of accounts
and items from Sandbox Company US 74a4.
```

**[USER]** Run it:

```bash
cd /f/Projects/lotmonster
npm run qbo:accounts <ORG_ID>
```

Pick these from the printed tables (the sandbox company's defaults work fine):

| Role | Typical AccountType / Name |
|---|---|
| COGS | Expense → "Cost of Goods Sold" |
| Inventory | Other Current Asset → "Inventory Asset" |
| AR | Accounts Receivable → "Accounts Receivable (A/R)" |
| AP | Accounts Payable → "Accounts Payable (A/P)" |
| Income | Income → "Sales of Product Income" |
| Default Item | From the Items table — "Sales" or "Services" or whatever generic SalesItem appears |

Then patch the `orgs` row in the SQL editor:

```sql
UPDATE orgs
SET qbo_cogs_account_id       = '<cogs_account_id>',
    qbo_inventory_account_id  = '<inventory_account_id>',
    qbo_ar_account_id         = '<ar_account_id>',
    qbo_ap_account_id         = '<ap_account_id>',
    qbo_income_account_id     = '<income_account_id>',
    qbo_default_item_id       = '<default_item_id>'
WHERE id = '<ORG_ID>';
```

**Done when:** [ ] All 6 columns set on the org row.

---

### Step 9B.3.a — Trigger journal entry sync (completed production run)

Pick a completed production run from 9A.9. Grab its UUID:

```sql
SELECT id, run_number, total_cogs, status
FROM production_runs
WHERE org_id='<ORG_ID>' AND status='completed'
ORDER BY completed_at DESC LIMIT 5;
```

**[USER]** get `CRON_SECRET` from Vercel env (or `.env.local`):

```bash
grep CRON_SECRET /f/Projects/lotmonster/.env.local
# or: vercel env pull .env.vercel && grep CRON_SECRET .env.vercel
```

Trigger the sync:

```bash
curl -sk --ssl-no-revoke -X POST "https://www.lotmonster.co/api/qbo/sync/journal-entry" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"productionRunId":"<RUN_UUID>"}'
```

**[PERPLEXITY COMPUTER]**

```
Verify the journal entry landed in QBO sandbox.

1. Check the response body from the curl above. Expected: HTTP 200 with
   { "qbo_journal_entry_id": "<id>" } or similar.
2. Supabase SQL editor — confirm the DB is updated:
     SELECT qbo_journal_entry_id FROM production_runs WHERE id='<RUN_UUID>';
   Expected: non-null.
3. Also:
     SELECT status, synced_at, error_message
     FROM qbo_sync_log
     WHERE org_id='<ORG_ID>' AND entity_type='journal_entry' AND entity_id='<RUN_UUID>';
   Expected: status='synced', synced_at set.
4. Log into the QBO sandbox UI: https://sandbox.qbo.intuit.com
   (company: Sandbox Company US 74a4). Navigate:
     Gear icon (top right) → Chart of Accounts → click the COGS account
     (Cost of Goods Sold) → scroll to the newest entry.
   Expected: a Journal Entry with today's date, memo referencing the run
   number (e.g. "Production run PR-2025-001"), debit amount equal to
   run.total_cogs.

IDEMPOTENCY PROBE:
5. Re-run the same curl. Expected: 200 with a no-op response (second call
   doesn't create a duplicate JE — the stored qbo_journal_entry_id guards
   against it).

Report all four verifications + the idempotency result.
```

**Done when:** [ ] 200 response, doc id stored on run, JE visible in QBO sandbox,
re-run is a no-op.

---

### Step 9B.3.b — Trigger invoice sync (shipped sales order)

Pick a shipped SO from 9A.11:

```sql
SELECT id, so_number, status, customer_name
FROM sales_orders
WHERE org_id='<ORG_ID>' AND status IN ('shipped','invoiced','delivered')
ORDER BY created_at DESC LIMIT 5;
```

**[USER]**

```bash
curl -sk --ssl-no-revoke -X POST "https://www.lotmonster.co/api/qbo/sync/invoice" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"salesOrderId":"<SO_UUID>"}'
```

**[PERPLEXITY COMPUTER]**

```
Verify invoice landed in QBO sandbox.

1. Response 200 with qbo_invoice_id.
2. DB:
     SELECT qbo_invoice_id, status FROM sales_orders WHERE id='<SO_UUID>';
   Expected: qbo_invoice_id non-null, status='invoiced' (promoted from shipped).
3. QBO sandbox UI: Sales → Invoices. Newest row should match:
   - Customer = the SO's customer (or find-or-created if new)
   - Lines = each SO line with correct qty and unit price
   - Total = SO total
4. qbo_sync_log for this entity: status='synced'.

IDEMPOTENCY PROBE:
5. Re-run curl. Expected: no-op.

Report.
```

**Done when:** [ ] 200, doc id stored, invoice visible in sandbox, re-run is a no-op.

---

### Step 9B.3.c — Trigger bill sync (received purchase order)

```sql
SELECT id, po_number, status, supplier
FROM purchase_orders
WHERE org_id='<ORG_ID>' AND status IN ('received','partial')
ORDER BY created_at DESC LIMIT 5;
```

**[USER]**

```bash
curl -sk --ssl-no-revoke -X POST "https://www.lotmonster.co/api/qbo/sync/bill" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"purchaseOrderId":"<PO_UUID>"}'
```

**[PERPLEXITY COMPUTER]**

```
Verify bill landed in QBO sandbox.

1. Response 200 with qbo_bill_id.
2. DB:
     SELECT qbo_bill_id FROM purchase_orders WHERE id='<PO_UUID>';
   Expected: non-null.
3. QBO sandbox: Expenses → Bills. Newest row should match vendor + line
   items + total.
4. qbo_sync_log row marked synced.

IDEMPOTENCY PROBE + FAILURE PROBES:
5. Re-run curl — no-op.
6. Remove the Authorization header (curl without -H Bearer): expected 401.
7. (OPTIONAL, DESTRUCTIVE — skip if nervous) In the QBO sandbox
   connection settings, revoke the connection. Try another sync curl.
   Expected: the route detects an expired refresh token
   (QBOTokenExpiredError), auto-disconnects the org (NULLs the token
   columns on orgs), writes status='failed' with a clear message on
   qbo_sync_log. If you do this probe you will need to re-run 9B.1 to
   reconnect before moving on.

Report.
```

**Done when:** [ ] 200, doc id stored, bill visible in sandbox, re-run is a no-op.

---

### Step 9B.4 — Disconnect flow

**[USER]** Still signed in. POST to disconnect:

```bash
curl -sk --ssl-no-revoke -X POST "https://www.lotmonster.co/api/qbo/disconnect" \
  -H "Cookie: <PASTE_YOUR_SESSION_COOKIE>"
```

(Or, if the route supports bearer auth for cron, use CRON_SECRET.)

**[PERPLEXITY COMPUTER]**

```
Verify the disconnect cleared credentials:

  SELECT qbo_realm_id, qbo_refresh_token_encrypted, qbo_connected_at
  FROM orgs WHERE id='<ORG_ID>';

Expected: all three NULL.

Then try a sync curl (any of 9B.3). Expected: 4xx with a
QBONotConnectedError message.

Report.
```

Then **reconnect** (repeat 9B.1) so downstream Parts have a working integration.

**Done when:** [ ] Disconnect nulls the fields; a follow-up sync fails cleanly;
you've re-connected.

---

### Part 9B — Pass criterion

All three sync routes successfully posted to sandbox. All three doc-ID columns
populated on their entity rows. Idempotency verified on all three. Disconnect
works. Org is reconnected and ready.

---

# Part 9 — SKUs + Finished Goods Inventory

| Field | Value |
|---|---|
| Why this part matters | The system currently conflates "what you make" (recipe) with "what you sell" (SKU). A 10-gal batch of hot sauce can't be filled into two bottle sizes today. Packaging (bottles, caps, labels) is invisible to COGS. Part 9 fixes all of that. This is the load-bearing part of v4. |
| Estimated days | ~8.5 |
| Prerequisites | Parts 9A + 9B green |
| Outputs | Migration 007 (wide) · `skus` + `production_run_outputs` + `sku_packaging` tables · polymorphic `lots` · `ingredients.kind` enum · SKU CRUD + BOM UI · rewritten `completeRun` (multi-SKU + packaging + COGS split + invariant check) · rewritten `shipSalesOrder` (real FEFO allocation) · QBO invoice sync with per-SKU Item fallback · migration 008 NOT-NULL cutover |

**Authoritative spec:** `docs/plans/2026-04-16-skus-and-finished-goods.md`. Every
milestone below operationalizes a slice of that spec. If you need to know
*why* a decision is the way it is, read the spec.

> **Rule of thumb:** the system stays runnable between every milestone below. If
> it doesn't, stop and recover before the next milestone.

Cross-team tags carried from Bob's plan:

- **[DANNY]** Migration 007 is wide. Run in a transaction with row-count asserts.
- **[DANNY]** Post-Part-9, `completeRun` writes to 5 tables atomically. Postgres
  RPC upgrade is more urgent — still phase-2, but noted louder.
- **[RAY]** UPC uniqueness per-org; XOR CHECK on `lots`; `ingredients.kind` lock
  after first lot; COGS invariant at completion (±$0.01); `shipSalesOrder`
  joins the overdraft-under-concurrency list.

---

### Step 9.1 — Migration 007: SKUs, finished goods, packaging, polymorphic lots

**[CLAUDE CODE]**

```
Create migration 007 at supabase/migrations/007_skus_and_finished_goods.sql
for the Lotmonster project at F:\Projects\lotmonster. Before writing,
READ:
- docs/plans/2026-04-16-skus-and-finished-goods.md (the authoritative spec)
- supabase/migrations/006_auto_create_org_on_signup.sql (pattern to mirror)
- supabase/migrations/001_initial_schema.sql (current schema + RLS pattern)

This migration MUST do ALL of the following in a single transaction, in
order, with row-count ASSERTs after each data change:

A. Create the `skus` table per the SKU plan's "table-by-table spec":
   - id, org_id, recipe_id (NULL), parent_sku_id (NULL), units_per_parent (NULL),
     kind CHECK IN ('unit','case','pallet'), name, upc NULL,
     fill_quantity NULL, fill_unit NULL, shelf_life_days NULL,
     retail_price NULL, qbo_item_id NULL, lot_prefix NULL,
     active boolean default true, notes, created_at, updated_at.
   - UNIQUE (org_id, upc) WHERE upc IS NOT NULL.
   - CHECK (kind IN ('unit','case','pallet')).
   - CHECK (kind = 'unit' OR parent_sku_id IS NOT NULL).
   - CHECK ((parent_sku_id IS NULL) = (units_per_parent IS NULL)).
   - Indexes: (org_id, name), (org_id, recipe_id) WHERE recipe_id IS NOT NULL.
   - Enable RLS. Four policies on current_org_id() with the NULL guard
     (see migration 001 for the exact pattern).

B. Create `production_run_outputs` per the spec:
   - id, org_id, production_run_id (ON DELETE CASCADE), sku_id, lot_id,
     quantity, cost_allocation_pct numeric(6,4),
     allocated_cogs_liquid, allocated_cogs_packaging, allocated_cogs_total,
     unit_cogs numeric(12,6), override_note NULL, created_at.
   - UNIQUE (production_run_id, sku_id)   -- [RAY] idempotency guard
   - Indexes: (org_id, production_run_id), (org_id, sku_id), (lot_id).
   - RLS + 4 policies.

C. Create `sku_packaging` per the spec:
   - id, org_id, sku_id (ON DELETE CASCADE), ingredient_id, quantity CHECK > 0,
     unit NULL, notes NULL, created_at, updated_at.
   - UNIQUE (sku_id, ingredient_id).
   - Indexes: (org_id, sku_id), (org_id, ingredient_id).
   - RLS + 4 policies.

D. Add `kind text NOT NULL DEFAULT 'raw' CHECK IN ('raw','packaging')` to
   ingredients. Backfill existing rows: UPDATE ingredients SET kind='raw';
   assert row count matches.

E. Extend `lots`:
   - ADD COLUMN sku_id uuid NULL REFERENCES skus(id)
   - ADD COLUMN production_run_id uuid NULL REFERENCES production_runs(id)
   - ALTER COLUMN ingredient_id DROP NOT NULL
   - Add CHECK: ((ingredient_id IS NOT NULL) <> (sku_id IS NOT NULL))
   - Drop the current lots_fefo_idx if present; create two replacements:
       lots_fefo_ingredient_idx: (org_id, ingredient_id, expiry_date ASC NULLS LAST)
         WHERE status='available' AND ingredient_id IS NOT NULL
       lots_fefo_sku_idx:        (org_id, sku_id, expiry_date ASC NULLS LAST)
         WHERE status='available' AND sku_id IS NOT NULL

F. Add sales_order_lines.sku_id uuid NULL REFERENCES skus(id).

G. Backfill DO block (MUST be in the same txn):
   - For each row in `recipes`, INSERT a SKU with:
       org_id       = recipe.org_id
       recipe_id    = recipe.id
       kind         = 'unit'
       name         = recipe.name
       lot_prefix   = upper(left(regexp_replace(recipe.name, '\W', '', 'g'), 6))
       active       = true
     Assert: row count of inserted SKUs equals row count of recipes.
   - UPDATE sales_order_lines sol
       SET sku_id = (SELECT s.id FROM skus s WHERE s.recipe_id = sol.recipe_id LIMIT 1)
       WHERE sol.sku_id IS NULL AND sol.recipe_id IS NOT NULL;
     Assert: every sales_order_line with recipe_id has sku_id.

H. Do NOT touch sales_order_lines.sku_id NOT NULL yet — that's migration 008.

Commit as supabase/migrations/007_skus_and_finished_goods.sql.

Acceptance:
- `npx supabase db diff` shows a clean diff matching the migration.
- `npx supabase db push --include-all` applies clean against staging.
- Post-apply, SELECT COUNT(*) FROM skus = SELECT COUNT(*) FROM recipes per org.
- Post-apply, no sales_order_lines row has NULL sku_id where recipe_id IS NOT NULL.
- All existing lots still satisfy the XOR CHECK (they have ingredient_id set,
  sku_id NULL).
```

**[USER]** Apply to staging:

```bash
cd /f/Projects/lotmonster
npx supabase db push --include-all
```

**[PERPLEXITY COMPUTER]**

```
Verify migration 007 applied cleanly in the Lotmonster Supabase project
(vvoyidhqlxjcuhhsdiyy). In the SQL editor run:

  -- count assertions
  SELECT
    (SELECT COUNT(*) FROM skus)                               AS skus,
    (SELECT COUNT(*) FROM recipes)                            AS recipes,
    (SELECT COUNT(*) FROM ingredients WHERE kind='raw')       AS raw,
    (SELECT COUNT(*) FROM ingredients WHERE kind='packaging') AS pkg,
    (SELECT COUNT(*) FROM sales_order_lines)                  AS sol,
    (SELECT COUNT(*) FROM sales_order_lines WHERE sku_id IS NULL) AS sol_null_sku;

  -- XOR check
  SELECT COUNT(*) FROM lots
  WHERE (ingredient_id IS NULL) = (sku_id IS NULL);
  -- expected 0

  -- RLS enabled
  SELECT c.relname, c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('skus','production_run_outputs','sku_packaging');
  -- all three relrowsecurity = true

Expected:
  skus == recipes
  pkg == 0 (no packaging rows yet, pre-seed)
  sol_null_sku == 0
  XOR violators == 0
  all three RLS flags = true

Report.
```

**Done when:** [ ] All five assertions pass.

---

### Step 9.2 — Regenerate TypeScript types

**[CLAUDE CODE]**

```
Regenerate the Lotmonster Supabase types:
  cd F:\Projects\lotmonster
  npx supabase gen types typescript --project-id vvoyidhqlxjcuhhsdiyy > src/types/database.ts

Verify the file now includes `skus`, `production_run_outputs`, and
`sku_packaging` table defs, plus the new `ingredients.kind` column.
Run `npm run build` once to confirm nothing fails typecheck.
```

**Done when:** [ ] `src/types/database.ts` contains the three new tables and
`ingredients.kind`. `npm run build` exits 0.

---

### Step 9.3 — Generalize FEFO allocator to `{ kind, id }`

**[CLAUDE CODE]**

```
Rewrite src/lib/fefo.ts at F:\Projects\lotmonster.

Current signature:
  allocateLots(ingredientId, quantityNeeded, orgId)
  previewAllocation(ingredientId, quantityNeeded, orgId)

New signature (both functions):
  allocateLots(target: { kind: 'ingredient' | 'sku'; id: string },
               quantityNeeded, orgId)
  previewAllocation(target: { kind: 'ingredient' | 'sku'; id: string },
                    quantityNeeded, orgId)

Internally the only change is which column is eq'd:
  if target.kind === 'ingredient': .eq('ingredient_id', target.id)
  if target.kind === 'sku':        .eq('sku_id',        target.id)

Everything else (sort order, decrement math, InsufficientStockError,
LotAllocation shape) stays identical.

Then grep the codebase for every call site of allocateLots /
previewAllocation and update them to the new signature. Expected call
sites (confirm by grep):
- src/lib/production/actions.ts (startRun) — use kind 'ingredient'
- src/lib/sales-orders/actions.ts (shipSalesOrder, which is about to
  be rewritten in 9.8 anyway — but fix the signature now so the build
  stays green)
- any preview routes under src/app/api/**

Acceptance:
- `grep -n "allocateLots(" src` returns zero call sites using the old
  positional ingredientId signature.
- `npm run build` exits 0.
- `npm run test -- fefo` — if any fefo tests exist, they still pass.
  If none exist, that's expected; do not add new ones in this step.
```

**Done when:** [ ] Grep is clean. Build is green. `startRun` still allocates raw
ingredients correctly (walk one run by hand to confirm).

---

### Step 9.4 — SKU schema + queries + actions (+ BOM CRUD)

**[CLAUDE CODE]**

```
Scaffold the SKU server layer at F:\Projects\lotmonster. Mirror the
ingredients pattern exactly (src/lib/ingredients/{schema,queries,actions}.ts).

Create:

1. src/lib/skus/schema.ts
   - Zod v4 schemas (use `error:` not `errorMap:`):
     * skuCreateSchema: { name, recipe_id?, kind, fill_quantity?, fill_unit?,
       shelf_life_days?, retail_price?, upc?, lot_prefix?, qbo_item_id?,
       notes? }
     * skuUpdateSchema: same, all optional
     * skuPackagingEntrySchema: { ingredient_id, quantity, unit?, notes? }
   - Type exports.

2. src/lib/skus/queries.ts
   - resolveOrgId helper (or re-export the one from
     src/lib/ingredients/queries.ts).
   - listSkus(orgId, params) — filter by kind, search by name, paginate.
     Include computed `current_stock` from SUM(lots.quantity_remaining)
     WHERE lots.sku_id = sku.id AND status='available'.
   - getSkuDetail(orgId, id) — returns sku row, its sku_packaging entries
     with joined ingredient name/unit, its recipe (if any), and its
     finished-goods lots (lots where sku_id = id).

3. src/lib/skus/actions.ts
   - createSku(orgId, input) — Zod-validate, insert.
   - updateSku(orgId, id, input) — Zod-validate, update.
   - deleteSku(orgId, id) — guard against deletion if any lot or
     sales_order_line references it.
   - setPackagingBOM(orgId, skuId, entries) — upsert semantics:
     DELETE current entries for sku, INSERT the new set. Each entry's
     ingredient_id MUST reference an ingredient with kind='packaging' —
     enforce this server-side by SELECTing the ingredient's kind and
     rejecting if 'raw'. Throw a clear "ingredient {id} is not
     packaging" error otherwise.

4. Tests: add src/lib/__tests__/skus.test.ts with minimal vitest
   coverage:
   - createSku happy path
   - setPackagingBOM rejects raw ingredient
   - deleteSku blocks when a lot references the sku
   Use mocks or an in-memory supabase stub; if that's awkward, skip and
   note this in the output.

Honor the project conventions: `await createClient()`, RLS-fenced writes
via admin client, resolve org from org_members (NOT from JWT claims).

Acceptance:
- `npm run build` exits 0.
- `npm run test -- skus` passes (or the test file is empty with a comment
  explaining why).
```

**Done when:** [ ] Files exist, build green, BOM rejection for raw ingredient works.

---

### Step 9.5 — SKU UI: list + create + detail + BOM editor

**[CLAUDE CODE]**

```
Build the SKU UI at F:\Projects\lotmonster, using Tailwind v4 + the
existing dark-mode component style from /dashboard/ingredients. The
sidebar already has a link to /dashboard/skus? If not, add one.

Pages to create:

1. src/app/dashboard/skus/page.tsx (list)
   - Table columns: Name, Kind (badge), UPC, Fill, Retail Price, On-hand
     units, Actions.
   - Filter by kind: All / Unit / Case / Pallet.
   - Search by name.
   - "New SKU" button → /dashboard/skus/new.
   - Empty state with CTA.

2. src/app/dashboard/skus/new/page.tsx
   - Form fields: name (req), recipe (optional dropdown, SELECT from
     recipes where org_id=current_org; label "Recipe (optional — for
     non-made goods, leave blank)"), kind (radio; phase 1 is always
     'unit' but render all 3 options disabled for the non-unit cases
     with a "coming in phase 2" tooltip), fill_quantity + fill_unit,
     shelf_life_days, retail_price, UPC, lot_prefix, qbo_item_id,
     notes.
   - Submit → createSku → redirect to /dashboard/skus/[id].

3. src/app/dashboard/skus/[id]/page.tsx (detail)
   - Header: name, kind badge, active toggle, edit button, delete button
     (disabled with tooltip if referenced).
   - Tabs or sections:
       Overview: all fields inline-editable
       Packaging BOM: list of entries + "Add component" button + delete
         per row. Ingredient picker MUST filter to kind='packaging' only
         (query server-side). Show quantity input per row + "x per unit"
         label.
       Finished Lots: table of lots.sku_id = this sku, sorted by FEFO.
         Columns: lot #, received, expiry, qty remaining, unit_cost.
       Production History: production_run_outputs joined to runs, showing
         qty per run, unit_cogs, completed_at.

Acceptance:
- Can create a SKU from /new, see it in the list.
- Can open detail, add 3 packaging BOM entries (bottle, cap, label),
  save, reload page, entries persist.
- Trying to add a raw ingredient to the BOM is rejected (server error
  surfaces as a toast).

IMPORTANT: do NOT lift v3-era component patterns blindly — this is Next.js
16 App Router with proxy.ts. Use server components for data fetching,
client components only where interactivity requires it. Follow the
pattern from /dashboard/ingredients/[id]/page.tsx.
```

**Done when:** [ ] End-to-end: create a "Jalapeño Classic 16oz" SKU, attach 3
packaging components, see it on the list with on-hand = 0.

---

### Step 9.6 — Ingredients: `kind` tab + `kind` radio on /new

**[CLAUDE CODE]**

```
Small UI + server tweaks at F:\Projects\lotmonster:

1. src/app/dashboard/ingredients/page.tsx — add a segmented filter tab
   at the top: "Raw" | "Packaging" | "All". Default to "Raw" for
   back-compat. Pass the filter through listIngredients.

2. src/lib/ingredients/queries.ts — listIngredients now accepts
   { kind?: 'raw' | 'packaging' } and filters accordingly when set.

3. src/app/dashboard/ingredients/new/page.tsx — add a kind radio (Raw /
   Packaging) at the top of the form. Default to Raw. Pass kind into the
   create server action.

4. src/lib/actions/ingredients.ts — the create action must validate and
   accept kind. Add a server-side guard: if the kind is being mutated
   on an existing ingredient, refuse if ANY lot references it (see
   [RAY] item about `ingredients.kind` lock-after-first-use in the SKU
   plan).

Acceptance:
- Can create a packaging ingredient via /new.
- /dashboard/ingredients "Packaging" tab shows it.
- Trying to PATCH kind on an ingredient with existing lots returns a
  clear error ("cannot change kind: ingredient has lots").
```

**Done when:** [ ] Can create packaging ingredients via UI. Segmented tab filters
the list. `kind` lock enforced.

---

### Step 9.7 — Packaging ingredients + lots (seed for Part 9 testing)

**[USER]** Via the UI you just built: create 6 packaging ingredients and 12
packaging lots to exercise the BOM path.

- 16oz Hot Sauce Bottle (each, $0.32) — create one lot of 500
- 5oz Hot Sauce Bottle (each, $0.22) — 500
- Cap (each, $0.05) — 1000
- Front Label (each, $0.08) — 1000
- Back Label (each, $0.04) — 1000
- Shipping Carton (each, $0.95) — 100

Then create 4 SKUs with BOMs:

- Jalapeño Classic 16oz (recipe = Jalapeño Classic, fill 16 fl_oz, prefix JAL16,
  retail $9.99) → BOM: 1 bottle, 1 cap, 1 front label, 1 back label
- Jalapeño Classic 5oz  (recipe = Jalapeño Classic, fill 5 fl_oz, prefix JAL5,
  retail $4.99) → same BOM but 5oz bottle
- Habanero Blaze 16oz (create a second recipe first if you don't have one, fill
  16 fl_oz, prefix HAB16)
- Habanero Blaze 5oz   (fill 5 fl_oz, prefix HAB5)

**Done when:** [ ] 6 packaging ingredients, 12 packaging lots, 4 SKUs with BOMs all
visible in their respective UIs.

---

### Step 9.8 — Rewrite `completeRun` (multi-SKU + packaging + COGS split + invariant)

This is the load-bearing milestone. Break it into sub-steps.

#### Step 9.8.a — Rewrite the server action

**[CLAUDE CODE]**

```
Rewrite src/lib/production/actions.ts `completeRun` at F:\Projects\lotmonster.

READ FIRST:
- docs/plans/2026-04-16-skus-and-finished-goods.md — the full Q4 + Q8 + Q10
  sections
- src/lib/production/actions.ts (current completeRun)
- src/lib/fefo.ts (the new generalized allocator)

Current signature:
  completeRun(orgId, runId, actualYield, notes)

NEW signature:
  completeRun(
    orgId: string,
    runId: string,
    outputs: Array<{
      skuId: string,
      quantity: number,        // operator-entered yield
      expiryDate?: string,     // YYYY-MM-DD; defaults to today + sku.shelf_life_days
      liquidPctOverride?: number,  // optional operator override on liquid split
      overrideNote?: string,
    }>,
    notes: string | null
  )

Implementation requirements:

1. Validate: run exists, status='in_progress'. outputs non-empty. Every
   output.skuId belongs to this org. Every output.quantity > 0.

2. Compute liquid_total:
     SELECT SUM(line_cost) FROM production_run_lots prl
     JOIN lots l ON l.id = prl.lot_id
     JOIN ingredients i ON i.id = l.ingredient_id
     WHERE prl.production_run_id = runId AND i.kind = 'raw'
   (This is what startRun already consumed.)

3. Compute liquid allocation:
     volume_share(sku) = (sku.fill_quantity * output.quantity)
                       / sum(sku.fill_quantity * output.quantity across outputs)
   If any output.liquidPctOverride is set, use the overrides (must sum to
   1.0 ±0.0001). Log old/new on output.override_note.

   allocated_cogs_liquid(sku) = liquid_total * volume_share(sku)

4. Consume packaging FEFO per output SKU:
   For each output:
     SELECT * FROM sku_packaging WHERE sku_id = output.skuId
     For each BOM entry:
       need = entry.quantity * output.quantity
       allocations = allocateLots({ kind:'ingredient', id:entry.ingredient_id },
                                  need, orgId)
       (throws InsufficientStockError if short — catch and include SKU
        name + ingredient name + shortfall in the user-visible error)
       For each allocation:
         - decrement lots.quantity_remaining; mark depleted if 0
         - INSERT production_run_lots (same shape as raw consumption)

   Sum across: allocated_cogs_packaging(sku) = sum of (alloc.qty * alloc.unit_cost)

5. For each output SKU:
     unit_cogs = (allocated_cogs_liquid + allocated_cogs_packaging) / quantity
     Generate lot number:
       prefix = sku.lot_prefix || upper(left(regexp_replace(sku.name,'\W','','g'), 6))
       candidate = `${prefix}-${YYYYMMDD}-${nnn}` where nnn = next available
     Insert lots row with sku_id, production_run_id, quantity_received=quantity,
       quantity_remaining=quantity, unit_cost=unit_cogs, expiry_date =
       output.expiryDate ?? (today + sku.shelf_life_days) (null if no
       shelf_life_days and no override), status='available'.
     Insert production_run_outputs row with all 4 cost columns populated.

6. Sum run.total_cogs = liquid_total + sum(allocated_cogs_packaging). Update
   production_runs: status='completed', completed_at=now, actual_yield=
   sum(output.quantity), total_cogs, cost_per_unit = null (deprecated for
   multi-SKU; leave the column, just don't populate), waste_pct based on
   run.expected_yield vs sum(output.quantity).

7. INVARIANT CHECK — before commit (or before returning):
     sum(production_run_outputs.allocated_cogs_total)  ==  run.total_cogs
       ==  sum(production_run_lots.line_cost)   within ±$0.01
   If the invariant fails, THROW a RunStateError with the three values in
   the message. Do NOT commit on failure. (Sequential-writes model —
   best-effort rollback matches startRun's pattern; call
   rollbackCompletion to un-decrement packaging lots and delete rows
   inserted in this step.)

8. Insert qbo_sync_log row for journal_entry (same as before).

Maintain the best-effort rollback pattern from startRun. Keep the existing
RunStateError + InsufficientStockError error types. Add helpful error
messages for packaging shortfalls that name the SKU + component.

Acceptance (covered by 9.8.b tests):
- A unit-test fixture with a 10-gal batch filled as 40×16oz + 20×32oz
  produces two finished lots with the spec's expected unit-COGS
  ($1.90 and $3.55 given the BOM costs in the seeder).
- Missing packaging throws with a clear message referencing the SKU.
- Invariant violation throws and does NOT mark the run completed.
```

#### Step 9.8.b — Unit tests for completeRun

**[CLAUDE CODE]**

```
Add unit tests at src/lib/__tests__/production-complete-run.test.ts
for F:\Projects\lotmonster.

Use a lightweight Supabase mock (follow the cogs.test.ts pattern if one
exists, otherwise roll a minimal stub).

Test fixture:
- recipe liquid_total = $120.00 (from startRun already consumed)
- two SKUs: 16oz (fill_quantity=16 fl_oz) and 32oz (fill_quantity=32 fl_oz)
- BOM for each: 1 bottle + 1 cap + 1 front label
- packaging unit costs:
    16oz bottle = $0.32; 32oz bottle = $0.55; cap = $0.05; label = $0.08
- outputs: 40×16oz + 20×32oz

Expected results:
- liquid share: 16oz = (16*40)/(16*40+32*20) = 640/1280 = 0.5
                32oz = 0.5
- allocated_cogs_liquid: $60 + $60
- allocated_cogs_packaging: 16oz: 40*(0.32+0.05+0.08) = $18 ;
                            32oz: 20*(0.55+0.05+0.08) = $13.60
- allocated_cogs_total: $78.00 + $73.60 = $151.60
- unit_cogs: 16oz = $78.00/40 = $1.95 ; 32oz = $73.60/20 = $3.68

(Exact numbers depend on the seeder BOM costs — the spec's $1.90 / $3.55
example uses slightly different packaging costs. Either use these values
or the spec's — pick ONE and pin it in the fixture.)

Tests to write:
1. happy path — outputs match expected unit_cogs, production_runs.total_cogs
   equals sum of liquid + packaging.
2. packaging shortfall — set 16oz bottle lot to 30 units; calling
   completeRun with output.quantity=40 throws InsufficientStockError
   naming "16oz Hot Sauce Bottle" and "Jalapeño Classic 16oz".
3. invariant failure — monkey-patch one of the inserts to store a wrong
   allocated_cogs_total; expect the invariant check to throw.
4. operator override on liquid pct — outputs sum to 1.0, overrideNote
   populated on production_run_outputs.

Acceptance: `npm run test -- production-complete-run` all pass.
```

**Done when:** [ ] Tests green. Running the flow by hand on the UI (step 9.9 next)
reproduces the expected math.

---

### Step 9.9 — Production run completion UI

**[CLAUDE CODE]**

```
Update src/app/dashboard/production-runs/[id]/page.tsx at
F:\Projects\lotmonster.

The current "Complete Run" button opens a single-field dialog
(actual_yield + notes). Replace with a multi-section dialog:

1. HEADER: run number, recipe name, expected_yield (read-only).

2. SKU YIELDS SECTION:
   - Pre-populated with each SKU linked to the run's recipe:
       SELECT * FROM skus WHERE org_id=current AND recipe_id=run.recipe_id
         AND active=true
   - For each SKU, render a row:
       SKU name · Quantity input · Expiry date input (pre-filled with
       today + sku.shelf_life_days, editable; blank if sku.shelf_life_days
       is null).
   - "Add SKU yield" button: lets the operator add a different SKU
     (picker of all active SKUs for this org) — for the "we filled some
     of these into a different brand's bottle" edge case. Phase 1 can
     also just hide this button and only show recipe-linked SKUs; pick
     the simpler path for now.

3. LIVE COST-SPLIT PREVIEW (reactive to yield inputs):
   - For each SKU row, show:
       Liquid COGS share: $X.XX ({Y}% of liquid_total)
       Packaging COGS:    $Z.ZZ  (breakdown on hover: bottle + cap + labels)
       Total COGS:        $X+Z
       Unit COGS:         $(X+Z)/quantity
   - Packaging shortfall warning: if any BOM component is short, render
     a red banner: "Cannot complete: 16oz Hot Sauce Bottle has only
     X available but requires Y for this yield." Complete button
     disabled while any shortfall is detected.

4. LIQUID SPLIT OVERRIDE (collapsed by default, operator opens):
   - Sliders or numeric % inputs per SKU. Must sum to 100% ±0.01.
     Red validation if not.
   - Textarea: "Override note" (required if any % differs from default
     by >0.01).

5. NOTES TEXTAREA (existing).

6. COMPLETE BUTTON → POST /api/production-runs/[id]/complete with:
     { outputs: [{ skuId, quantity, expiryDate, liquidPctOverride?,
                    overrideNote? }], notes }

Update src/app/api/production-runs/[id]/complete/route.ts to call the new
completeRun signature.

Use server-side rendering for the SKU list + initial data; client-side
for the reactive preview math.

Acceptance (hand-walked in step 9.10):
- Starting from an in_progress run, the dialog loads with the recipe's
  SKUs pre-populated.
- Entering yields recomputes the cost split live.
- Short packaging blocks the submit.
```

**Done when:** [ ] Dialog renders with SKU rows + live preview. Shortfalls surface
and block.

---

### Step 9.10 — Verify multi-SKU completion end-to-end

**[USER]** Drive the following by hand in production:

1. Start a new production run on "Jalapeño Classic" with batch_multiplier = 1
   (recipe yields 100 bottles worth of liquid — 640 fl oz).
2. Click "Start Run". Confirm raw lots decrement.
3. Click "Complete Run". In the dialog:
   - Add yield: Jalapeño Classic 16oz × 16
   - Add yield: Jalapeño Classic 5oz  × 32
   - Leave expiry dates at their pre-filled defaults.
4. Watch the live preview: should show 16oz ~$1.90-ish, 5oz ~$0.85-ish (numbers
   depend on exact lot costs you seeded).
5. Submit.

**[PERPLEXITY COMPUTER]**

```
Verify the multi-SKU completion worked.

In Supabase SQL editor:

  -- outputs
  SELECT
    s.name, pro.quantity, pro.allocated_cogs_liquid,
    pro.allocated_cogs_packaging, pro.allocated_cogs_total, pro.unit_cogs
  FROM production_run_outputs pro
  JOIN skus s ON s.id = pro.sku_id
  WHERE pro.production_run_id = '<RUN_UUID>'
  ORDER BY s.name;

  -- finished lots
  SELECT lot_number, sku_id, quantity_received, unit_cost, expiry_date
  FROM lots WHERE production_run_id = '<RUN_UUID>' ORDER BY lot_number;

  -- invariant
  SELECT
    (SELECT total_cogs FROM production_runs WHERE id='<RUN_UUID>')       AS run_total,
    (SELECT SUM(allocated_cogs_total) FROM production_run_outputs
      WHERE production_run_id='<RUN_UUID>')                              AS out_sum,
    (SELECT SUM(line_cost) FROM production_run_lots
      WHERE production_run_id='<RUN_UUID>')                              AS lots_sum;

Assert all three invariant values are equal within $0.01.

Confirm packaging lots decremented: pick one packaging ingredient (e.g.
16oz bottle) and check quantity_remaining across its lots went DOWN by
16 (since we made 16×16oz).

Confirm qbo_sync_log row was written with entity_type='journal_entry'.

Report.
```

**Done when:** [ ] Two finished lots exist. Invariant holds. Packaging lots
decremented. Sync log row written.

---

### Step 9.11 — Rewrite `shipSalesOrder` to real FEFO allocation

**[CLAUDE CODE]**

```
Rewrite src/lib/sales-orders/actions.ts `shipSalesOrder` at
F:\Projects\lotmonster.

READ FIRST:
- The current shipSalesOrder and the free-text lot_numbers_allocated
  pattern.
- src/lib/fefo.ts (generalized allocator).

NEW behavior:
- Input: { salesOrderId, carrier?, trackingNumber? }. NO free-text lot
  chips from the UI anymore.
- For each sales_order_line:
    - Require line.sku_id is set (post-007 backfill, it always is).
    - allocations = allocateLots({ kind:'sku', id: line.sku_id },
                                 line.quantity, orgId)
      (throws InsufficientStockError if short — surface with SKU name).
    - For each allocation: decrement lots.quantity_remaining, mark
      depleted if 0.
    - Write the allocated lot numbers back onto
      sales_order_lines.lot_numbers_allocated (still TEXT[] until phase
      2 adds the junction table; this is a back-compat bridge).
- Update sales_orders: status='shipped', shipped_at=now, carrier,
  tracking_number.
- Insert qbo_sync_log row for entity_type='invoice' as before.
- Best-effort rollback on mid-ship failure, matching startRun's pattern.

Delete the old free-text lot chip handling on the API side.

Acceptance:
- Shipping an SO without enough finished inventory throws a clear
  "Insufficient finished stock: Jalapeño Classic 16oz needs X, only Y
  available" error.
- Shipping an SO with enough stock decrements finished lots and marks
  depleted ones.
- qbo_sync_log invoice row still written.
- Old tests (if any) still pass; update as needed.
```

**Done when:** [ ] `shipSalesOrder` allocates against `sku_id`. Garbage lot numbers
can no longer be submitted.

---

### Step 9.12 — SO UI update: product picker → SKU; ship modal uses allocator

**[CLAUDE CODE]**

```
Update at F:\Projects\lotmonster:

1. src/app/dashboard/sales-orders/new/page.tsx — line item product picker
   switches from recipe → SKU:
   - Dropdown lists all active unit SKUs for the current org.
   - Display: "{sku.name} — on-hand: X units @ ${sku.retail_price}"
   - Pre-fill unit_price from sku.retail_price; operator can still
     override.
   - Line row stores sku_id (and leaves recipe_id NULL — post-007 we
     populate from sku.recipe_id on save for back-compat until
     migration 008/009 drops the column).

2. src/app/dashboard/sales-orders/[id]/page.tsx — the Ship modal:
   - Remove the free-text lot chip inputs.
   - Render per-line: SKU name, qty, "will be drawn FEFO from: [preview
     of the allocation]" (call previewAllocation server-side).
   - If any line is short, render a red banner and disable submit.
   - "Confirm Ship" POSTs to the existing ship route (which now calls
     the new shipSalesOrder).

Acceptance: create an SO via /new using a SKU picker. Ship it without
typing any lot numbers.
```

**Done when:** [ ] New SO flow + Ship flow use SKUs and real allocation end-to-end.

---

### Step 9.13 — Update QBO invoice sync for per-SKU item ID fallback

**[CLAUDE CODE]**

```
Update src/app/api/qbo/sync/invoice/route.ts at F:\Projects\lotmonster.

Current behavior: every invoice line uses org.qbo_default_item_id +
recipe name as description.

New behavior: for each line:
  itemId    = sku.qbo_item_id || org.qbo_default_item_id
  lineDescr = sku.name

If both are null, fail fast with a clear error: "No QBO item mapping for
SKU {sku.name} and no default Item configured on the org."

Do NOT attempt to create QBO Items from here — phase 3 concern.

Acceptance: shipping an SO with a SKU whose qbo_item_id is NULL still
syncs using the default. Shipping with qbo_item_id set uses the
per-SKU override. Both visible in the sandbox UI.
```

**Done when:** [ ] Invoice sync posts with SKU-level override when set, default
otherwise.

---

### Step 9.14 — Update traceability for polymorphic lots

**[CLAUDE CODE]**

```
Update src/lib/traceability.ts at F:\Projects\lotmonster.

The three exports (traceForward, traceReverse, traceRun) currently
assume lot.ingredient_id is set. Post-007 a lot can be either an
ingredient lot (raw or packaging) OR a finished-goods lot (has sku_id).

Update each function:

- traceForward(lotInput): accepts a lot by number or id. If
  lot.ingredient_id is set, trace forward through production_run_lots →
  production_runs → production_run_outputs → finished lots → SOs. If
  lot.sku_id is set, start from the middle — it's already a finished
  lot; trace forward to SOs via lot_numbers_allocated (phase-1 bridge)
  or, post-phase-2, via sales_order_line_lots.

- traceReverse(soInput): unchanged semantically but now resolves through
  finished lots to the production runs that made them, then to the raw +
  packaging lots consumed by those runs.

- traceRun(runInput): middle-out. Inputs side = raw + packaging lots
  consumed. Outputs side = finished lots produced + sales_order_lines
  that referenced those finished lots.

Update the corresponding /api/traceability route and /dashboard/
traceability UI to render the new polymorphic shape. Flow arrows now
have 1–2 more stages: raw lot → run → finished lot → SO. Render
finished lots with a different color than raw lots (e.g. blue for
finished, green for raw).

Acceptance: searching a finished lot number (e.g. JAL16-20260425-001)
renders raw lots consumed → run → finished lot (highlighted) → SO.
Searching a raw lot number renders forward through any finished lots it
helped create.
```

**Done when:** [ ] Traceability handles finished lots. Hand-walk from a raw
habanero lot number through the production run you did in 9.10 to the finished
16oz lot.

---

### Step 9.15 — Migration 008: NOT-NULL `sales_order_lines.sku_id`

After Part 9's app code has been shipped to prod and verified for at least one
successful round of SO create + ship, tighten the schema.

**[CLAUDE CODE]**

```
Create supabase/migrations/008_sku_id_not_null.sql at
F:\Projects\lotmonster.

ALTER TABLE sales_order_lines
  ALTER COLUMN sku_id SET NOT NULL;
ALTER TABLE sales_order_lines
  ALTER COLUMN recipe_id DROP NOT NULL;

The recipe_id column stays for one more deploy as safety net. Migration
009 (phase 2) drops it.

Acceptance: apply with `npx supabase db push`. Confirm no SO line has a
NULL sku_id pre-flight. If any exist, refuse to apply and report.
```

**[USER]**

```bash
# safety check first
psql "<SUPABASE_CONN>" -c "SELECT COUNT(*) FROM sales_order_lines WHERE sku_id IS NULL"
# expect 0

npx supabase db push --include-all
```

**Done when:** [ ] Migration applied. Existing SOs still render. New SOs require a
SKU at the schema level.

---

### Step 9.16 — End-to-end contest-scenario smoke

**[PERPLEXITY COMPUTER]**

```
Walk this end-to-end smoke test on https://www.lotmonster.co as the
QA org:

1. Create a recipe "Jalapeño Classic" (if not already).
2. Create 2 SKUs for it: 16oz (fill 16 fl_oz, prefix JAL16, retail $9.99,
   shelf_life_days 365) and 5oz (fill 5 fl_oz, prefix JAL5, retail $4.99,
   shelf_life_days 365).
3. For each SKU, set a packaging BOM: 1 bottle (correct size), 1 cap,
   1 front label, 1 back label.
4. Confirm raw + packaging inventory exists.
5. Create and start a production run on the recipe.
6. Complete the run with mixed yield: 16 × 16oz + 32 × 5oz. Leave expiry
   at default. Submit.
7. Confirm:
   - 2 finished lots created, FEFO-sorted
   - production_run_outputs has 2 rows with correct splits
   - Invariant holds (run.total_cogs = sum of outputs = sum of
     production_run_lots)
   - Packaging lots decremented by 16/32 as appropriate
   - qbo_sync_log has a pending journal_entry row
8. Create a sales order: 1 line × 5 × JAL16-something. Confirm.
9. Ship the SO. Watch FEFO draw from the finished lot.
10. Confirm:
    - Finished lot decremented by 5
    - sales_order.status = 'shipped'
    - qbo_sync_log has a pending invoice row
11. Manually trigger invoice sync (9B.3.b curl). Confirm it posts to
    sandbox with the correct SKU name on the line, and uses the
    qbo_default_item_id (since the SKU's qbo_item_id is still NULL).
12. Trace the finished lot at /dashboard/traceability. Confirm the full
    chain renders: raw habanero lots → PR → finished JAL16 lot → SO →
    customer.

Report pass/fail per step.
```

**Done when:** [ ] All 12 steps green. **This is the Part 9 definition of done.**

---

# Part 10 — AI Assistant with Tool Use (Re-Specced for SKUs)

| Field | Value |
|---|---|
| Why this part matters | The AI assistant is how the contest demo goes from "you built inventory software" to "you built AI-native inventory software." Post-Part-9 the tool set must understand SKUs, finished lots, and packaging — without that, answers will be wrong. |
| Estimated days | ~4.5 |
| Prerequisites | Parts 9A, 9B, 9 all green. Finished-goods lots and packaging ingredients exist in the test org. |
| Outputs | Migrations 009 (11 AI functions) + 010 (readonly role + wrapper) · `/api/ai/query` route · `/dashboard/ai` chat page · 5 suggested-question chips all return real data |

Carried from v3 Part 9 style. Tool schemas are freshly re-specced; Postgres
function patterns lifted from v3. The `execute_ai_query` wrapper is a v3 pattern
that's still correct — we're just renumbering its migration.

---

### Step 10.1 — Design the 11 tool schemas

The 11 schemas are inlined below in Anthropic `tool_use` format. They map
1:1 to the Postgres functions defined in step 10.2 / migration 009.

**Important: `org_id` is deliberately NOT in any `input_schema`.** The
wrapper route at step 10.4 (`/api/ai/query`) resolves `org_id` from the
authenticated session via the same `resolveOrgId` helper used elsewhere
and injects it into `params` before calling `execute_ai_query` (see
step 10.3). The model never sees org_id, never guesses it, never gets
to override it. This is the security perimeter.

A second note on compatibility: **do not pass the `thinking` parameter
when `tools` is set.** Extended thinking and tool_use are not compatible
in `claude-sonnet-4-6` — calls will either error or silently drop one
of the two features. The route in step 10.4 explicitly omits `thinking`.

**[CLAUDE CODE]**

```
Create src/lib/ai/tools.ts at F:\Projects\lotmonster with the exact
scaffold below. Do not modify the schemas — they are the contract the
rest of Part 10 is built against.

import type Anthropic from '@anthropic-ai/sdk';

export const lotmonsterTools: Anthropic.Tool[] = [
  // ...paste the 11-object JSON array from below here, verbatim...
];
```

The 11-tool array (copy-paste into `lotmonsterTools`):

```json
[
  {
    "name": "get_cogs_summary",
    "description": "Returns total COGS for a date range, split into liquid and packaging components, plus a per-recipe breakdown. Use when the user asks about cost of goods sold, margins, how much was produced, or production cost this week/month/quarter.",
    "input_schema": {
      "type": "object",
      "properties": {
        "start_date": {
          "type": "string",
          "format": "date",
          "description": "Inclusive start of the COGS window, YYYY-MM-DD."
        },
        "end_date": {
          "type": "string",
          "format": "date",
          "description": "Inclusive end of the COGS window, YYYY-MM-DD."
        }
      },
      "required": ["start_date", "end_date"]
    }
  },
  {
    "name": "get_expiring_lots",
    "description": "Returns lots (raw ingredients, packaging, AND finished goods) expiring within a given number of days. Each row tags source_kind as 'raw', 'packaging', or 'finished'. Use when the user asks about expiry, spoilage, what's about to go bad, or finished goods with short shelf life.",
    "input_schema": {
      "type": "object",
      "properties": {
        "days_ahead": {
          "type": "integer",
          "minimum": 1,
          "maximum": 365,
          "description": "Look-ahead window in days from today. Defaults to 30 if omitted."
        }
      },
      "required": []
    }
  },
  {
    "name": "get_low_stock_ingredients",
    "description": "Returns ingredients currently below their low-stock threshold, including packaging components like bottles, caps, and labels. Each row includes `kind` ('raw' or 'packaging') so you can phrase packaging vs raw differently. Use when the user asks about reorders, stock levels, what to buy, or what's running out.",
    "input_schema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "get_ingredient_cost_history",
    "description": "Returns the cost history (by lot) for a single ingredient — every lot ever received with received_date, unit_cost, and supplier. Use when the user asks how an ingredient's price has trended, or why COGS moved on a specific input.",
    "input_schema": {
      "type": "object",
      "properties": {
        "ingredient_id": {
          "type": "string",
          "format": "uuid",
          "description": "The ingredient UUID. Call get_low_stock_ingredients or get_inventory_valuation first if you only know the name."
        }
      },
      "required": ["ingredient_id"]
    }
  },
  {
    "name": "get_production_run_detail",
    "description": "Returns full detail for one production run: recipe, raw lots consumed, packaging lots consumed, every output SKU produced with its yield, and per-output liquid/packaging COGS split. Use when the user asks about a specific run (PR-YYYY-NNN), a batch's breakdown, or why one run cost more than another.",
    "input_schema": {
      "type": "object",
      "properties": {
        "run_number": {
          "type": "string",
          "description": "The production run number, e.g. 'PR-2026-001'. Case-sensitive."
        }
      },
      "required": ["run_number"]
    }
  },
  {
    "name": "get_recipe_cost_estimate",
    "description": "Returns a forward-looking per-batch COGS estimate for a recipe, broken out by each SKU the recipe can produce (factoring each SKU's packaging BOM). Use when the user asks what a batch WILL cost, per-unit pricing decisions, or margin planning before producing.",
    "input_schema": {
      "type": "object",
      "properties": {
        "recipe_id": {
          "type": "string",
          "format": "uuid",
          "description": "The recipe UUID."
        }
      },
      "required": ["recipe_id"]
    }
  },
  {
    "name": "get_sales_summary",
    "description": "Returns total revenue, order count, top customers, and top finished SKUs for a date range. Use when the user asks about sales, revenue, best customers, or best-selling products.",
    "input_schema": {
      "type": "object",
      "properties": {
        "start_date": {
          "type": "string",
          "format": "date",
          "description": "Inclusive start of the sales window, YYYY-MM-DD."
        },
        "end_date": {
          "type": "string",
          "format": "date",
          "description": "Inclusive end of the sales window, YYYY-MM-DD."
        }
      },
      "required": ["start_date", "end_date"]
    }
  },
  {
    "name": "get_lot_traceability",
    "description": "Returns the forward trace for a single lot number — from the starting lot (raw or finished) through production runs, finished lots, SKUs, and sales orders (with customers). Use when the user asks about a recall, where a lot went, or who received product from lot X.",
    "input_schema": {
      "type": "object",
      "properties": {
        "lot_number": {
          "type": "string",
          "description": "The exact lot number string, e.g. 'JAL-20260401-001' or 'JAL16-20260410-001'. Exact match only — no wildcards."
        }
      },
      "required": ["lot_number"]
    }
  },
  {
    "name": "get_inventory_valuation",
    "description": "Returns total inventory value at cost — split into raw, packaging, and finished-goods buckets — plus a per-ingredient and per-SKU breakdown. Use when the user asks what inventory is worth, balance-sheet questions, or 'how much product do we have on hand'.",
    "input_schema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "get_supplier_spend",
    "description": "Returns total spend and PO count by supplier for a date range. Use when the user asks about vendor spend, top suppliers, or procurement cost.",
    "input_schema": {
      "type": "object",
      "properties": {
        "start_date": {
          "type": "string",
          "format": "date",
          "description": "Inclusive start of the spend window, YYYY-MM-DD."
        },
        "end_date": {
          "type": "string",
          "format": "date",
          "description": "Inclusive end of the spend window, YYYY-MM-DD."
        }
      },
      "required": ["start_date", "end_date"]
    }
  },
  {
    "name": "get_finished_goods_status",
    "description": "Returns finished-goods inventory by SKU — total on-hand units (with case equivalents where a case_pack is defined), earliest expiry, lot count, retail price, and on-hand value at cost. Pass an sku_id for one SKU's detail plus the backing lots; omit it to list every finished SKU with positive stock. Use when the user asks 'how many cases of X can I sell', finished-goods availability, or what's ready to ship.",
    "input_schema": {
      "type": "object",
      "properties": {
        "sku_id": {
          "type": "string",
          "format": "uuid",
          "description": "Optional. If provided, returns detail + backing lots for this SKU only. If omitted, returns one row per finished SKU with positive on-hand stock."
        }
      },
      "required": []
    }
  }
]
```

**Done when:** [ ] `src/lib/ai/tools.ts` exists, exports `lotmonsterTools` typed as `Anthropic.Tool[]`, and `tsc --noEmit` is clean.

---

### Step 10.2 — Migration 009: 11 Postgres functions

**[CLAUDE CODE]**

```
Create supabase/migrations/009_ai_functions.sql at F:\Projects\lotmonster.

For each of the 11 tools in step 10.1, write a Postgres function:
- LANGUAGE plpgsql
- SECURITY DEFINER
- SET search_path = public
- Scoped to p_org_id in the signature (caller's route injects it)
- Return jsonb when the shape is a tree (breakdowns, traceability); return
  TABLE (...) when it's a list
- GRANT EXECUTE to authenticated (the route will call via rpc under an
  authenticated session — the readonly role wrapper comes in 010).

Function signatures:

1. get_cogs_summary(p_org_id uuid, p_start_date date, p_end_date date)
   RETURNS jsonb
2. get_expiring_lots(p_org_id uuid, p_days_ahead int DEFAULT 30)
   RETURNS TABLE (lot_number text, source_kind text, source_name text,
                  expiry_date date, quantity_remaining numeric, unit text,
                  days_until_expiry int)
3. get_low_stock_ingredients(p_org_id uuid)
   RETURNS TABLE (ingredient_name text, kind text, current_stock numeric,
                  threshold numeric, unit text, deficit numeric)
4. get_ingredient_cost_history(p_org_id uuid, p_ingredient_id uuid)
   RETURNS TABLE (lot_number text, received_date date, unit_cost numeric,
                  supplier text)
5. get_production_run_detail(p_org_id uuid, p_run_number text)
   RETURNS jsonb
6. get_recipe_cost_estimate(p_org_id uuid, p_recipe_id uuid)
   RETURNS jsonb
7. get_sales_summary(p_org_id uuid, p_start_date date, p_end_date date)
   RETURNS jsonb
8. get_lot_traceability(p_org_id uuid, p_lot_number text)
   RETURNS jsonb
9. get_inventory_valuation(p_org_id uuid)
   RETURNS jsonb
10. get_supplier_spend(p_org_id uuid, p_start_date date, p_end_date date)
    RETURNS TABLE (supplier text, total_spend numeric, po_count int)
11. get_finished_goods_status(p_org_id uuid, p_sku_id uuid DEFAULT NULL)
    RETURNS jsonb

For each, use the SKU plan's schema (polymorphic lots — WHERE sku_id IS
NOT NULL for finished, ingredient_id IS NOT NULL for raw/packaging;
JOIN ingredients + skus with LEFT JOINs where source is polymorphic).

For get_lot_traceability, use EXACT-STRING match on
sales_order_lines.lot_numbers_allocated (text[]) — e.g.
  WHERE p_lot_number = ANY(sol.lot_numbers_allocated)
No LIKE, no ILIKE.

For get_recipe_cost_estimate, iterate over all SKUs with recipe_id =
p_recipe_id. For each, compute:
  liquid_estimate   = sum(recipe_lines.quantity * avg_cost(ingredient_id))
                      scaled by sku.fill_quantity share
  packaging_estimate = sum(sku_packaging.quantity *
                           avg_cost(sku_packaging.ingredient_id))
  unit_cogs_estimate = (liquid_estimate + packaging_estimate) / 1   -- per unit

Acceptance:
- `npx supabase db push --include-all` applies clean.
- Test each function by hand in the SQL editor with the QA org's id.
```

**Done when:** [ ] Migration applied. All 11 functions callable via SQL editor
against the seed data.

---

### Step 10.3 — Migration 010: `ai_readonly` role + `execute_ai_query` wrapper

**[CLAUDE CODE]**

```
Create supabase/migrations/010_ai_readonly_role.sql at
F:\Projects\lotmonster.

Carry the v3 Step 9.3 pattern forward:

1. CREATE ROLE ai_readonly NOLOGIN;
   GRANT USAGE ON SCHEMA public TO ai_readonly;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_readonly;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ai_readonly;

2. REVOKE EXECUTE ON all 11 AI functions from PUBLIC + authenticated;
   GRANT EXECUTE on the 11 to ai_readonly.

3. CREATE FUNCTION execute_ai_query(function_name text, params jsonb)
   RETURNS jsonb
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     allowed text[] := ARRAY[
       'get_cogs_summary','get_expiring_lots','get_low_stock_ingredients',
       'get_ingredient_cost_history','get_production_run_detail',
       'get_recipe_cost_estimate','get_sales_summary','get_lot_traceability',
       'get_inventory_valuation','get_supplier_spend',
       'get_finished_goods_status'
     ];
     result jsonb;
   BEGIN
     IF NOT (function_name = ANY(allowed)) THEN
       RAISE EXCEPTION 'Function % not allowed', function_name;
     END IF;
     SET LOCAL ROLE ai_readonly;
     -- dynamic dispatch by name; each branch extracts params by key
     -- and calls the function with typed arguments. NO dynamic SQL
     -- string concatenation — hardcoded switch.
     CASE function_name
       WHEN 'get_cogs_summary' THEN
         result := get_cogs_summary(
           (params->>'org_id')::uuid,
           (params->>'start_date')::date,
           (params->>'end_date')::date
         );
       WHEN 'get_expiring_lots' THEN
         ... (etc for each of the 11)
       ELSE
         RAISE EXCEPTION 'unreachable';
     END CASE;
     RESET ROLE;
     RETURN result;
   END $$;

4. REVOKE EXECUTE ON execute_ai_query FROM PUBLIC;
   -- only grant to a specific role the route can assume? For simplicity
   -- in contest, grant to authenticated but confirm the route's auth
   -- is tight.
   GRANT EXECUTE ON execute_ai_query TO authenticated;

5. If the Supabase migration runner can't CREATEROLE, include a comment
   at the top of the file documenting the one-time manual step
   (Management API PATCH to run the statement via SQL editor as the
   owner). Check by reading the runner output during `db push`.

Acceptance:
- Migration applies.
- Calling execute_ai_query('get_finished_goods_status', '{"org_id":"..."}')
  in the SQL editor returns data.
- Calling execute_ai_query('DROP TABLE lots', '{}') raises
  "Function DROP TABLE lots not allowed".
```

**[DANNY]** If `CREATEROLE` isn't granted, document the manual workaround and move
on — this is a known Supabase-Postgres limitation and the fix is pasting the
CREATE ROLE into the SQL editor as the project owner.

**[RAY]** flag: confirm authenticated users can't bypass `/api/ai/query` by
calling `execute_ai_query` directly via `/rest/v1/rpc/execute_ai_query`. If they
can, gate the function to a role that only the API route assumes.

**Done when:** [ ] Role exists. Wrapper works with whitelist. Denylist case raises
cleanly.

---

### Step 10.4 — `/api/ai/query` route

**[CLAUDE CODE]**

```
Create src/app/api/ai/query/route.ts at F:\Projects\lotmonster.

READ FIRST:
- v3 guide lines 1730-1836 (the two-turn tool_use pattern — carry that
  structure forward)
- src/lib/ai/tools.ts (the 11 tool schemas from step 10.1)

Implementation:

import Anthropic from '@anthropic-ai/sdk';
import { lotmonsterTools } from '@/lib/ai/tools';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  // 1. Authenticate via Supabase server client. If no user, return 401.
  // 2. Resolve org_id via org_members (NOT from JWT claims — new users
  //    may not have the claim populated yet). See the resolveOrgId
  //    pattern in src/lib/ingredients/queries.ts.
  // 3. Get userMessage from the request body.

  const system = `You are the Lotmonster AI assistant — an expert in
  inventory, COGS, and traceability for small CPG manufacturers.

  Lotmonster tracks THREE kinds of inventory:
  - RAW ingredients (lots of peppers, vinegar, etc.)
  - PACKAGING ingredients (bottles, caps, labels, cartons)
  - FINISHED-GOODS SKUs (sellable units like "Jalapeño Classic 16oz")

  A production run CONSUMES raw + packaging lots and PRODUCES one or
  more finished lots. COGS per finished lot has a liquid share (raw
  cost) and a packaging share.

  Pick the right tool for each question. When asked about "inventory,"
  clarify whether the user means raw, packaging, or finished — or use
  get_inventory_valuation to return all three.

  Current org: ${orgId}
  Current date: ${new Date().toISOString().split('T')[0]}

  Always present dollar amounts as $X,XXX.XX. Always reference specific
  lot numbers, SKU names, or run numbers when the data supports it.
  Never invent data. If a tool returns no rows, say so.`;

  // TURN 1
  const turn1 = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userMessage }],
    tools: lotmonsterTools,
    // DO NOT pass `thinking`. tool_use + extended thinking are
    // incompatible in claude-sonnet-4-6 per step 10.1's note.
  });

  if (turn1.stop_reason === "tool_use") {
    const toolCalls = turn1.content.filter(b => b.type === "tool_use");

    const toolResults = await Promise.all(toolCalls.map(async (tc) => {
      // SECURITY: override whatever Claude passed for org_id with the
      // authenticated session's org_id. Never trust the model.
      const params = { ...tc.input, org_id: orgId };
      const { data, error } = await supabase.rpc('execute_ai_query', {
        function_name: tc.name,
        params,
      });
      return {
        type: "tool_result",
        tool_use_id: tc.id,
        content: error ? JSON.stringify({ error: error.message })
                       : JSON.stringify(data),
      };
    }));

    // TURN 2
    const turn2 = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: turn1.content },
        { role: "user", content: toolResults },
      ],
      tools: lotmonsterTools,
    });

    return Response.json({ message: extractText(turn2.content) });
  }

  return Response.json({ message: extractText(turn1.content) });
}

function extractText(blocks) {
  return blocks.filter(b => b.type === "text").map(b => b.text).join("\n");
}

Rate-limit:
- Simple in-memory bucket per-org: 30 queries per 15-min window.
- On exceed, return 429 with { error: "rate limit" }.

Acceptance:
- POST with { message: "How many 16oz cases of Jalapeño can I sell
  today?" } returns a response citing finished SKU stock.
- Malicious input "drop table lots" returns a helpful on-task answer
  or a polite decline — never executes anything destructive.
- org_id injection confirmed: POST with a body claiming another org's
  id in the message returns only THIS org's data.
```

**Done when:** [ ] Route responds with real data on a canned question. Org
injection holds.

---

### Step 10.5 — `/dashboard/ai` chat UI

**[CLAUDE CODE]**

```
Build the AI chat page at src/app/dashboard/ai/page.tsx for
F:\Projects\lotmonster.

Follow v3 Part 9.5's layout spec, with these updates:

- Full-height chat pane within the dashboard shell.
- Message bubbles: user right/teal, assistant left/gray.
- Markdown renderer on assistant bubbles (use `react-markdown` — add to
  package.json if not there).
- Three-dot pulse loading bubble while awaiting /api/ai/query.
- Red error bubble on non-2xx response, with Retry.
- 5 suggested-question chips (shown only when messages.length === 0):
  - "What's my COGS this month, split by liquid and packaging?"
  - "What finished goods expire in the next 30 days?"
  - "Which packaging components are low on stock?"
  - "How many 16oz cases of Jalapeño can I sell today?"
  - "Trace finished lot <paste a real lot number here>"
- Clicking a chip autofills the input (does NOT auto-submit).
- "Clear chat" button in header.
- Session-only message state (no persistence in phase 1).

Acceptance:
- Page renders at /dashboard/ai (no more 404).
- Clicking any of the 5 chips + pressing send produces a real-data
  response within 5s.
- Markdown in assistant responses (tables, bold, lists) renders.
```

**Done when:** [ ] Chat UI live. All 5 chips answer correctly.

---

### Step 10.6 — End-to-end verification

**[PERPLEXITY COMPUTER]**

```
Open https://www.lotmonster.co/dashboard/ai and run these 5 questions
against the QA org (which should have 9.10's multi-SKU run + a shipped
SO after Part 9):

1. "What's my COGS this month, split by liquid and packaging?"
   - Does the response cite specific dollar amounts for each bucket?
   - Does it group by recipe?
   - Is it accurate vs SELECT SUM from production_runs?

2. "What finished goods expire in the next 30 days?"
   - Does it list specific finished lot numbers + SKU names?
   - Does it skip raw lots, or does it include them with a label?
     (Either is fine as long as "finished" is distinguished.)

3. "Which packaging components are low on stock?"
   - Does it return rows from ingredients WHERE kind='packaging'?

4. "How many 16oz cases of Jalapeño Classic can I sell today?"
   - Does it return the finished SKU's total_on_hand?
   - Does it cite the earliest_expiry?

5. "Trace finished lot <PASTE JAL16-... from 9.10>"
   - Does the response trace from raw jalapeño lots through the
     production run to the finished lot to any SOs?

For each: report pass/fail, response time (seconds), and any errors in
the browser console.
```

**Done when:** [ ] All 5 chips return accurate data in <5s each.

---

# Part 11 — Cron Jobs + QBO Sync Dispatcher

| Field | Value |
|---|---|
| Why this part matters | Sync routes work (Part 9B), but nothing triggers them. Every ship/receive/complete creates a pending `qbo_sync_log` row that sits there. Dispatcher fixes this. |
| Estimated days | ~1.5 |
| Prerequisites | Part 10 green. `qbo_sync_log` table has pending rows in it. |
| Outputs | Migration 011 (if needed) · `/api/cron/qbo-sync` route · `vercel.json` crons block · verified 15-min cadence |

Carried forward from v3 Part 10 style. Schedule tightened, dispatcher logic added.

---

### Step 11.1 — Vercel plan check

**[DANNY]** Every-15-min cadence requires **Vercel Pro**. Hobby caps cron to **1
invocation/day**, which is demo-unusable. Before writing code, decide.

**[PERPLEXITY COMPUTER]**

```
In the Lotmonster Vercel dashboard (https://vercel.com/ntangborn-3191/lotmonster):
1. Check Settings → Plan. Is it Hobby or Pro?
2. If Hobby, report current monthly cost if we upgrade to Pro ($20/mo
   estimated).
3. Also check Settings → Cron Jobs — what's the current quota for each
   plan?

Report back.
```

**[USER]** decide. If staying on Hobby, change the schedule in 11.4 to hourly
(`0 * * * *`) — it's still enough for the contest demo, just slower.

**Done when:** [ ] Plan decision made. Schedule commitment made (15-min vs hourly).

---

### Step 11.2 — Migration 011: `attempt_count` on `qbo_sync_log`

**[CLAUDE CODE]**

```
First, CHECK if qbo_sync_log already has attempt_count + last_attempted_at
+ error_message columns. Read supabase/migrations/001_initial_schema.sql
and grep every migration for qbo_sync_log. If all three columns already
exist, SKIP this migration — say so in your output.

If any are missing, create supabase/migrations/011_qbo_sync_log_retry.sql:

ALTER TABLE qbo_sync_log
  ADD COLUMN IF NOT EXISTS attempt_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message    text;

Apply with `npx supabase db push --include-all`.

Acceptance: the three columns exist per
  \d+ qbo_sync_log
in the SQL editor.
```

**Done when:** [ ] Columns exist (via this migration, or pre-existing).

---

### Step 11.3 — Dispatcher route `/api/cron/qbo-sync`

**[CLAUDE CODE]**

```
Create src/app/api/cron/qbo-sync/route.ts at F:\Projects\lotmonster.

READ FIRST:
- src/proxy.ts — the cronPattern already handles Bearer auth for
  /api/cron/*. No proxy changes needed.
- src/app/api/qbo/sync/{journal-entry,invoice,bill}/route.ts — the
  internal routes we'll call.

Implementation:

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;

export async function GET(request: NextRequest) {
  // The proxy has already validated Authorization: Bearer ${CRON_SECRET}.
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from('qbo_sync_log')
    .select('id, org_id, entity_type, entity_id, attempt_count')
    .in('status', ['pending', 'failed'])
    .lt('attempt_count', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  let succeeded = 0, failed = 0, skipped = 0;

  for (const row of rows ?? []) {
    const routeMap = {
      journal_entry: 'journal-entry',
      invoice: 'invoice',
      bill: 'bill',
    };
    const routePath = routeMap[row.entity_type];
    if (!routePath) { skipped++; continue; }

    const bodyKey = {
      journal_entry: 'productionRunId',
      invoice: 'salesOrderId',
      bill: 'purchaseOrderId',
    }[row.entity_type];

    try {
      // Internal call with CRON_SECRET bearer
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/qbo/sync/${routePath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.CRON_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ [bodyKey]: row.entity_id }),
        }
      );
      if (res.ok) {
        // The sync route itself marks the log row 'synced' on success
        succeeded++;
      } else {
        const text = await res.text();
        await admin.from('qbo_sync_log').update({
          status: 'failed',
          attempt_count: (row.attempt_count ?? 0) + 1,
          last_attempted_at: new Date().toISOString(),
          error_message: `HTTP ${res.status}: ${text.slice(0, 500)}`,
        }).eq('id', row.id);
        failed++;
      }
    } catch (e) {
      await admin.from('qbo_sync_log').update({
        status: 'failed',
        attempt_count: (row.attempt_count ?? 0) + 1,
        last_attempted_at: new Date().toISOString(),
        error_message: (e as Error).message.slice(0, 500),
      }).eq('id', row.id);
      failed++;
    }
  }

  return NextResponse.json({
    attempted: rows?.length ?? 0,
    succeeded, failed, skipped,
  });
}

Acceptance:
- Hitting /api/cron/qbo-sync WITHOUT Authorization returns 401 (proxy).
- With Bearer ${CRON_SECRET}, returns JSON summary.
- After a run, any pending qbo_sync_log row with a valid entity is
  now 'synced'.
- After 5 failed attempts, the row is skipped.
```

**[RAY]** Confirm `CRON_SECRET` never logs: grep for `console.log.*CRON_SECRET`
anywhere.

**Done when:** [ ] Manual curl returns a JSON summary. One pending log row flips
to 'synced'.

---

### Step 11.4 — `vercel.json` crons block

**[CLAUDE CODE]**

```
Update vercel.json at F:\Projects\lotmonster. Read the existing file
first; keep any existing keys (framework setting, headers, etc.).

Add or merge:

{
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/qbo-sync", "schedule": "*/15 * * * *" }
  ]
}

If the Part 11.1 decision was to stay on Hobby, use schedule "0 * * * *"
(hourly) instead.

Then:
- git add vercel.json
- commit: "chore: register QBO sync dispatcher cron"
- push

Ask me to confirm the Vercel dashboard shows the cron after deploy.
```

**[USER]** `git push`. Wait for Vercel to deploy.

**[PERPLEXITY COMPUTER]**

```
In the Vercel dashboard at https://vercel.com/ntangborn-3191/lotmonster,
go to Settings → Cron Jobs. Confirm:

1. /api/cron/qbo-sync is listed.
2. Schedule matches vercel.json (*/15 * * * * or 0 * * * *).
3. Next Run time is set.
4. Click "Run Cron" to trigger manually. Watch the result.
5. Immediately after, in Supabase SQL editor:
    SELECT status, attempt_count, synced_at, last_attempted_at
    FROM qbo_sync_log
    WHERE org_id='<ORG_ID>'
    ORDER BY created_at DESC LIMIT 10;
   Some rows should now show status='synced' or an attempt_count > 0.

Report.
```

**Done when:** [ ] Cron registered in Vercel UI, manual trigger works,
`qbo_sync_log` rows drain.

---

### Step 11.5 — End-to-end cron smoke

**[USER]** Don't trigger anything manually. Just:

1. Ship a fresh SO via the UI.
2. Look at the clock — note the time.
3. Wait for the next cron tick (up to 15 min, or up to 1h on Hobby).
4. Check the QBO sandbox invoices list.

**[PERPLEXITY COMPUTER]**

```
Confirm the new invoice landed in QBO sandbox without any manual curl.

- qbo_sync_log row for the new SO: status='synced'.
- QBO sandbox Sales → Invoices: new invoice present.
- sales_orders.qbo_invoice_id: non-null.

Report pass/fail.
```

**Done when:** [ ] End-to-end automated sync verified.

---

# Part 12 — Stripe Billing

| Field | Value |
|---|---|
| Why this part matters | Monetization. Also, "working billing" is an implicit contest criterion for any SaaS demo. |
| Estimated days | 3.0 |
| Prerequisites | Part 11 green |
| Outputs | Stripe products + prices · `/api/stripe/checkout` + `/api/stripe/webhook` + `/api/stripe/portal` · Plan gating · Pricing page · Billing tab on settings (wired up in Part 13's shell) |

**This part is carried forward largely intact from v3 Part 11.** Major deltas:

1. `orgs.stripe_customer_id` already exists (migration 001) — schema work is
   minimal.
2. `/api/stripe/webhook` is already in `src/proxy.ts`'s `publicRoutes` set.
3. Billing UI merges into the Part 13 settings shell instead of living at its
   own path.

**[USER]** Before any prompts below: verify the current Stripe Node SDK major
version and API version against `@stripe/stripe-node` docs. Stripe ships
breaking API changes on a schedule; the v3 guide was written before 2026.

**[PERPLEXITY COMPUTER]**

```
Go to https://docs.stripe.com/api and report the current stable Stripe
API version (e.g. "2025-07-30.basil"). Also check
https://www.npmjs.com/package/stripe for the latest Node SDK version.

Then confirm these patterns still work as described in this prompt:
- stripe.checkout.sessions.create with subscription_data.trial_period_days
  + trial_settings.end_behavior.missing_payment_method = 'cancel'
- stripe.webhooks.constructEvent with raw request body
- stripe.billingPortal.sessions.create

If any are deprecated, flag the replacement.
```

**Done when:** [ ] Current Stripe API + SDK versions known. Any breaking changes
flagged.

---

### Step 12.1 — Stripe products and prices (carried from v3)

**[PERPLEXITY COMPUTER]**

```
[Same as v3 Step 11.1 — lifted verbatim]

Walk me through setting up Stripe products and prices for Lotmonster. I
need three subscription plans:

1. Starter — $99/month
   Features: Up to 50 ingredients, 20 lots, 5 recipes, basic AI
   (10 queries/day), no QBO sync
2. Growth — $199/month
   Features: Up to 200 ingredients, unlimited lots, 25 recipes, full AI
   (100 queries/day), QBO sync
3. Scale — $299/month
   Features: Unlimited everything, priority AI, QBO sync, API access,
   dedicated support

For each plan:
- 14-day free trial
- Trial cancels if no payment method added
  (trial_settings.end_behavior.missing_payment_method: 'cancel')
- Monthly billing cycle

Walk me through:
1. Creating each product in the Stripe dashboard (Test mode)
2. Creating the recurring price for each product
3. Getting the price IDs (I'll need these in my code)
4. Setting up the customer portal for self-serve management
5. Configuring the webhook endpoint URL
   (https://www.lotmonster.co/api/stripe/webhook)
6. Which webhook events to listen for
```

**[USER]** Capture into Vercel env + `.env.local`:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_SCALE=price_...
```

**Done when:** [ ] 3 products, 3 prices, 3 price IDs, webhook endpoint, 5 env vars
set in Vercel AND `.env.local`.

---

### Step 12.2 — Migration 012: Stripe schema catch-up (if needed)

**[CLAUDE CODE]**

```
READ migration 001 first. Confirm which of these columns exist on `orgs`:
- stripe_customer_id    (known to exist per CLAUDE.md)
- stripe_subscription_id
- plan                  (values 'starter'|'growth'|'scale'|'canceled')
- subscription_status   (values 'trialing'|'active'|'past_due'|'canceled')
- trial_ends_at

For any missing, create supabase/migrations/012_stripe_schema.sql adding
them via ALTER TABLE ... ADD COLUMN IF NOT EXISTS. Mirror the RLS pattern
(inherit from table-level; no new policies needed).

Also consider adding `ai_usage` table for the AI queries/day counter:
  (org_id uuid, date date, count int, PRIMARY KEY (org_id, date))
With RLS on org_id = current_org_id().

Report which columns were added vs already present.
```

**Done when:** [ ] Schema matches the list above. Migration 012 applied (or noted
as unnecessary).

---

### Step 12.3 — `/api/stripe/checkout` (carried from v3)

**[CLAUDE CODE]**

```
[Carried from v3 Step 11.2 verbatim, with these deltas]

Create src/app/api/stripe/checkout/route.ts at F:\Projects\lotmonster.

Same as v3 spec:
- Pass stripe API version from step 12's verification.
- Authenticate, resolve orgId from org_members (not JWT).
- Get-or-create stripe customer; persist stripe_customer_id on the org.
- Create checkout session with trial_period_days=14 +
  trial_settings.end_behavior.missing_payment_method='cancel'.
- success_url redirects to /dashboard/settings?tab=billing&session_id=...
  (the settings shell comes in Part 13; in the interim it'll 404 but the
  session is already created).
- metadata: { org_id: orgId }.

Also create src/app/pricing/page.tsx:
- Three plan cards side by side.
- Highlight Growth as "Most Popular".
- Each card: plan name, price, features, "Start Free Trial" button.
- Button POSTs to /api/stripe/checkout with the priceId.
- If user is already subscribed (check org.plan), show "Current Plan"
  badge.

Add /pricing to src/proxy.ts publicRoutes (it's a marketing page).

Acceptance:
- Visit /pricing logged out, click Start Free Trial → redirected to
  /login (it's not in publicRoutes? wait — /pricing is public, but the
  Start button requires auth. Handle by redirecting to /login?next=/pricing
  when the button is clicked.)
- Visit /pricing logged in, click → redirected to Stripe Checkout.
```

**Done when:** [ ] Checkout route returns a session URL. Pricing page renders.
Logged-in user redirects to Stripe hosted checkout.

---

### Step 12.4 — `/api/stripe/webhook` (carried from v3)

**[CLAUDE CODE]**

```
[Carried from v3 Step 11.3 verbatim — critical security note preserved]

Create src/app/api/stripe/webhook/route.ts at F:\Projects\lotmonster.

CRITICAL: Use request.text() to get the raw body BEFORE parsing. Do NOT
use request.json() — Stripe signature verification requires the raw body.

Same event handlers as v3:
- checkout.session.completed → set stripe_customer_id,
  stripe_subscription_id, plan (from price ID), subscription_status
- invoice.paid → confirm subscription is active
- invoice.payment_failed → mark subscription_status='past_due'
- customer.subscription.trial_will_end → log (email later)
- customer.subscription.deleted → plan='canceled'
- customer.subscription.updated → update plan based on new price ID

Verify /api/stripe/webhook IS in src/proxy.ts publicRoutes (per CLAUDE.md
it already is — confirm).

Acceptance:
- Stripe CLI `stripe listen --forward-to localhost:3000/api/stripe/webhook`
  fires events and the org row updates accordingly.
- Verify by firing `stripe trigger checkout.session.completed` and
  confirming plan is set on the org.
```

**Done when:** [ ] Webhook fires → plan + subscription_status update on the org.
Signature verification passes.

---

### Step 12.5 — Plan gating (carried from v3)

**[CLAUDE CODE]**

```
[Carried from v3 Step 11.4 verbatim]

Implement plan-based feature gating at F:\Projects\lotmonster.

Create src/lib/plans.ts:

const PLAN_LIMITS = {
  starter: { maxIngredients: 50, maxLots: 20, maxRecipes: 5,
             aiQueriesPerDay: 10, qboSync: false, apiAccess: false },
  growth:  { maxIngredients: 200, maxLots: Infinity, maxRecipes: 25,
             aiQueriesPerDay: 100, qboSync: true, apiAccess: false },
  scale:   { maxIngredients: Infinity, maxLots: Infinity,
             maxRecipes: Infinity, aiQueriesPerDay: Infinity,
             qboSync: true, apiAccess: true },
};

Export getPlanLimits, checkFeatureAccess, checkResourceLimit.

Apply gating on the SERVER, not the UI:
- src/lib/actions/ingredients.ts → bulkInsertIngredients checks
  maxIngredients BEFORE insert.
- src/lib/lots/actions.ts → createLot checks maxLots.
- src/lib/recipes/actions.ts → createRecipe checks maxRecipes.
- src/app/api/ai/query/route.ts → check aiQueriesPerDay via ai_usage
  table (from migration 012).
- src/app/api/qbo/** → check org.plan supports qboSync; return 403
  "Upgrade to Growth to use QBO sync" otherwise.

[RAY] items: (a) plan gating on server actions, not just UI; (b) customer
portal only generates sessions for the authenticated user's own org's
stripe_customer_id. Confirm both.

Create src/components/upgrade-prompt.tsx — a reusable prompt shown when
a limit is hit. "You've reached the {resource} limit on the {plan} plan.
Upgrade to {nextPlan} for {benefit}."
```

**Done when:** [ ] Creating a 51st ingredient on Starter returns a 403 with the
upgrade prompt. AI queries throttled at 10/day on Starter.

---

### Step 12.6 — `/api/stripe/portal` (carried from v3)

**[CLAUDE CODE]**

```
[Carried from v3 Step 11.5 verbatim]

Create src/app/api/stripe/portal/route.ts at F:\Projects\lotmonster.

Authenticates, looks up org.stripe_customer_id, creates a
stripe.billingPortal.sessions.create, returns { url }.

return_url = NEXT_PUBLIC_APP_URL/dashboard/settings?tab=billing.

[RAY] Confirm that the route never accepts a stripe_customer_id from the
request body — it must always come from the authenticated session's org.

Acceptance: a user on Growth clicks "Manage Subscription" in Part 13's
billing tab → lands on Stripe's hosted portal.
```

**Done when:** [ ] Authenticated POST returns a portal URL for the caller's org,
and no other org's.

---

### Step 12.7 — End-to-end Stripe smoke

**[PERPLEXITY COMPUTER]**

```
Walk the full Stripe flow on https://www.lotmonster.co:

1. Sign up a fresh user.
2. Visit /pricing. Click "Start Free Trial" on Growth.
3. Stripe Checkout: use test card 4242 4242 4242 4242, any future
   expiry, any CVC.
4. Complete checkout. Expected: redirect back with session_id. The
   settings page may 404 (Part 13 shell); for now, verify via SQL:
     SELECT plan, subscription_status, stripe_subscription_id, trial_ends_at
     FROM orgs WHERE id=<ORG_ID>;
   Expected: plan='growth', subscription_status='trialing',
   subscription_id set, trial_ends_at ~14 days out.
5. Fire `stripe trigger customer.subscription.updated` from your local
   Stripe CLI. Confirm the org row updates if relevant.
6. Hit /api/stripe/portal. Get a URL. Open it. Confirm the portal loads
   with the org's subscription visible.

Report pass/fail per step.
```

**Done when:** [ ] All 6 steps green.

---

# Part 13 — Demo Seeder + Polish + Settings Shell

| Field | Value |
|---|---|
| Why this part matters | The contest submission looks professional when the demo org has realistic data, the settings page exists (no QBO callback 404), and the UI doesn't show "Stackline" anywhere. |
| Estimated days | ~2.5 |
| Prerequisites | Part 12 green |
| Outputs | Seeder at `src/scripts/seed-demo.ts` + `npm run seed` · `/dashboard/settings` shell (Organization + QuickBooks + Billing tabs) · UI audit fixes |

Skeleton carried from v3 Part 12. Seeder contents rewritten for SKUs + packaging.

---

### Step 13.1 — Settings shell (unblocks the QBO callback 404)

**[CLAUDE CODE]**

```
Build the settings page shell at F:\Projects\lotmonster.

Create src/app/dashboard/settings/page.tsx with tabs. The QBO OAuth
callback redirects to /dashboard/settings?qbo=connected — this page
needs to exist or that 404s.

Tabs:

1. Organization
   - Org name (read-only for now), editable via a button opening an edit
     modal.
   - Plan + Usage: show org.plan, current counts (SELECT COUNT for
     ingredients/lots/recipes/ai_usage today), with "Upgrade" CTA if
     hitting limits.
   - Single-member list for now.

2. QuickBooks (LOAD-BEARING — this is what fixes the 404)
   - Connection status card: shows "Connected to {company_name}" if
     org.qbo_realm_id is set, else "Not connected".
   - If connected, show qbo_realm_id + qbo_connected_at. Do NOT show
     the refresh token (or any hashed form). [RAY] confirm.
   - Buttons: "Connect QuickBooks" (links to /api/qbo/connect?orgId=...)
     / "Disconnect" (POSTs to /api/qbo/disconnect).
   - Account mapping form (visible only when connected):
     Six dropdowns (COGS, Inventory, AR, AP, Income, Default Item)
     populated from a new /api/qbo/accounts route that queries QBO's
     Account + Item lists (caches 5 min). On Save, UPDATE the orgs
     row columns (qbo_cogs_account_id, etc.) — NOT a separate
     qbo_account_mappings table (see Part 9B's note on this).
     [RAY] Validate that picked IDs exist in the connected realm at
     save time — one QBO query per save.
   - URL query handling: if qbo=connected, show a success toast on
     mount.

3. Billing
   - Current plan card (org.plan + subscription_status).
   - If trialing: "Your free trial ends on {trial_ends_at}".
   - "Manage Subscription" button → POSTs to /api/stripe/portal →
     opens returned URL.
   - "Change Plan" section with the 3 plan cards from /pricing
     (re-use the component).
   - Invoice history fetched from stripe API (optional for phase 1 —
     stub as "coming soon" if timing is tight).

4. Account
   - Email (read-only from supabase.auth.getUser()).
   - Sign out button.

Route: /dashboard/settings?tab=organization|quickbooks|billing|account.

[CLAUDE CODE secondary task] Create src/app/api/qbo/accounts/route.ts
that accepts the current session (authenticated), calls
qboJson<{ Account: [...] }>('query?query=SELECT * FROM Account WHERE
Active=true') and qboJson<{ Item: [...] }>('query?query=SELECT * FROM
Item WHERE Active=true'), returns { accounts, items }. Gate via user
session (not CRON_SECRET). Use the same auth split as the other
/api/qbo/ routes but user-mode.

Acceptance:
- /dashboard/settings renders 4 tabs.
- After OAuth completion, the callback redirect lands on the
  QuickBooks tab showing "Connected".
- Account dropdowns populate from sandbox.
- Saving mappings persists to orgs columns.
- Billing tab opens Stripe portal.
```

**Done when:** [ ] /dashboard/settings renders. QBO OAuth callback lands here
successfully. Account mapping form persists. Billing tab opens portal.

---

### Step 13.2 — Demo seeder

**[CLAUDE CODE]**

```
Create src/scripts/seed-demo.ts at F:\Projects\lotmonster.

Runnable with `npm run seed` (add the script to package.json as
"seed": "tsx src/scripts/seed-demo.ts").

Seeding STRATEGY:
- Accept --reset flag: if present, TRUNCATE all org-scoped tables for
  the demo org before seeding. Otherwise, hard-fail if the demo org
  exists (do NOT silently double-seed).
- Creates org "Lone Star Heat" + auto-member for a demo user.
- Creates a second org "QA Sample Co" with a single test user so the
  user can sign in as either.

DATA:

A. RAW ingredients (8), kind='raw':
   - Jalapeño Peppers, lb, $3.20/lb
   - Habanero Peppers, lb, $4.50/lb
   - Ghost Peppers, lb, $8.75/lb
   - Apple Cider Vinegar, gal, $9.00/gal
   - Garlic Cloves, lb, $5.50/lb
   - Sea Salt, lb, $1.20/lb
   - Lime Juice, gal, $12.00/gal
   - Mango Puree, lb, $3.80/lb

B. PACKAGING ingredients (6), kind='packaging':
   - 16oz Hot Sauce Bottle, each, $0.32
   - 5oz Hot Sauce Bottle, each, $0.22
   - Cap (standard), each, $0.05
   - Front Label, each, $0.08
   - Back Label (nutrition), each, $0.04
   - Shipping Carton (12-ct), each, $0.95

C. LOTS — 2 per ingredient (16 raw + 12 packaging), realistic dates
   and expiries spread across Jan–Apr 2026.

D. RECIPES (3):
   - "Jalapeño Classic" target_yield=640, target_yield_unit='fl_oz'
     lines: 10 lb jalapeño, 1 gal ACV, 2 lb garlic, 0.5 lb salt,
            0.25 gal lime juice
   - "Habanero Blaze" target_yield=640 fl_oz
   - "Ghost Pepper Reaper" target_yield=320 fl_oz

E. SKUs (5, all kind='unit'):
   - Jalapeño Classic 16oz (UPC 012345600001, shelf 365d, retail $9.99,
     lot_prefix JAL16, qbo_item_id null)
   - Jalapeño Classic 5oz  (UPC 012345600002, $4.99, JAL5)
   - Habanero Blaze 16oz   (UPC 012345600003, $11.99, HAB16)
   - Habanero Blaze 5oz    (UPC 012345600004, $5.99, HAB5)
   - Ghost Pepper Reaper 5oz (UPC 012345600005, $8.99, GHO5)

F. sku_packaging BOMs:
   - Each 16oz SKU: 1×16oz bottle + 1 cap + 1 front label + 1 back label
   - Each 5oz SKU:  1×5oz bottle  + 1 cap + 1 front label + 1 back label

G. PURCHASE ORDERS (3):
   - PO-2026-001: received Jan 15 (from Texas Pepper Farms). Habanero
     + Jalapeño lots.
   - PO-2026-002: received Feb 28 (Global Container Co). Bottles + caps
     + labels.
   - PO-2026-003: sent (pending). Vinegar + lime juice.

H. PRODUCTION RUNS (5), most completed:
   - PR-2026-001: Jalapeño Classic completed 2026-02-10. Output:
     32×16oz + 0×5oz. total_cogs ~= $130 + $20 packaging.
   - PR-2026-002: Jalapeño Classic completed 2026-03-05. Output:
     16×16oz + 32×5oz. (Mixed fill — demo moneyshot.)
   - PR-2026-003: Habanero Blaze completed 2026-03-20. Output:
     20×16oz + 20×5oz.
   - PR-2026-004: Ghost Pepper Reaper completed 2026-04-01. Output:
     0×16oz + 40×5oz.
   - PR-2026-005: Jalapeño Classic status='planned' (draft, not
     started).

   Each completed run MUST:
   - Insert production_run_outputs rows with correct liquid/packaging
     split.
   - Insert finished-goods lots with sku_id + production_run_id set.
   - Insert production_run_lots rows for raw AND packaging consumption.
   - Sum invariant: sum(outputs.allocated_cogs_total) = run.total_cogs
     = sum(production_run_lots.line_cost).
   - Insert qbo_sync_log row for journal_entry (status='pending').

I. SALES ORDERS (10):
   Customers: Whole Foods Austin, Central Market Dallas, HEB San Antonio,
   Torchy's Tacos, Salt Lick BBQ.
   Mix of draft / confirmed / shipped / delivered.
   Line items reference SKUs (post-Part-9). For shipped SOs, populate
   lot_numbers_allocated with real finished-goods lot numbers from
   above (verifies traceability wiring).

J. QBO SYNC LOG extras:
   - 1 synced journal_entry for PR-2026-001 (qbo_journal_entry_id
     fake value like "SANDBOX-JE-001", status='synced').
   - 1 pending journal_entry for PR-2026-002.
   - 1 synced invoice for a shipped SO.

Implementation constraints:
- Use the admin client (service role key) — bypasses RLS.
- Wrap in try/catch; on any error, print which step failed.
- Print a summary at the end: counts of each table populated + org_id
  for the demo user.

Acceptance:
- `npm run seed --reset` runs clean exit 0.
- Logging in as the demo user at /dashboard shows seeded data:
  stats cards non-zero, low-stock card populated, expiring lots
  populated.
- /dashboard/production-runs/PR-2026-002 shows the multi-SKU output.
- /dashboard/traceability search for a finished lot renders the full
  chain.
```

**[USER]**

```bash
cd /f/Projects/lotmonster
npm run seed -- --reset
```

**Done when:** [ ] Seeder runs clean. Logging in as the demo user shows a fully
populated dashboard with a mixed-fill run, finished lots, and a traceability chain.

---

### Step 13.3 — UI audit

**[PERPLEXITY COMPUTER]**

```
Full UI audit of https://www.lotmonster.co signed in as the Lone Star
Heat demo user. Check every screen and report issues as a numbered list
(you'll paste this into Claude Code in the next step):

1. BRANDING — grep for leftover "Stackline" or template text anywhere:
   - Browser tab titles
   - Navigation labels
   - Footer
   - Error messages / toasts
   - Meta tags (view-source, check og:title, og:description)
   - Email templates (if you can trigger one — the Supabase OTP email)

2. LOADING STATES — each list/data-fetch must show a skeleton or spinner:
   - /dashboard (stat cards)
   - /dashboard/ingredients
   - /dashboard/lots
   - /dashboard/skus
   - /dashboard/recipes
   - /dashboard/production-runs
   - /dashboard/purchase-orders
   - /dashboard/sales-orders
   - /dashboard/traceability
   - /dashboard/ai (initial load)
   - /dashboard/settings

3. EMPTY STATES — on a fresh QA org (sign out, sign in as the fresh
   user from Part 9A):
   - Every list should render a friendly empty state + CTA.
   - No "undefined" or broken tables.

4. ERROR STATES:
   - Kill network mid-fetch (DevTools → Offline). Does the app show a
     retry option?
   - Submit an invalid form (e.g. save an ingredient with empty name).
     Are field-level errors clear?

5. MOBILE LAYOUT at 375px (DevTools device emulator):
   - Sidebar collapses?
   - Tables scroll horizontally or adapt?
   - Chat input reachable above the virtual keyboard?

6. TOAST CONSISTENCY:
   - Success vs error vs info — same library throughout?

Report EVERY issue as a numbered list with: location (route + component),
severity (blocker | polish), description, proposed fix.
```

**Done when:** [ ] Audit list in hand.

---

### Step 13.4 — Fix audit issues

**[CLAUDE CODE]**

```
Fix the Lotmonster UI audit issues. Here is the list:

[PASTE AUDIT RESULTS FROM 13.3]

For each:
1. Identify the file.
2. Apply the minimal fix.
3. Add a 1-line comment explaining.

Priority order:
- Blockers first (any "Stackline" leak, any broken empty state, any
  crash).
- Polish second (loading states, mobile tweaks).

After all fixes: `npm run build` must exit 0. Commit:
"fix: UI audit — branding, loading states, empty states, mobile"
```

**Done when:** [ ] Audit list cleared. Build green. Production redeployed.

---

# Part 14 — Security + Submission

| Field | Value |
|---|---|
| Why this part matters | Last sweep before the contest. Catches the things that will embarrass you on a demo call or get your submission disqualified. |
| Estimated days | 1.0 |
| Prerequisites | Part 13 green |
| Outputs | 20-item security audit · rotated leaked credentials · demo video · submission narrative · submission form filled |

---

### Step 14.1 — Security audit (20 items)

**[PERPLEXITY COMPUTER]**

```
Perform a security audit of https://www.lotmonster.co. For EACH of
these 20 items, report PASS or FAIL. For each FAIL include the
filename + line number to fix and a 1-line suggested change.

ORIGINAL 10 (from v3):

1. CRON_SECRET: /api/cron/qbo-sync returns 401 without Authorization
   header. Verify CRON_SECRET is set in Vercel.

2. RLS enabled on ALL tables. In SQL editor:
     SELECT relname, relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND relname NOT LIKE '_%';
   Any relrowsecurity=false is a FAIL.

3. Auth redirect: /dashboard in incognito redirects to /login.

4. No hardcoded API keys. grep -r "sk_live_\|sk_test_" src/.
   grep -r "eyJ" src/. Expected: zero hits.

5. Stripe webhook raw body: src/app/api/stripe/webhook/route.ts uses
   request.text() (not request.json()) before constructEvent.

6. QBO refresh token encrypted at rest. orgs.qbo_refresh_token_encrypted
   is a ciphertext string, not the raw token. Migration 003 references
   AES-256-GCM.

7. AI readonly role: ai_readonly has SELECT only. In SQL editor run:
     SELECT grantee, privilege_type FROM information_schema.role_table_grants
     WHERE grantee='ai_readonly';
   Expected: only SELECT (no INSERT/UPDATE/DELETE).

8. CORS: no wildcard Access-Control-Allow-Origin on any /api/** route.
   Spot-check 3 routes.

9. Rate limiting on /api/ai/query. POST 35 requests in 1 min and
   confirm 429 on the 31st.

10. Input validation: every server action uses a Zod schema.
    Spot-check ingredients, lots, recipes, skus.

NEW 10 (v4 additions):

11. RLS on migrations 007/009/010 tables. Re-run the pg_class query
    above against skus, production_run_outputs, sku_packaging, and
    the ai_usage table. All must have relrowsecurity=true.

12. UPC uniqueness per-org. In SQL editor, try:
      INSERT INTO skus (org_id, kind, name, upc)
      VALUES (<ORG_A>, 'unit', 'dupe test', '999999');
    Twice. Second should fail with unique violation. Then:
      INSERT INTO skus (org_id, kind, name, upc)
      VALUES (<ORG_B>, 'unit', 'also dupe', '999999');
    Should succeed (partial unique is per-org).

13. Polymorphic lots XOR CHECK. Try:
      INSERT INTO lots (org_id, ingredient_id, sku_id, ...) VALUES
      (<ORG>, <ING>, <SKU>, ...);
    Expected: CHECK violation.

14. ingredients.kind lock after first lot. Pick any ingredient with
    existing lots, try PATCH kind via API. Expected: clear error.

15. COGS invariant at completeRun. Already covered by 9.8.b unit tests;
    verify the tests still pass in CI.

16. shipSalesOrder rejects unknown lot numbers. Already enforced by
    9.11's rewrite (no free-text input path); verify by trying to POST
    a hand-crafted ship payload with a fake lot number to the ship
    route — should 4xx.

17. QBO account mapping form rejects IDs not in realm. Set a bogus
    id via the settings form. Expected: save fails with a clear
    message (per [RAY] item in Part 13).

18. CRON_SECRET never logged. `grep -ri "CRON_SECRET" src/` — expected
    zero console.log / console.error mentions.

19. No sensitive data in error toasts. Trigger 5 random errors in the
    UI. Inspect each toast content. Expected: no JWT fragments, no
    Supabase URL, no encrypted token bytes, no refresh token.

20. /rest/v1/rpc/execute_ai_query requires specific role. From an
    authenticated session (copy the access_token from the browser
    cookies), curl:
      curl -H "Authorization: Bearer <jwt>" \
           -H "apikey: <anon>" \
           "https://vvoyidhqlxjcuhhsdiyy.supabase.co/rest/v1/rpc/execute_ai_query" \
           -d '{"function_name":"get_inventory_valuation","params":{"org_id":"..."}}'
    Expected: 401 or 403 OR an error that the role can't be set
    (proving the wrapper's SET LOCAL ROLE ai_readonly is the
    gatekeeper and authenticated users can't bypass the /api/ai/query
    route).

Report all 20 with PASS/FAIL and fixes.
```

**[CLAUDE CODE]** Apply fixes for any FAIL items, one by one.

**Done when:** [ ] All 20 PASS. Fixes committed.

---

### Step 14.2 — Rotate leaked credentials

CLAUDE.md flags: **service-role key + Supabase access token were pasted in a
previous Claude session**. Rotate both.

**[USER]**

1. **Supabase service-role key:**
   - Go to https://supabase.com/dashboard/project/vvoyidhqlxjcuhhsdiyy/settings/api
   - Click "Reset" on the service_role key.
   - Copy the new value.
   - Update Vercel: `vercel env rm SUPABASE_SERVICE_ROLE_KEY production && vercel env add SUPABASE_SERVICE_ROLE_KEY production` → paste the new value.
   - Update `.env.local`.
   - Redeploy: `vercel deploy --prod`.
   - Smoke test: walk one /dashboard/ingredients request that uses the
     admin client.

2. **Supabase access token** (the one used by `npx supabase login`):
   - Go to https://supabase.com/dashboard/account/tokens
   - Revoke the compromised token.
   - Create a new one. Save it in a password manager.

**Done when:** [ ] Both rotations done. Prod still works after redeploy.

---

### Step 14.3 — Pre-deploy checklist walk

**[PERPLEXITY COMPUTER]** Walk Appendix B (below) line-by-line. Every item must
be green.

**Done when:** [ ] Every item in Appendix B ticked.

---

### Step 14.4 — Record the demo video

**Script outline (5 min, target 3 takes):**

| Time | Content | Key line |
|---|---|---|
| 0:00–0:30 | Login as Lone Star Heat, land on dashboard | "Lotmonster — AI-native inventory for small CPG manufacturers. This is Lone Star Heat, a Texas hot sauce maker." |
| 0:30–1:30 | Onboarding tour — show 3 paths, demo Path A upload | "Most inventory tools make you type everything. Lotmonster takes a spreadsheet or a photo and the AI extracts it." |
| 1:30–3:00 | Production run w/ finished goods — complete PR-2026-002 mixed fill. Show cost split preview. | "This batch filled 16 sixteen-ounce bottles and 32 five-ounce bottles. Each has its own unit-COGS — liquid by volume share, packaging per bottle." |
| 3:00–4:00 | QBO journal entry + invoice sync. Flip to QBO sandbox tab. | "Every ship creates an invoice. Every completed run creates a journal entry. Double-entry accounting on autopilot." |
| 4:00–4:45 | AI assistant — ask "how many 16oz cases of Jalapeño can I sell today?" + "trace finished lot JAL16-..." | "One question, one answer. The AI has eleven tools that read finished goods, packaging, traceability — all of it." |
| 4:45–5:00 | Recall — zoom in on the traceability chain. | "If that jalapeño lot had a recall, here's every finished lot, every SO, every customer. Two clicks to audit." |

**[USER]**

- Record with Loom or OBS (1080p, 30fps, clean audio).
- Budget 2–3 takes. First take always drags.
- Upload to Loom or YouTube unlisted.
- Capture the URL.

**Done when:** [ ] 5-min video recorded, uploaded, URL captured.

---

### Step 14.5 — Submission narrative

**[PERPLEXITY COMPUTER]**

```
Write the Perplexity Billion Dollar Build contest submission narrative
for Lotmonster. Authentic, specific, demonstrates Perplexity Computer's
centrality. Max 1500 words.

Structure:

1. WHAT WE BUILT (2 paragraphs)
   - AI-native inventory management for small CPG manufacturers.
   - Capabilities: 3-path onboarding, lot tracing with FEFO, per-SKU
     COGS including packaging, QBO double-entry sync, AI assistant
     with 11 named tools, finished-goods tracking with mixed-fill
     production runs.

2. WHO IT'S FOR (1 paragraph)
   - Small CPG manufacturers (hot sauce, cosmetics, supplements, candles).
   - Currently on spreadsheets or generic ERPs that don't understand
     lot tracking, per-SKU COGS, or packaging BOMs.
   - 50,000+ US small CPG manufacturers.

3. HOW PERPLEXITY COMPUTER WAS CENTRAL (3 paragraphs — the heart of it)
   Recap day-by-day:
   - Day 0: SDK version verification, API doc check, breaking-change
     flagging.
   - Days 1–2: Vercel deploy walkthrough, first-deploy verification.
   - Days 3–6: schema + RLS confirmation.
   - Days 7–14: all 3 onboarding paths tested.
   - Days 14–24 (Part 9): SKU plan walked milestone by milestone,
     verification on every migration, hand-test script on every
     rewrite.
   - Days 25–30 (Part 10): 11 tool schemas designed, end-to-end
     chat verification.
   - Days 31–35: Stripe + cron verification.
   - Days 36+: full security audit, UI audit, demo scripting, this
     narrative.
   - Throughout: every "does this actually work?" was a Perplexity
     verification loop.

4. THE MARKET OPPORTUNITY (2 paragraphs)
   - CPG manufacturing software market size.
   - Why AI-native wins: natural-language queries, vision-based
     onboarding, smart lot allocation, per-SKU COGS including
     packaging.

5. WHAT WE'D BUILD WITH $1B (2 paragraphs)
   - Scale: every CPG manufacturer globally.
   - Next features: case packing, barcode scanning, accrual COGS-at-ship,
     predictive demand, auto-replenishment, multi-facility.
   - Team: food-safety specialists, supply-chain domain experts,
     enterprise sales.

Tone: authentic, first-person, grounded in specifics (real dates, real
numbers, real file names). This was built by a non-coder with AI
tools — THAT's the story.
```

**[USER]** Copy the narrative + the demo video URL + the following into the
Perplexity submission form (when it opens):

- Live URL: `https://www.lotmonster.co`
- GitHub repo: `https://github.com/ntangborn/lotmonster`
- Demo credentials: create a read-only demo user
  (email + OTP will still work; paste the email into the form, mention the OTP
  flow in the submission). Do NOT commit these.

**[USER]** Contest facts (verified from Perplexity's official announcement + the
Billion Dollar Build registration site — see sources at end of this step):

- **Registration / submission portal:** https://bdb.perplexityfund.ai/register
  (registration must be completed first; the same account is used for
  submission).
- **Registration window:** Apr 14, 2026 00:01 PT — Jun 2, 2026 23:59 PT.
  **Submissions are due by the same Jun 2, 2026 23:59 PT deadline.**
- **Eligibility:**
  - Active Perplexity Pro or Max subscription held continuously since
    before midnight PT on Apr 13, 2026. No exceptions.
  - Legal US resident, 18+.
  - Team size: solo or duo (max 2 founders).
  - Winners must incorporate as a Delaware C-Corp to receive any
    investment.
  - AI-assisted building is expected — Perplexity Computer must be the
    "primary and most important AI" in the build workflow. Other tools
    (Claude Code, etc.) are allowed alongside.
- **Required deliverables (prepare before filling the form):**
  1. **Live product URL** — `https://www.lotmonster.co`.
  2. **Product demo video** — the 5-min recording from step 14.4.
     Hosted on Loom or unlisted YouTube.
  3. **Traction data** — users, revenue, or growth metrics. For
     Lotmonster: # of signed-up orgs, # of ingredients / lots / runs
     created across real orgs, any pilot-customer logos or quotes.
     Screenshots of the dashboard with real (non-seed) numbers beat
     any narrative.
  4. **Valuation roadmap** — how Lotmonster gets to $1B. Pull from
     step 14.5 narrative section 4 ("Market Opportunity") + section 5
     ("What We'd Build With $1B").
  5. **Written submission / narrative** — the ≤1500-word narrative
     from step 14.5 above. Emphasize Perplexity Computer's centrality
     (judging criterion).
  6. **GitHub repo link** — `https://github.com/ntangborn/lotmonster`
     (make public before submitting, or prepare a viewer invite for
     judges).
- **Judging criteria** (official):
  1. Market size / opportunity.
  2. Quality of the working product.
  3. Traction (users, revenue, growth).
  4. Centrality of Perplexity Computer to the build. ← this is why
     step 14.5 narrative section 3 is 3 paragraphs, not 1.
- **Finalist flow:** Top 10 pitch live on Jun 9, 2026 — 5 min pitch +
  5 min Q&A. Winners announced Jun 10, 2026. Prize pool: up to $1M
  seed (Perplexity Fund's discretion, split across up to 3 winners)
  + up to $1M Perplexity Computer credits.
- **Caveat to internalize:** "Perplexity Fund is under no obligation to
  invest in any participant." Finalist status ≠ check. Plan accordingly.

**[USER]** On or before Jun 2, 2026 23:59 PT:
1. Log into https://bdb.perplexityfund.ai/register using the email
   tied to your Perplexity Pro/Max account (`ntangborn@gmail.com`).
2. Complete registration (follow any prompts for the Pro/Max
   subscription check).
3. Fill the submission form with the six deliverables above + the
   narrative from step 14.5.
4. If any form field is ambiguous or a spec drifts (e.g. they add a
   pitch deck requirement), re-check https://bdb.perplexityfund.ai
   and the official T&Cs at
   https://www.perplexity.ai/computer/a/bdb-terms-conditions-DvGwJTrKQumizUjQ1xoxZA
   before submitting. The contest page is authoritative — this
   guide is a snapshot dated 2026-04-16.

**Sources consulted (2026-04-16):**
- https://bdb.perplexityfund.ai/register — official registration page.
- https://x.com/perplexity_ai/status/2041929222135173466 — official
  launch announcement with dates + prize structure.
- BusinessToday, NewsBytes, Ascendants coverage — corroborated
  deliverables (demo, traction, valuation roadmap), judging criteria,
  and eligibility.
- Official T&Cs URL (403s without a session):
  https://www.perplexity.ai/computer/a/bdb-terms-conditions-DvGwJTrKQumizUjQ1xoxZA
  — consult directly before submitting for anything that looks
  inconsistent with the above.

**Done when:** [ ] Submission narrative drafted. Registered on bdb.perplexityfund.ai
before Jun 2. Submission form filled and sent.

---

# Part 15 — Phase 2/3 Backlog (Reference Only)

Everything explicitly out of the contest cut. One-line context per item, from
Bob's plan.

### Data model / business logic
- **Case packing (phase 2).** `case_pack_events` + `packCases` action.
- **Case-price display toggle (phase 2).** `price_display_mode` + `unit_price_override` on SO lines.
- **`sales_order_line_lots` junction (phase 2).** Replaces free-text `lot_numbers_allocated`.
- **Migration 013 finalize.** Drop `sales_order_lines.recipe_id` (after ~2 post-Part-9 deploys).
- **Postgres RPCs for atomicity.** `startRun`, `completeRun`, `shipSalesOrder`, `receivePO`, `packCases` — eliminate overdraft under concurrency.
- **Per-SKU QBO Item mapping UI (phase 2).**
- **Auto-create QBO Items (phase 3).**
- **COGS at ship (phase 3).** Accrual-basis.
- **Deep SKU nesting (phase 3).** Pallet → case → unit.
- **Mixed cases (phase 3).** `parent_sku_id` → `sku_components` junction.

### UX / UI
- Recipe edit page (`/dashboard/recipes/[id]/edit`).
- Lot detail page (`/dashboard/lots/[id]`).
- Real landing page.
- Barcode / UPC scanning at fill.
- Multi-user member management.
- Audit log for cost overrides, expiry overrides, role changes.
- Forecasting / replenishment recommendations.

### Ops
- Low-stock email alerts cron.
- Expiring-lot email alerts cron.
- Proactive QBO token renewal cron.

### Tech debt
- More test coverage (FEFO allocator, traceability, completeRun invariant, QBO error handling).
- Recipe SKU + Active flag (migration 004-equivalent, see CLAUDE.md).
- PO `order_date` column (currently uses `created_at`).

---

# Appendix A — Troubleshooting

Carried from v3 Part 14 + new v4 failure modes.

### Error: auth/callback returns 404

**[CLAUDE CODE]**

```
The auth callback at /api/auth/callback is returning 404 in Lotmonster.
Likely cause: the src/proxy.ts matcher is intercepting /api routes and
redirecting to /login before they can execute.

Fix: confirm /api/auth/callback is in src/proxy.ts publicRoutes set.
Also verify the `matcher` config at the bottom of proxy.ts excludes it.
```

### Error: Supabase getAll is not a function

**[CLAUDE CODE]**

```
The Lotmonster Supabase client is throwing "getAll is not a function".
Means @supabase/ssr is below 0.4.0.

Run: npm list @supabase/ssr
If below 0.4.0: npm install @supabase/ssr@latest
Verify src/lib/supabase/server.ts uses getAll/setAll pattern, not
individual get/set.
```

### Error: QBO API returns 401

**[CLAUDE CODE]**

```
QBO is returning 401 in Lotmonster. Possible causes:

1. Access token expired (1-hour TTL). Check src/lib/qbo/tokens.ts auto-
   refresh logic.
2. Refresh token expired (100-day hard limit). If so, auto-disconnect
   was triggered; user must reconnect via /api/qbo/connect.
3. Refresh token wasn't rotated after the last refresh. QBO sends a
   NEW refresh token with every refresh; tokens.ts must persist it.

Debug:
- Check token cache in tokens.ts — refreshing before expiry?
- Query orgs.qbo_refresh_token_encrypted — was it updated after the
  last refresh? (updated_at column.)
- Add logging (temporarily) around the refresh call.
```

### Error: Cron job returns stale data

**[CLAUDE CODE]**

```
/api/cron/qbo-sync returns stale or cached results.

Fix: top of the route file must have:
  export const dynamic = 'force-dynamic';

Also confirm the route uses createAdminClient (service role), not a user
client — cron has no user session.
```

### Error: Claude tool_use returns tool_choice error

**[CLAUDE CODE]**

```
Lotmonster AI assistant errors about tool_choice/thinking incompatibility.

Fix: remove any `thinking: {...}` parameter from anthropic.messages.create()
calls that also pass `tools`. They are incompatible in claude-sonnet-4-6.

Also verify model = "claude-sonnet-4-6".
```

### Error: Stripe webhook returns 400

**[CLAUDE CODE]**

```
Lotmonster Stripe webhook returning 400. Nearly always because the raw
body isn't preserved.

Fix in src/app/api/stripe/webhook/route.ts:
  WRONG: const body = await request.json()
  RIGHT: const body = await request.text()

constructEvent() requires the EXACT raw body string.

Also verify:
- STRIPE_WEBHOOK_SECRET set in Vercel.
- Webhook URL in Stripe dashboard matches prod URL exactly.
- /api/stripe/webhook in src/proxy.ts publicRoutes.
```

### NEW (v4): completeRun invariant violation

**[CLAUDE CODE]**

```
completeRun is throwing "COGS invariant violated: run.total_cogs=X,
outputs.sum=Y, lots.sum=Z".

Diagnosis: the three values should match within $0.01. If they don't,
one of:
1. Rounding in volume_share math (numeric(12,4) vs numeric(12,6)
   — check the production_run_outputs schema).
2. Operator liquid_pct_override doesn't sum to 1.0.
3. Packaging consumption missed a BOM entry (maybe sku_packaging row
   pointing to a raw ingredient, which the server should reject but
   didn't).

Steps:
- Query production_run_lots for this run — confirm line_cost sums.
- Query production_run_outputs for this run — confirm
  allocated_cogs_total sums.
- Compute by hand: sum(outputs) vs sum(lots).
- Usually the fix is in the completeRun server code, not the data.

Do NOT mark the run 'completed' via a direct SQL UPDATE. Fix the
server code and retry.
```

### NEW (v4): Polymorphic lots XOR CHECK failure

**[CLAUDE CODE]**

```
INSERT on lots is failing with a CHECK constraint violation.

The constraint: ((ingredient_id IS NOT NULL) <> (sku_id IS NOT NULL)).
Exactly one of the two columns must be set — never both, never neither.

Check the calling code:
- Raw/packaging lot creation: ingredient_id set, sku_id NULL.
- Finished-goods lot creation (in completeRun): sku_id set,
  ingredient_id NULL.
- Any SELECT/INSERT that copies a lot: confirm the source has one column
  NULL.
```

### NEW (v4): QBO token rotation exhaustion

**[CLAUDE CODE]**

```
QBO auto-disconnect keeps firing in Lotmonster.

Root cause: refresh tokens have a 100-day hard limit, but the RUNNING
refresh-token is rotated on every access-token refresh. If rotation
isn't being persisted, each refresh "uses up" a 1-hour slot and the
original 100-day token dies quickly.

Check:
- src/lib/qbo/tokens.ts — after `refreshAccessToken` succeeds, is the
  new refresh token UPDATEd into orgs.qbo_refresh_token_encrypted?
- orgs.qbo_connected_at and orgs.qbo_token_updated_at — are they
  moving forward with each refresh, or stuck?

If rotation persistence is broken, fix it, then have the user
re-connect QBO via /api/qbo/connect.
```

### NEW (v4): Cron bearer mismatch

**[USER]** 401 from /api/cron/qbo-sync when hitting it with your stored
CRON_SECRET:

1. `grep CRON_SECRET /f/Projects/lotmonster/.env.local` — does that value
   match?
2. `vercel env pull --yes .env.vercel && grep CRON_SECRET .env.vercel` — does
   prod's value match?
3. If they differ: prod is the source of truth for the deployed cron. Update
   `.env.local` (and commit nothing).

If Vercel's cron dashboard shows invocations but all fail 401, the schedule
header isn't being set — Vercel's built-in cron system always injects
`Authorization: Bearer <CRON_SECRET>`; confirm `CRON_SECRET` is set in
Vercel env vars.

---

# Appendix B — Pre-Deploy Checklist

Extended from v3 Part 15. Walk before submission.

| # | Check | How to verify | Status |
|---|---|---|---|
| 1 | All env vars set in Vercel (Supabase, Anthropic, QBO, Stripe, CRON_SECRET, NEXT_PUBLIC_APP_URL) | Vercel → Settings → Environment Variables | ☐ |
| 2 | RLS enabled on ALL tables (13 original + skus + production_run_outputs + sku_packaging + ai_usage) | `SELECT relname, relrowsecurity FROM pg_class ...` | ☐ |
| 3 | No "Stackline" / template text leaks | `grep -ri "stackline" src/` = 0 hits | ☐ |
| 4 | No $0.00 lots | `SELECT COUNT(*) FROM lots WHERE unit_cost = 0` = 0 | ☐ |
| 5 | All three onboarding paths functional | Part 9A.3/9A.4/9A.5 pass | ☐ |
| 6 | save-ingredients bug fixed | Part 9A.4 pass | ☐ |
| 7 | Multi-SKU production run end-to-end | Part 9.10 + 9.16 pass | ☐ |
| 8 | Finished-goods lots on dashboard stats | Dashboard stat cards include finished inventory | ☐ |
| 9 | Traceability handles finished lots | Search finished lot → full chain | ☐ |
| 10 | QBO OAuth + disconnect (Part 9B) | verified | ☐ |
| 11 | All 3 QBO syncs post to sandbox (Part 9B) | verified | ☐ |
| 12 | Dispatcher cron syncs without manual curl (Part 11) | verified | ☐ |
| 13 | Stripe Checkout → webhook → plan active | Part 12.7 pass | ☐ |
| 14 | Customer portal opens | Part 12.7 pass | ☐ |
| 15 | Plan gating blocks over-limit creates | Create 51st ingredient on Starter → 403 | ☐ |
| 16 | AI assistant returns real data on 5 chips | Part 10.6 pass | ☐ |
| 17 | AI can't write (read-only role enforced) | Part 14.1 item #20 pass | ☐ |
| 18 | Settings page loads, QBO tab functional | Part 13.1 pass | ☐ |
| 19 | Mobile layout usable at 375px | UI audit passes | ☐ |
| 20 | Demo seeder runs clean | `npm run seed -- --reset` exit 0 | ☐ |
| 21 | Leaked credentials rotated | Part 14.2 done | ☐ |
| 22 | `/api/ai/query` rate-limited | Part 14.1 item #9 pass | ☐ |
| 23 | Polymorphic lots XOR CHECK enforced | Part 14.1 item #13 pass | ☐ |
| 24 | UPC partial uniqueness per-org | Part 14.1 item #12 pass | ☐ |
| 25 | COGS invariant enforced at completeRun | Part 14.1 item #15 pass (tests green) | ☐ |

---

*Lotmonster Build Guide v4 — supersedes v3 from Part 9 forward.*
*Master plan: `docs/plans/2026-04-16-build-plan-revised-from-part-9.md` (Bob).*
*SKU spec: `docs/plans/2026-04-16-skus-and-finished-goods.md` (Bob).*
*Generated 2026-04-16.*
