# Part 9A — Test Existing Functionality (printable checklist)

Test against **https://www.lotmonster.co**. If anything breaks:

```bash
vercel logs --no-follow --since 30m --level error --expand
```

Copy the error + route + digest into chat.

---

## Auth (5 min)
- [ ] Sign up with a fresh email → 8-digit code arrives → paste → lands on `/dashboard/onboarding`
- [ ] Log in with existing account → 8-digit code → lands on `/dashboard`
- [ ] Log out from sidebar → back to `/login`
- [ ] Visit `/dashboard` when logged out → redirects to `/login?next=/dashboard`
- [ ] Google OAuth sign-in works end-to-end
- [ ] New signup's Ingredients page loads without 500 (proves org auto-create trigger fired)

## Onboarding — Path A: Upload (5 min)
- [ ] Upload a CSV with 5+ ingredients → Claude Vision returns mapped columns
- [ ] Edit a parsed cost in the review table → value persists after Save
- [ ] Saved ingredients appear in `/dashboard/ingredients`
- [ ] Upload a PDF or image → OCR path also works

## Onboarding — Path B: Manual (5 min)
- [ ] Add 3 ingredients using bulk pricing (bulk qty + bulk cost) → unit cost derives live
- [ ] Enter $0 bulk cost → zero-cost guard fires
- [ ] "Save All" → redirects to `/dashboard/ingredients`, all 3 rows visible with correct `cost_per_unit`

## Onboarding — Path C: Chat (5 min)
- [ ] Describe 3 ingredients conversationally → staging panel updates live
- [ ] Accept staging → ingredients land in `/dashboard/ingredients`

## Ingredients (5 min)
- [ ] List renders with working search + category filter
- [ ] Click an ingredient → detail shows 3 tabs: Lots, Used In, Purchase History
- [ ] Inline edit name/category → saves
- [ ] Try deleting an ingredient that has lots → refusal toast (FK)
- [ ] Delete a lot-free ingredient → row disappears

## Lots (10 min)
- [ ] `/dashboard/lots` shows FEFO order (expiry ASC, NULLS LAST, then received ASC)
- [ ] Lots ≤7d to expiry: red row tint. ≤30d: yellow tint.
- [ ] Filters work: ingredient, status, expiry window
- [ ] "New Lot" modal: ingredient dropdown searches, lot # auto-suggests `PREFIX-YYYYMMDD-NNN`
- [ ] Zero-cost guard fires on `unit_cost=0`
- [ ] Live total = `qty × unit_cost` updates as you type
- [ ] Save creates a lot with `status='available'`

## Recipes (5 min)
- [ ] List shows recipes with Updated date column
- [ ] New recipe: add 3+ ingredient lines → drag-handle reorders → live cost preview updates
- [ ] "Save" persists recipe
- [ ] "Save & Start Production Run" jumps to `/production-runs/new` with `recipe_id` pre-filled

## Production Runs (15 min — highest risk)
- [ ] New run with a recipe → FEFO preview shows which lots would be allocated
- [ ] Click **Start** → run goes Draft → In Progress; `production_run_lots` rows created; source lots decremented
- [ ] Deliberately start a run with insufficient stock → `InsufficientStockError` toast, no partial allocation
- [ ] **Complete** → `total_cogs` shown, `waste_pct` computed
- [ ] Inspect DB: `qbo_sync_log` row exists with `entity_type='journal_entry'`, `status='pending'`
- [ ] **Cancel** a Draft or In-Progress run → stock returned to source lots
- [ ] Auto run number format: `PR-YYYY-NNN`

## Purchase Orders (10 min)
- [ ] New PO → supplier name autocompletes from existing suppliers
- [ ] "Add from Low Stock" button pulls low-stock ingredients in as line items
- [ ] Save → `PO-YYYY-NNN`, status draft
- [ ] Submit → status submitted
- [ ] Receive page: per-line qty + lot # (auto-suggest) + expiry + override unit cost
- [ ] Click Receive → real lots created; `qbo_sync_log` row with `entity_type='bill'`

## Sales Orders (10 min)
- [ ] New SO → customer datalist autocomplete works
- [ ] Add line items by recipe (note: will migrate to SKUs in Part 9)
- [ ] Confirm → status confirmed
- [ ] Ship modal → lot allocation suggestions auto-populate via FEFO
- [ ] Override lot numbers manually → ship still succeeds
- [ ] `qbo_sync_log` row written with `entity_type='invoice'`
- [ ] Lot Traceability section visible on shipped SO; deep-links navigate correctly
- [ ] "View Traceability" button → `/dashboard/traceability` with SO pre-filled

## Traceability (5 min)
- [ ] Search by **Lot** → forward trace: lot → runs → SOs
- [ ] Search by **Run** → middle-out trace (both directions)
- [ ] Search by **Order** → reverse trace: SO → runs → ingredient lots → suppliers
- [ ] Color-coded stages connected by flow arrows

## Dashboard (5 min)
- [ ] 4 stats cards render: Active Ingredients, Active Lots, Expiring This Week, Month COGS
- [ ] Expiring Soon card: lots ≤30d; ≤7d in red
- [ ] Low Stock card: ingredients below threshold; "Reorder" button → `/purchase-orders/new?ingredient=<id>`
- [ ] All counts scoped to your org only (no cross-org leak)

## Known-broken spots (don't test; Part 9B/13 fix these)
- `/dashboard/settings` → 404 (QBO OAuth callback redirects here today)
- `/dashboard/ai` → 404 (Part 10 builds this)
- Recipe edit page → doesn't exist (PATCH API works)
- Lot detail page → doesn't exist (list only)

## Automated tests (background check, ~2 min)
```bash
npx vitest run src/lib/__tests__/cogs.test.ts
npx vitest run src/lib/__tests__/units.test.ts
```
- [ ] Both suites green

---

## Pass criterion
- [ ] All checkable sections above ticked
- [ ] No unexplained 500s in `vercel logs` for the test window
- [ ] Then move on to Part 9B (QBO end-to-end)

**Est. total time: 90 min** if everything works. Add ~30 min buffer for one real bug.
