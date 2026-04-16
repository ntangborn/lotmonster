# SKUs and Finished Goods

**Date:** 2026-04-16
**Revised:** 2026-04-16 — user answered the 6 open questions; packaging-as-inventory pulled into phase 1, production-run completion UI gains expiry override, phase-2 case-pricing spec sharpened. See "Resolved questions" for the full answer log.
**Author:** Bob (build planner)
**Status:** Draft (rev 2) — design locked pending [DANNY] / [RAY] review

## Summary

Lotmonster today conflates "what you make" (a recipe) with "what you sell" (a SKU),
which breaks the moment a single batch of hot sauce is filled into two bottle sizes
or packed into cases. This plan introduces `skus` (with 2-level nesting via
`parent_sku_id`), a polymorphic `lots` table that carries finished-goods lots next
to raw-material lots, and a `production_run_outputs` table that records which SKUs
a run yielded and at what cost allocation. Phase 1 ships finished-goods tracking,
unit-SKU selling, **and packaging-component inventory** (bottles/caps/labels
modelled as ordinary `ingredients` rows with `kind='packaging'`, consumed per-unit
at run completion). Phase 2 adds case packing, case-SKU selling, and case-price
display toggles on invoices. Phase 3 covers deep nesting, auto-provisioned QBO
Items, and accrual-style COGS-at-ship.

---

## Current state

**What works today.** Raw materials are modelled cleanly: `ingredients` → `lots`
(with expiry, FEFO, unit cost). Production consumes lots via
`production_run_lots`, stamps `unit_cost_at_use`, rolls up to
`production_runs.total_cogs`, and fires a `qbo_sync_log` journal-entry row on
completion. Purchase orders and ingredient receiving close the loop on the
raw side.

**Where it breaks.**

1. `recipes` carries `target_yield` + `target_yield_unit` (e.g. "1280 fl oz" or
   "80 bottles"). That's a batch formula, not a sellable thing — it has no UPC,
   no retail price, no pack configuration.
2. `sales_order_lines.recipe_id NOT NULL` hard-codes the wrong relationship.
   An operator selling "16oz Jalapeño Hot Sauce" picks a recipe, not a SKU —
   there is no way to differentiate a 16oz bottle from a 32oz bottle of the
   same recipe, and no way to sell a case.
3. `completeRun` computes `cost_per_unit = total_cogs / actual_yield` treating
   the yield as a single uniform quantity. If a 10-gal batch fills 40× 16oz +
   20× 32oz, neither the 16oz unit-COGS nor the 32oz unit-COGS is
   `total_cogs / 60`.
4. There is no concept of "finished goods on hand." The dashboard's "current
   stock" counts raw lots only. The only way to see how many bottles are
   ready to ship is to scan completed runs — and even that doesn't net out
   what has already been shipped.
5. The ship-a-SO flow accepts a free-text `lot_numbers_allocated TEXT[]` on
   `sales_order_lines` with no FK — the operator types lot numbers with no
   validation that inventory actually exists or will be decremented.
6. QBO invoice sync uses `recipes.name` as the line description and a single
   `qbo_default_item_id` for every line. The right mapping is one QBO Item
   per SKU (UPC-level), eventually.
7. There is no packaging concept. Bottles, caps, and labels aren't in the
   system, so unit-COGS on a finished bottle currently reflects liquid only
   — the fill hardware's consumables are invisible to the books. **Resolved
   in phase 1** by modelling packaging as ordinary `ingredients` rows with
   `kind='packaging'` (see Q10 below).

None of this is broken in a "data-corruption" sense; it's an expressiveness
gap. The schema just doesn't know what a sellable unit is.

---

## Proposed model

### Schema diagram

```
                                       ┌──────────────┐
                                       │    orgs      │
                                       └──────┬───────┘
                                              │
         ┌────────────────────────────────────┼────────────────────────────────────┐
         │                                    │                                    │
  ┌──────▼──────┐                      ┌──────▼──────┐                    ┌────────▼───────┐
  │ ingredients │                      │   recipes   │                    │     skus       │
  │             │                      │             │                    │ (NEW)          │
  │             │                      │ yields_skus │◄───────────────────┤ parent_sku_id  │
  │             │                      └──────┬──────┘                    │ recipe_id (nl) │
  └──────┬──────┘                             │                           │ upc UNIQUE/org │
         │                                    │                           │ kind: unit|case│
         │                                    │                           └────┬───────────┘
         │                                    │                                │
         │                             ┌──────▼────────┐                       │
         │                             │production_runs│                       │
         │                             └──────┬────────┘                       │
         │                     ┌──────────────┼───────────────┐                │
         │                     │              │               │                │
  ┌──────▼──────┐  ┌───────────▼─────────┐   │    ┌───────────▼──────────────┐ │
  │    lots     │◄─┤ production_run_lots │   │    │ production_run_outputs   │ │
  │             │  │ (raw consumed)      │   │    │ (NEW: SKUs produced)     │◄┤
  │ ingredient_ │  └─────────────────────┘   │    │ run_id, sku_id, finished │ │
  │  id NULL    │                            │    │  lot_id, qty, cost_alloc │ │
  │ sku_id NULL │◄───────────────────────────┴───────────────────┘             │
  │ (polymorph) │                                                              │
  │ expiry, FEFO│◄────────────┐                                                │
  └──────┬──────┘             │                                                │
         │                    │                                                │
         │           ┌────────┴───────────┐                                    │
         │           │case_pack_events(P2)│    ◄── draws from unit-SKU lots,   │
         │           │ parent_sku_id,     │        creates case-SKU lots       │
         │           │ component_sku_id,  │                                    │
         │           │ qty_cases,         │                                    │
         │           │ source_lot_ids,    │                                    │
         │           │ new_lot_id         │                                    │
         │           └────────────────────┘                                    │
         │                                                                    │
  ┌──────▼──────────────┐                                                     │
  │ sales_order_lines   │                                                     │
  │  sku_id (NEW, FK) ──┼─────────────────────────────────────────────────────┘
  │  recipe_id DEPRECATD│
  └─────────────────────┘
```

### Decisions (answering design questions 1–9)

#### Q1. Schema — new tables vs extending

**New tables:** `skus`, `production_run_outputs`, `sku_packaging` (phase 1,
BOM-style join for declared packaging per SKU — see Q10), `case_pack_events`
(phase 2).

**Extended tables:** `lots` (add `sku_id` nullable, allow `ingredient_id` nullable,
CHECK exactly one is set); `sales_order_lines` (add `sku_id`, `price_display_mode`,
`unit_price_override`, phase out `recipe_id`); `sales_order_line_lots` (new
junction, phase 2 cleanup of the free-text `lot_numbers_allocated`);
`ingredients` (add `kind` column with CHECK IN `('raw','packaging')`,
defaulting to `'raw'` for every existing row — see Q10).

**Rationale.** The polymorphic-lots choice (see Q3) is the load-bearing
decision — once you accept that, everything else falls out cleanly without
parallel allocator / reporting / QBO-sync pipelines. The packaging-as-ingredients
choice (Q10) is the same pattern applied one level up: reuse the `lots` +
FEFO + PO machinery instead of building a parallel `packaging_components` table.

#### Q2. Nesting model — `parent_sku_id` self-reference, not a components table

**Chosen:** `skus.parent_sku_id UUID REFERENCES skus(id)` + `units_per_parent INTEGER`
on the child. Plus `kind CHECK IN ('unit','case','pallet')` so the UI can
distinguish render paths.

**Rejected:** A `sku_components` junction table with `(parent_sku_id,
component_sku_id, count)`. It generalizes to mixed-composition cases
("a gift pack with 3× 16oz + 1× 32oz") but we have zero evidence of that
demand; hot sauce cases are homogeneous. Junction adds query complexity
for the 99% case.

**Tradeoff.** A self-reference natively supports single-composition nesting
at any depth (bottle → case → pallet), but only one child-sku-kind per
parent. If a customer ever wants a mixed case, we'd migrate to the junction
model — flagged as a phase-3+ risk, not blocked today.

**Concrete example.**
- `sku A`: kind=unit, recipe_id=R, upc="012345678901", parent_sku_id=NULL
- `sku B`: kind=case, recipe_id=R (denormalized for reporting), upc="012345678918",
  parent_sku_id=A.id, units_per_parent=12

#### Q3. Finished-goods lots — polymorphic `lots`, not a new `finished_lots` table

**Chosen:** Add `sku_id UUID NULL` to `lots`. Make `ingredient_id` NULL-able.
Add `CHECK ((ingredient_id IS NOT NULL) <> (sku_id IS NOT NULL))` — exactly one
must be set. Add `production_run_id UUID NULL REFERENCES production_runs(id)`
so finished lots carry a direct pointer back to their birth run (for COGS,
traceability).

**Why.**
- **FEFO is identical code.** `allocateLots(ingredientId, qty, orgId)` becomes
  `allocateLots({ ingredientId?, skuId? }, qty, orgId)`. The sort (expiry ASC
  NULLS LAST, received ASC) and decrement logic don't change. One index
  becomes two (`lots_fefo_ingredient_idx`, `lots_fefo_sku_idx`) but the
  algorithm is shared.
- **Traceability queries simplify.** `traceForward(lot)` follows the same
  pattern whether the lot is a bag of peppers or a case of hot sauce. A
  separate `finished_lots` table would force every genealogy query to
  `UNION ALL`.
- **QBO blast radius is small.** The journal entry sync already uses
  raw-material lots only; finished-goods lots don't post journal entries
  directly. Invoice sync reads from `sales_order_lines`, not `lots`.

**Tradeoff.** A polymorphic column with a CHECK is a known anti-pattern in
purist data modelling. The alternative — a separate `finished_lots` table —
would require duplicating every index, every allocator, every admin query.
For a 2-tenant contest codebase that needs to ship, pragmatism wins. If we
ever regret it we can split later via a view.

[RAY] Review the CHECK constraint and the RLS policies on `lots` to make
sure adding `sku_id` doesn't widen the org-scope gap. The existing policies
use `org_id = current_org_id()` which is fine — but the admin-client writes
in `startRun` / `completeRun` bypass RLS, so we depend on server-side
validation that `sku_id` belongs to the caller's org.

#### Q4. Production-run output — operator-entered SKU yields at completion

**Chosen:** Operator enters per-SKU yields at `completeRun` time. Default
values come from a new `recipe_sku_yields` table (or denormalized onto the
SKU row — `sku.default_yield_per_batch`). Operator can override.

**Rejected alternatives.**
- **Pure default-driven.** Great for uniform runs, breaks for any batch
  that fills multiple sizes.
- **Per-SKU at run-start.** Feels cleaner in theory, but hot sauce makers
  often decide pack sizes after the batch cooks based on what bottles are
  on hand. Deferring to completion matches reality.

**Data written at completion.** For each SKU-yield the operator enters, we
insert:
1. A row in `production_run_outputs` with `(run_id, sku_id, quantity,
   cost_allocation_pct, allocated_cogs_liquid, allocated_cogs_packaging,
   allocated_cogs_total)` — the packaging split is carried separately for
   auditability (see Q10).
2. A row in `lots` with `sku_id=<sku>`, `production_run_id=<run>`,
   `quantity_received=quantity`, `quantity_remaining=quantity`,
   `unit_cost=allocated_cogs_total/quantity`, expiry pre-filled from
   `sku.shelf_life_days` **but operator-editable at completion** (Q11),
   lot number auto-generated (`{SKU_PREFIX}-{YYYYMMDD}-{NNN}`).
3. One `production_run_lots` row per packaging component consumed, drawn
   FEFO from `ingredients` rows where `kind='packaging'`, quantity =
   (BOM packaging-count * yield) — exactly the same machinery as raw
   ingredient consumption, just fired at `completeRun` instead of
   `startRun` (see Q10).

**Expiry override UI.** The complete-run dialog shows a date input per
output SKU, pre-filled with `today + sku.shelf_life_days` (or blank if
`shelf_life_days` is NULL). Operators can tweak it before submit. The
chosen date writes directly to `lots.expiry_date`. No audit trail in
phase 1 — the run's `updated_at` is sufficient; flag for [RAY] if a
full audit log is wanted later.

**Cost allocation.** See Q8. The default is allocate liquid COGS by volume
(oz filled), and packaging COGS per-unit (bottle count, not volume). The
completion UI shows both splits and lets the operator override the
liquid-percentage split if they need to; packaging is deterministic from
the BOM so it's not overridable.

[RAY] The auto-generated lot number needs an idempotency guard if the user
double-clicks "Complete" — a `(run_id, sku_id)` UNIQUE on
`production_run_outputs` would prevent the second submission from creating
phantom lots.

#### Q5. Case packing — explicit event, deferred to phase 2

**Chosen for MVP (phase 1):** No case packing at all. Only unit SKUs are
sellable. An SO line can only reference a unit-kind SKU.

**Chosen for phase 2:** A `case_pack_events` table records each pack:
`(parent_sku_id, component_sku_id, qty_cases, source_lot_ids[], new_lot_id,
packed_at, packed_by)`. Packing 5 cases of 12 decrements 60 units from FEFO
on the unit-SKU's lots and creates one lot of 5 units on the case-SKU. The
cost of each case = sum of 12 unit-COGS values drawn from the source lots.

**Rejected alternative — just-in-time case packing at ship.** Seductive
(no new event table), but it breaks inventory reporting: "how many cases do
I have ready to ship?" has no answer if cases don't physically exist until
a sale triggers their creation. CPG sales conversations routinely turn on
case availability, so pre-packed cases must be first-class inventory.

[DANNY] Phase 2 adds a second decrement-and-insert critical section. The
same atomicity warning as `startRun` applies — sequential writes with
best-effort rollback. Upgrade to a Postgres `rpc` function when
concurrency becomes real.

#### Q6. Sales-order reconciliation — add `sku_id`, migrate, deprecate `recipe_id`

**Migration path.**

1. **007_skus_and_finished_goods.sql** (phase 1):
   - Create `skus`, `production_run_outputs`, etc.
   - Add `lots.sku_id` (NULL), relax `lots.ingredient_id` to NULL-able,
     add the XOR CHECK.
   - Add `sales_order_lines.sku_id UUID REFERENCES skus(id)` (NULL-able).
   - Leave `sales_order_lines.recipe_id` as NOT NULL — existing rows still
     satisfy it, new rows will populate both (see backfill below).

2. **Backfill at deploy time** (idempotent script, run once via SQL):
   - For each existing `recipe` in every org, auto-create one `sku`:
     `kind='unit'`, `name=recipe.name`, `recipe_id=recipe.id`, UPC NULL,
     price NULL. This gives every historical SO line a SKU to point at.
   - `UPDATE sales_order_lines SET sku_id = <the auto-created sku>
     WHERE recipe_id IS NOT NULL AND sku_id IS NULL`.

3. **008_skus_sales_order_lines_cutover.sql** (after phase 1 ships and
   backfill is verified):
   - `ALTER sales_order_lines ALTER sku_id SET NOT NULL`.
   - `ALTER sales_order_lines ALTER recipe_id DROP NOT NULL`. Keep the
     column for one more deploy as a safety net; drop it in migration 009.

**Why this ordering matters.** A hard cut (drop `recipe_id` in one migration)
would break the existing SO list/detail pages the moment the migration runs,
because the SELECTs in `src/app/dashboard/sales-orders/**` still reference
`recipes(name)`. The staged path lets the app code be updated before the
column vanishes.

[DANNY] Backfill runs as part of the same migration or in a follow-up
script — user's call. Either way, verify by row count before deploying the
cutover migration. Contest timeline favors "same migration, inline DO block,"
matching the pattern from 006.

#### Q7. FEFO for finished goods — same allocator, parameter generalization

**Chosen:** `src/lib/fefo.ts` is the one place; generalize the public
interface to take `{ kind: 'ingredient' | 'sku'; id: string }`. Internally
the query flips `eq('ingredient_id', id)` to `eq('sku_id', id)`. The sort
and decrement logic don't change.

**Two indexes** instead of one:

```
CREATE INDEX lots_fefo_ingredient_idx
  ON lots (org_id, ingredient_id, expiry_date ASC NULLS LAST)
  WHERE status = 'available' AND ingredient_id IS NOT NULL;

CREATE INDEX lots_fefo_sku_idx
  ON lots (org_id, sku_id, expiry_date ASC NULLS LAST)
  WHERE status = 'available' AND sku_id IS NOT NULL;
```

**New allocator consumers.** (a) `shipSalesOrder` — currently takes free-text
lot numbers, will instead call `allocateLots({ kind: 'sku', id: line.sku_id },
line.quantity, orgId)` and decrement accordingly. (b) `packCases` (phase 2).

[RAY] When `shipSalesOrder` switches to real allocation + decrement, it
joins `startRun` on the list of actions that can overdraft under concurrent
writes. Note this in the review — a Postgres `rpc` is the right long-term
fix.

#### Q8. COGS — per-SKU allocation at completion, unit-COGS snapshot on the lot

**The problem.** A 10-gal batch yields 1,280 fl oz of sauce with
`liquid_cogs = $120`. If we fill 40× 16oz + 20× 32oz = 640 + 640 = 1,280 oz,
both SKUs have the same unit-volume liquid COGS ($0.09375/oz) — but different
per-bottle liquid COGS: $1.50 vs $3.00. Now add packaging: a 16oz bottle +
cap + label runs, say, $0.40, and a 32oz runs $0.55. The 16oz unit-COGS is
$1.90, the 32oz is $3.55. **Packaging is unit-based, not volume-based** —
two bottles that each hold 1oz of sauce still consume two bottles, two caps,
two labels.

**Chosen allocation rule.** Split run.total_cogs into two buckets and
allocate each by its own rule.

```
// Bucket 1 — liquid (raw-ingredient) COGS.
// This is what was already consumed by startRun: sum of
// production_run_lots where the source lot has kind='raw'.
liquid_total = sum(run.production_run_lots[raw].line_cost)

// For each output SKU, allocate liquid_total by volume share:
liquid_share(sku) = (sku.fill_quantity * quantity) / sum(fill_quantity * quantity across outputs)
liquid_cogs(sku)  = liquid_total * liquid_share(sku)

// Bucket 2 — packaging COGS.
// Consumed at completeRun, not startRun (see Q10). One BOM per SKU means
// packaging cost is deterministic per unit, not shared across SKUs.
packaging_cogs(sku) = sum over BOM entries of (bom.quantity * packaging_lot.unit_cost_at_use) * sku.quantity

// Unit-COGS snapshot on the finished lot:
unit_cogs(sku) = (liquid_cogs(sku) + packaging_cogs(sku)) / sku.quantity
```

The liquid allocator requires each SKU to declare its `fill_quantity` +
`fill_unit`. For non-liquid products (e.g. a future jam SKU that fills by
weight), the same columns work; the allocator normalizes by the existing
unit-conversion table in `src/lib/units.ts`.

**Why split the buckets.** Because operator override only applies to the
liquid bucket — packaging is a deterministic BOM-driven cost, not a
percentage the operator should be able to shift. Keeping them separate in
`production_run_outputs` also makes the audit trail cleaner: an accountant
can see "the 32oz took 2x the liquid cost of the 16oz because it holds 2x
the volume, and $0.55 of packaging per bottle."

**Persistence.**
- `production_run_outputs.cost_allocation_pct` (liquid split pct) +
  `allocated_cogs_liquid` + `allocated_cogs_packaging` + `allocated_cogs_total`
  store the decision.
- `lots.unit_cost` for each finished-goods lot stores
  `allocated_cogs_total / quantity`. This is the snapshot a sale draws on.
- `production_runs.total_cogs` sums liquid + packaging across all outputs.
  Invariant: `sum(production_run_outputs.allocated_cogs_total)` must equal
  `run.total_cogs` within ±$0.01 rounding.
- `production_runs.cost_per_unit` is **deprecated when multi-SKU runs exist.**
  Leave the column; just stop populating it when `production_run_outputs` has
  more than one row. The UI should read per-SKU unit-COGS instead.

**Sale-time COGS.** When an SO ships, each allocated lot contributes
`quantity_shipped * lot.unit_cost` to the sale's COGS. Sum across lots =
the invoice's true COGS. This matches the existing pattern on production
runs.

[RAY] Call out that cost allocation is a place operators can quietly lie
(override the liquid pct split to shift profit between SKUs). For a small
CPG this is a feature, not a bug — but we should log the override
(old_pct → new_pct) on `production_run_outputs` so an accountant can audit.
Packaging is NOT overridable — it's driven off the SKU's BOM and the FEFO
lot costs, full stop.

[RAY] **New invariant:** `sum(allocated_cogs_liquid + allocated_cogs_packaging)
across outputs` must equal `run.total_cogs` (which itself equals
`sum(production_run_lots.line_cost)` across both raw and packaging consumption).
Server-side check at completeRun time, refuse to complete on mismatch.

#### Q9. QBO sync — per-SKU item mapping, with fallback to current default

**Today.** `orgs.qbo_default_item_id` is used for every invoice line. The
recipe name goes in the line description.

**Phase 1 change:** Add `skus.qbo_item_id TEXT NULL`. Invoice sync uses
`sku.qbo_item_id ?? org.qbo_default_item_id`. This keeps existing orgs
working with zero config and lets orgs progressively map SKUs to QBO Items
as they're created.

**Phase 2 change:** Settings page gains a "QBO Mapping" section per SKU
with a QBO-Item-picker. Cases and units map independently (a case SKU
almost always has its own QBO Item in practice because pricing and
reporting differ).

**Phase 3 (deferred):** Auto-create QBO Items on SKU creation. Needs
`qbo_income_account_id` (already added in migration 005) and a POST to
QBO's `/item` endpoint. Not worth the extra API surface area during
contest window.

**Journal-entry sync** doesn't change. It reads raw-material
lot-consumption from `production_run_lots`, which is unchanged. What does
change: **COGS journal entry on ship.** Currently COGS is posted at run
completion (when raw inventory becomes finished inventory). With proper
finished-goods accounting, half of that entry should move to ship time
(Debit COGS / Credit Finished-Goods Inventory). Phase 3 item — it's a
real accounting concern, but the current simple entry is defensible for
a small CPG on cash basis. Flagging for [RAY] and user confirmation.

[RAY] When finished-goods lots are introduced, the balance-sheet picture
changes: raw-inventory dollars debit down at run-completion, finished-goods
dollars debit up by the same amount (net zero if COGS is booked at ship),
or the current "full COGS at completion" approach stays and finished-goods
inventory is always zero on the books. User confirmed: current
COGS-at-completion behavior is OK for contest launch. Revisit in phase 3
for accrual-basis customers.

#### Q10. Packaging components — modelled as `ingredients` rows with `kind='packaging'`, consumed at completeRun

**Chosen:** Packaging components (bottles, caps, labels, shrink-wrap,
cartons, etc.) live in the existing `ingredients` table. Add a
`kind text NOT NULL DEFAULT 'raw' CHECK (kind IN ('raw','packaging'))`
column. Packaging rows use the same `lots` + FEFO + PO flow as raw
ingredients today — zero new allocator code, zero new receiving UI,
zero new QBO sync code. They just show up in a separate list tab
("Packaging" next to "Raw ingredients") in `/dashboard/ingredients`.

**Rejected alternative: new `packaging_components` table.** Would mean
duplicating every allocator, every receiving flow, every PO line handler.
Massive surface area for near-zero expressiveness gain — packaging IS
inventory, so it should live where inventory lives.

**BOM model — per SKU, declared on the SKU (not the recipe).**

```
sku_packaging  (new, phase 1)
  id              uuid PK
  org_id          uuid FK   RLS
  sku_id          uuid FK → skus   ON DELETE CASCADE
  ingredient_id   uuid FK → ingredients   (must have kind='packaging')
  quantity        numeric(12,4)     (usually 1.0 for bottles/caps/labels)
  unit            text              (optional, defaults to ingredient.unit)
  notes           text NULL
  UNIQUE (sku_id, ingredient_id)
```

**Why SKU-level, not recipe-level?**
- A recipe (e.g. "Jalapeño Hot Sauce") is a liquid formula. It doesn't know
  how it'll be packaged. The same liquid goes into 16oz AND 32oz bottles.
- A SKU is the packaged product, so packaging belongs here.
- Case SKUs (phase 2) get their OWN `sku_packaging` rows for outer carton +
  case label — natural fit.

**When packaging is consumed:** at `completeRun`, not `startRun`. Rationale:
- Packaging is consumed during the fill step, which happens at the end of a
  run (after cook).
- The yields aren't known until completion (operator enters "40× 16oz +
  20× 32oz"). You can't decrement 40 bottles up-front.
- Mechanically: in `completeRun`, for each output SKU, look up its
  `sku_packaging` rows, multiply each by the yielded quantity, FEFO-allocate
  from the corresponding packaging ingredient's lots, write
  `production_run_lots` rows (same shape as raw consumption, just
  post-complete), add the packaging cost to `run.total_cogs`.
- If packaging is short (e.g. only 35 bottles available but 40 were yielded),
  completeRun **fails** with a clear error pointing to the shortfall. This
  matches the existing `startRun` behavior for short raw ingredients.

**Interaction with multi-SKU volume-share cost allocation.** See Q8 for the
full math. Short version: **liquid COGS splits by volume share, packaging
COGS is deterministic per-bottle.** A 10-gal batch filled as 40× 16oz +
20× 32oz:
- Liquid COGS ($120) splits 50/50 because each size drew 640 oz.
- Packaging COGS is calculated per SKU from its BOM, independently —
  $0.40 * 40 = $16 for the 16oz, $0.55 * 20 = $11 for the 32oz.
- The 16oz lot's unit-COGS = ($60 + $16) / 40 = $1.90
- The 32oz lot's unit-COGS = ($60 + $11) / 20 = $3.55

**Migration landing:** phase 1, in migration 007. The schema cost is cheap
(one enum column on ingredients, one new junction table, one new FK
constraint). The UI cost is modest (a "Packaging" tab on the ingredients
list, a BOM-editor section on the SKU detail page, a packaging-consumption
preview on the complete-run dialog). Net added effort: ~1 dev day — see the
revised effort table. Ship-confidence impact is actually **positive**: it
prevents a class of "unit-COGS looks wrong" user confusion in the contest
demo.

**PO / receiving side.** Already free. `ingredients` rows with
`kind='packaging'` go on POs exactly like raw ingredients today — the
supplier is Bottle Co, the unit is 'each', the unit_cost is per-bottle.
No PO code changes.

**QBO mapping.** Packaging ingredient consumption already flows through
`production_run_lots`, which the existing journal-entry sync reads. The
JE still reads `Debit COGS / Credit Inventory` — the Inventory credit just
happens to include $27 of bottles + caps + labels now. No JE sync changes.

[RAY] **New checks needed:**
- `sku_packaging.ingredient_id` FK needs a CHECK (or server-side guard)
  that the referenced ingredient has `kind='packaging'`. Can't enforce at
  the FK level; do a trigger or server-side insert validation.
- RLS on `sku_packaging` mirrors the pattern on other junction tables
  (`org_id = current_org_id()`).
- RLS on `ingredients` is unchanged, but the NEW `kind` column means a
  malicious client could POST `kind='packaging'` on a row meant to be raw.
  Server-side validation in `src/lib/ingredients/actions.ts` should gate
  this.
- The **COGS sum-equals-total invariant** from Q8 now spans liquid +
  packaging: `sum(production_run_lots.line_cost) across both raw and
  packaging = run.total_cogs = sum(production_run_outputs.allocated_cogs_total)`.
  Server-side check at completeRun.

[DANNY] Migration 007 now also adds the `ingredients.kind` column + the
`sku_packaging` table + their RLS policies. Still one migration. The
backfill DO block grows by one UPDATE: `UPDATE ingredients SET kind='raw'`
— trivially fast since all existing rows are raw.

#### Q11. Expiry override at completion

**Chosen:** YES. The complete-run dialog exposes an editable date per
finished lot, pre-filled from `today + sku.shelf_life_days` (or blank if
the SKU has no declared shelf life). Operator can edit before submit; the
value writes directly to the new `lots.expiry_date` row.

**No audit trail in phase 1.** The run's updated_at timestamp is enough
for the contest. If an accountant or QA auditor later wants "who set this
expiry and when," we add an `expiry_override_note` column or an
`audit_log` table. Flagged for [RAY] as a post-MVP enhancement.

**Schema impact:** none. `lots.expiry_date` already exists and is
nullable. The UI just surfaces it at the right moment.

#### Q12. Case pricing on invoices — display toggle + override (phase 2)

**Chosen:** Per-line presentation toggle on sales orders that lets the
operator show the line as either (a) 1× case at case-price or (b) N×
units at unit-price. The **underlying inventory math is unchanged** —
shipping 1 case of 12 still draws down 1 case-SKU lot (phase 2 pre-packed
case model) or 12 unit-SKU lots (case-on-demand, out of scope). The toggle
is presentation-only.

**Schema — new columns on `sales_order_lines` (phase 2, migration 009):**
- `price_display_mode text NOT NULL DEFAULT 'case' CHECK IN ('case','unit')`
  — default is 'case' when `sku.kind='case'`, 'unit' when `sku.kind='unit'`.
- `unit_price_override numeric(12,4) NULL` — if set, overrides the
  computed display price per line. NULL means "compute from SKU price".

**Display-price computation (read-only derivation):**

```
if price_display_mode == 'case':
    displayed_price = unit_price_override ?? sku.retail_price
    displayed_qty   = line.quantity    // number of cases
else:  // 'unit'
    if unit_price_override IS NOT NULL:
        displayed_price = unit_price_override
    else:
        displayed_price = sku.retail_price / sku.units_per_parent
    displayed_qty   = line.quantity * sku.units_per_parent
```

**QBO invoice sync implications:**
- Line description toggles: "Case (12× 16oz)" vs "16oz bottle".
- Line Qty and UnitAmount are always the displayed values — QBO doesn't
  care that internally we're tracking cases. The totals reconcile either way.
- If the operator displays as units but overrides the unit price, the QBO
  invoice shows N× units at the override price. Inventory still decrements
  as 1 case.

**Phase 1 implication:** none. Phase 1 only sells unit SKUs, so the
display mode is always 'unit' and the override is a nice-to-have. Phase 2
is where this lands because case SKUs are introduced there.

[RAY] The override field is a trust point — operators could price a case
at $1 on an invoice while decrementing full inventory. Standard CPG
concern (it's how discounts and promo pricing work). Log the override
value on the line row, which is what this model does anyway — no extra
audit surface needed.

---

## Phasing

### Phase 1 — MVP (contest cut, ~7.5 dev days)

**Ship:** finished-goods tracking for unit SKUs, single-SKU OR multi-SKU
production runs, **packaging components as inventory**, unit-SKU selling,
FEFO on finished lots, SO ship consuming real inventory, operator-editable
expiry at run completion.

**Migrations.** 007 (skus + output + polymorphic lots + SO.sku_id +
ingredients.kind + sku_packaging + backfill).

**Schema adds.**
- `skus` (full spec below)
- `production_run_outputs` (full spec below, with split liquid/packaging cost columns)
- `sku_packaging` junction (BOM for packaging components per SKU)
- `lots.sku_id`, `lots.production_run_id`, `lots.ingredient_id → NULL`,
  XOR CHECK, new FEFO indexes
- `ingredients.kind text NOT NULL DEFAULT 'raw' CHECK IN ('raw','packaging')`
- `sales_order_lines.sku_id`

**Server code.**
- `src/lib/skus/schema.ts` + `queries.ts` + `actions.ts` (list/create/detail
  + BOM editor)
- `src/lib/fefo.ts` — generalize to `{ kind, id }` — **breaking change** for
  existing callers, audit with grep
- `src/lib/production/actions.ts` — `completeRun` takes
  `outputs: { skuId, quantity, expiryDate?, liquidPctOverride? }[]`,
  writes `production_run_outputs` + finished-goods `lots`, AND
  FEFO-allocates + decrements packaging lots based on each SKU's
  `sku_packaging` BOM, writing additional `production_run_lots` rows.
  Enforces the liquid+packaging COGS invariant before commit.
- `src/lib/sales-orders/actions.ts` — `shipSalesOrder` switches from
  free-text lot numbers to real FEFO allocation against `line.sku_id`
- `src/lib/sales-orders/queries.ts` — switch joins from `recipes(name)`
  to `skus(name)`
- `src/lib/ingredients/actions.ts` — new `kind` param on create;
  server-side validation that packaging rows can only be referenced by
  `sku_packaging`, not by a recipe's ingredient list

**UI.**
- `/dashboard/skus` list + create + detail (reuses ingredient-page patterns);
  detail has a "Packaging BOM" section (pick packaging ingredient + qty per unit)
- `/dashboard/ingredients` — add a "Raw / Packaging" segmented tab filter
- `/dashboard/ingredients/new` — add kind radio (Raw / Packaging)
- `/dashboard/recipes/[id]` — add a "Yields SKUs" section
- `/dashboard/production-runs/[id]` — complete dialog gets:
  - SKU-yield inputs
  - Editable expiry date per output SKU (pre-filled from shelf_life_days)
  - Live cost-split preview showing liquid split AND packaging cost per SKU
  - Packaging shortfall warning if any BOM component is short
- `/dashboard/sales-orders/new` — product picker switches from recipe → SKU
- `/dashboard/sales-orders/[id]` — ship modal uses real allocation

**Out of scope for phase 1.**
- Case SKUs (`kind='case'`), `case_pack_events`, nested selling
- Per-SKU QBO Item mapping UI (use the default Item for now)
- Auto-creation of QBO Items
- UPC barcode scanning / pre-labeled bottles — operators type lot numbers
  manually, same as today (Q13 answered: defer)
- Case-price display toggle on invoices (Q12 — phase 2, lands with case SKUs)

**Definition of done.**
- A new recipe + 2 SKUs (16oz, 32oz) + packaging ingredients (16oz bottle,
  32oz bottle, cap, label) with BOMs set on each SKU → run the recipe →
  complete with mixed yields + a bumped expiry on one of the output lots →
  finished lots show correct unit-COGS including packaging → sell 10× 16oz
  on an SO → ship the SO → finished lots decrement + packaging lots are
  already decremented from complete step + `production_run_outputs` has 2
  rows with liquid+packaging split + invoice sync still writes to QBO
  (with `sku.qbo_item_id ?? default`).

### Phase 2 — Case packing + invoice display (~5–7 dev days, post-contest)

**Ship:** case SKUs, `case_pack_events`, FEFO on case lots,
`sales_order_line_lots` junction replacing the free-text
`lot_numbers_allocated`, case-price display toggle on invoices, per-SKU QBO
Item mapping.

- Migration 009: `case_pack_events`, `sku.parent_sku_id`, `units_per_parent`,
  `sales_order_line_lots` junction, `sales_order_lines.price_display_mode` +
  `unit_price_override`, drop `sales_order_lines.recipe_id` and
  `sales_order_lines.lot_numbers_allocated`.
- `src/lib/packing/actions.ts` — `packCases(parentSkuId, qty, orgId)` with
  FEFO against the child SKU's lots. Packaging consumption at pack time
  (outer carton + case label, declared on the case SKU's `sku_packaging`).
- `/dashboard/packing` page — list recent packs, "Pack cases" action.
- `/dashboard/sales-orders/[id]` — line editor gains case/unit display
  toggle + unit-price override field (Q12). Invoice renderer + QBO sync
  read the displayed values.
- Per-SKU QBO Item mapping UI in Settings.

### Phase 3 — Deep nesting, auto-items, COGS-at-ship (~1+ weeks, optional)

- Self-reference nesting at arbitrary depth (pallet > case > unit), already
  supported by the schema — just UI.
- Auto-create QBO Items on SKU creation (POST /item).
- Move COGS debit from run-completion to ship-time; finished-goods
  inventory appears on the balance sheet. (Q14: user confirmed current
  behavior is fine for contest; revisit here for accrual-basis customers.)
- Mixed cases → migrate to `sku_components` junction.
- Barcode / UPC scanning at fill step (Q13, deferred from phase 1).

---

## Table-by-table spec (phase 1)

### `skus` (new)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| org_id | uuid NOT NULL FK→orgs | `org_id = current_org_id()` RLS |
| recipe_id | uuid NULL FK→recipes | NULL for non-made goods (future) |
| parent_sku_id | uuid NULL FK→skus(id) | phase 2 case nesting |
| units_per_parent | int NULL | set on case SKUs; CHECK > 0 |
| kind | text NOT NULL | CHECK IN ('unit','case','pallet') |
| name | text NOT NULL | e.g. "Jalapeño Hot Sauce 16oz" |
| upc | text NULL | UNIQUE (org_id, upc) WHERE upc IS NOT NULL |
| fill_quantity | numeric(12,4) NULL | e.g. 16 |
| fill_unit | text NULL | e.g. 'fl_oz' |
| shelf_life_days | int NULL | auto-compute lot expiry on completion |
| retail_price | numeric(12,4) NULL | default SO line unit_price |
| qbo_item_id | text NULL | per-SKU override for invoice sync |
| lot_prefix | text NULL | e.g. "JAL16" for lot-number auto-gen |
| active | boolean NOT NULL default true | |
| notes | text NULL | |
| created_at, updated_at | timestamptz | RLS-fenced pattern |

**Indexes.**
- `(org_id, name)` for listing
- `(org_id, recipe_id) WHERE recipe_id IS NOT NULL` for "what do we make from R?"
- `(org_id, upc)` via UNIQUE constraint — partial so NULL UPCs are allowed

**RLS.** Identical pattern to every other table: `org_id = current_org_id()`
with the NULL guard. Four policies (select/insert/update/delete).

**UNIQUE/CHECK.**
- `UNIQUE (org_id, upc) WHERE upc IS NOT NULL` — [RAY] check that partial
  uniqueness is enforced per-org, not globally. UPCs are globally unique in
  the real world but we don't want a different org's UPC to collide with
  ours in the DB.
- `CHECK (kind IN ('unit','case','pallet'))`
- `CHECK (kind = 'unit' OR parent_sku_id IS NOT NULL)` — only unit SKUs
  can stand alone
- `CHECK ((parent_sku_id IS NULL) = (units_per_parent IS NULL))` — both
  set or both NULL

### `production_run_outputs` (new)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid NOT NULL FK→orgs | RLS |
| production_run_id | uuid NOT NULL FK→production_runs ON DELETE CASCADE | |
| sku_id | uuid NOT NULL FK→skus | |
| lot_id | uuid NOT NULL FK→lots | the finished lot this row created |
| quantity | numeric(12,4) NOT NULL | how many units yielded |
| cost_allocation_pct | numeric(6,4) NOT NULL | liquid-COGS share, 0.0000–1.0000 |
| allocated_cogs_liquid | numeric(12,4) NOT NULL | = liquid_total * pct |
| allocated_cogs_packaging | numeric(12,4) NOT NULL | = sum(BOM component_cost * quantity); 0 if SKU has no packaging BOM |
| allocated_cogs_total | numeric(12,4) NOT NULL | = liquid + packaging |
| unit_cogs | numeric(12,6) NOT NULL | = allocated_cogs_total / quantity |
| override_note | text NULL | if operator overrode the default liquid split |
| created_at | timestamptz NOT NULL | |

**UNIQUE** `(production_run_id, sku_id)`. [RAY] idempotency guard so a
double-click on "Complete" doesn't double-insert.

**Indexes.**
- `(org_id, production_run_id)` for "what did this run yield?"
- `(org_id, sku_id)` for "what runs have made this SKU?"
- `(lot_id)` for reverse-trace (finished lot → run)

### `ingredients` — additions

| Column | Type | Notes |
|---|---|---|
| kind | text NOT NULL DEFAULT 'raw' | CHECK IN ('raw','packaging'). Backfill: all existing rows = 'raw'. |

**Rationale.** Reuse the existing `ingredients` + `lots` + PO machinery for
packaging components. No new allocator, no new receiving flow. The UI
filters by `kind` for list views and restricts which rows can be pulled
into a recipe (raw only) vs. a `sku_packaging` BOM (packaging only).

**Server-side validation.**
- `recipe_ingredients.ingredient_id` — server must reject rows where
  `ingredients.kind='packaging'`. Can't enforce via FK; do at app layer.
- `sku_packaging.ingredient_id` — server must reject rows where
  `ingredients.kind='raw'`. Same story.

### `sku_packaging` (new)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid NOT NULL FK→orgs | RLS |
| sku_id | uuid NOT NULL FK→skus ON DELETE CASCADE | |
| ingredient_id | uuid NOT NULL FK→ingredients | must have kind='packaging' (server-validated) |
| quantity | numeric(12,4) NOT NULL | usually 1.0; CHECK > 0 |
| unit | text NULL | defaults to ingredient.unit if null |
| notes | text NULL | |
| created_at, updated_at | timestamptz | |

**UNIQUE** `(sku_id, ingredient_id)` — can't declare the same packaging
component twice on one SKU.

**Indexes.**
- `(org_id, sku_id)` for SKU-detail BOM fetch
- `(org_id, ingredient_id)` for "which SKUs use this bottle?" reverse lookup

**RLS.** Standard four policies, `org_id = current_org_id()` + NULL guard.

### `lots` — additions

| Column | Type | Notes |
|---|---|---|
| sku_id | uuid NULL FK→skus | NEW |
| production_run_id | uuid NULL FK→production_runs | NEW — direct back-pointer for finished lots |
| ingredient_id | uuid NULL | WAS NOT NULL — relax |
| (existing columns unchanged) | | |

**CHECK** `((ingredient_id IS NOT NULL) <> (sku_id IS NOT NULL))` — XOR.

**FEFO indexes** — see Q7.

**Back-compat.** Existing rows all have `ingredient_id IS NOT NULL` and
`sku_id IS NULL`, which satisfies the XOR.

### `sales_order_lines` — additions

| Column | Type | Notes |
|---|---|---|
| sku_id | uuid NULL → NOT NULL (phase 2) FK→skus | NEW in 007 as NULL-able, cut to NOT NULL in 008 after backfill |
| recipe_id | (unchanged) | deprecated, dropped in 009 |
| lot_numbers_allocated | text[] | deprecated, replaced by `sales_order_line_lots` junction in 009 |

### Migration numbering

- **007** — all of the above schema adds + inline backfill DO block:
  - Create `skus`, `production_run_outputs`, `sku_packaging`
  - Add `lots.sku_id`, `lots.production_run_id`, relax
    `lots.ingredient_id`, XOR CHECK, new FEFO indexes
  - Add `ingredients.kind` default 'raw', backfill existing rows to 'raw'
  - Add `sales_order_lines.sku_id` (NULL-able)
  - Inline DO block: create one SKU per existing recipe and populate
    `sales_order_lines.sku_id` from `recipe_id`
- **008** (post-deploy, after phase 1 app code ships) — `sku_id SET NOT NULL`,
  `recipe_id DROP NOT NULL`.
- **009** (phase 2) — `sales_order_line_lots`, drop old columns,
  `case_pack_events`, `skus.parent_sku_id`, `sales_order_lines.price_display_mode`
  + `unit_price_override`, etc.

[DANNY] Migration 007 does real work (creates 3 tables, extends 3 tables,
runs backfill). Run in a transaction; include row-count asserts in the DO
block so a failed backfill aborts the whole migration. Mirror the pattern
from 006.

---

## Resolved questions

User answered all 6 open questions on 2026-04-16. Answers below; each
consequence has been propagated into the relevant decision / phase section.

1. **SKU without recipe — YES.** `skus.recipe_id` is NULL-able. The
   "new SKU" form treats the recipe dropdown as optional. Use cases: resale
   goods, branded merch, cases of another brand's product (phase 2). No
   schema change from the original plan — it was already drafted as
   nullable. Propagated to: Q3 schema spec (already NULL-able), SKU list/create
   UI notes.

2. **Expiry override at completion — YES.** Complete-run dialog exposes
   an editable date input per output SKU, pre-filled from
   `today + sku.shelf_life_days`. No audit trail in phase 1. Propagated to:
   Q4 completion spec (new Q11 added), Phase 1 UI list, Complete-run dialog
   spec.

3. **Pre-labeled bottles / barcode scanning at fill — DEFER.** Phase 1
   keeps manual lot-number entry. No barcode scanner UI. Moved to Phase 3
   backlog.

4. **Packaging components as inventory — YES, in phase 1.** Modelled as
   ordinary `ingredients` rows with a new `kind` column
   (`'raw' | 'packaging'`). Reuses the full `lots` + FEFO + PO stack with
   zero new allocator code. BOM per SKU in a new `sku_packaging` junction
   table. Consumed at `completeRun` (not `startRun`), per yielded unit.
   See new Q10 decision block for the full reasoning; Q8 updated to split
   liquid-vs-packaging COGS allocation. Propagated to: Q1 schema list,
   Q4 completion data-written list, Q8 cost math, Phase 1 scope + effort,
   migration 007 scope, new table specs (`ingredients.kind`,
   `sku_packaging`), [RAY] invariant check.

5. **COGS at completion vs ship — keep current behavior.** Good for
   contest. Still an open question for accrual-basis customers; moved
   explicitly to Phase 3 "COGS-at-ship" bullet. No phase 1 change.

6. **Case pricing on invoices — display toggle + override, phase 2.**
   Per-line mode (`'case' | 'unit'`) plus optional `unit_price_override`.
   Underlying inventory math unchanged; the toggle is presentation-only.
   See new Q12 decision block. Propagated to: Phase 2 scope, migration 009
   schema adds. Phase 1 is unaffected because phase 1 only sells unit SKUs.

---

## Handoff to Danny

**Infrastructure + rollout concerns:**

- **Migration 007 is the load-bearing one.** It creates **3 new tables**
  (`skus`, `production_run_outputs`, `sku_packaging`), adds columns to **3
  existing tables** (`lots`, `sales_order_lines`, `ingredients`), adds two
  CHECK constraints (lots XOR, `ingredients.kind` enum), and runs an inline
  backfill DO block. Same shape as 006 but wider. Run in a transaction;
  abort on row-count mismatch.
- **Staged migration path.** 007 (additive, backfill) → ship phase-1 app
  code → 008 (tighten `sku_id` to NOT NULL, relax `recipe_id`). 008 should
  only run after phase 1 is deployed and verified, because it assumes app
  code populates `sku_id`.
- **FEFO index swap.** The existing `lots_fefo_idx` needs to become partial
  on `ingredient_id IS NOT NULL`, and we add a mirror index for `sku_id`.
  Worth benchmarking on a realistic dataset — indexes rebuild online in
  Supabase but add latency during the build.
- **Backfill volume.** Current tenants are demo-scale. Even a naive cursor
  loop completes in <1s. No streaming / batching needed.
- **Rollback story.** If 007 fails mid-way, the transaction rolls back
  cleanly. If 008 ever needs a rollback after 007 shipped, we're in a
  split-brain state (some SO lines have `sku_id`, others don't). Mitigation:
  keep `recipe_id` in the table through at least one more deploy before
  dropping it in 009.
- **No new environment variables.** The existing QBO envs cover the
  per-SKU Item mapping work (phase 2+).
- **Admin-client call sites grow.** `completeRun` now writes to **5 tables**
  atomically:
  1. `production_runs` (status, total_cogs, updated_at)
  2. `production_run_outputs` (one row per output SKU)
  3. `lots` (insert one finished-goods lot per output SKU)
  4. `lots` (decrement packaging lots — FEFO)
  5. `production_run_lots` (one row per packaging lot drawn, in addition
     to the raw-consumption rows already written at `startRun`)
  Same best-effort rollback pattern as today — flag for a future Postgres
  RPC. This is now the most complex critical-section in the system; the
  RPC upgrade is more urgent than it was.

## Handoff to Ray

**Security + integrity review items:**

- **UPC uniqueness scope.** `UNIQUE (org_id, upc) WHERE upc IS NOT NULL`
  is intentional — UPCs are globally unique in the real world, but we
  don't want a different Lotmonster org's UPC to block ours. Confirm
  that partial-unique semantics across orgs is the right call, or if we
  should also enforce a global uniqueness warning at app layer.
- **RLS on new tables (`skus`, `production_run_outputs`).** Four policies
  each, identical `org_id = current_org_id()` pattern. Audit that the
  admin-client writes in `completeRun` still validate the SKU's org_id
  before inserting outputs / lots. A malformed client payload could
  otherwise point `sku_id` at another org's SKU — we rely on server-side
  `.eq('org_id', orgId)` gating.
- **Polymorphic `lots` XOR CHECK.** Verify the constraint is enforced at
  write time (it is, unless someone disables CHECKs in a migration).
  Audit every INSERT/UPDATE call site against `lots` to be sure nothing
  sets both columns.
- **COGS integrity when a run spans multiple SKUs** — now also spanning
  liquid + packaging. Default volume-based allocation is deterministic for
  liquid, BOM-driven for packaging. Operator override is allowed on the
  liquid split only. Invariant:
  `sum(production_run_outputs.allocated_cogs_total) ==
   run.total_cogs ==
   sum(production_run_lots.line_cost across raw + packaging)`
  within ±$0.01 rounding tolerance. Add a server-side invariant check at
  `completeRun` time — refuse to complete if any of the three equalities
  fails.
- **`ingredients.kind` integrity.** A raw ingredient cannot appear in a
  `sku_packaging` BOM, and a packaging ingredient cannot appear in a
  recipe's ingredient list. Not enforceable via FK; needs server-side
  validation in `src/lib/recipes/actions.ts` and
  `src/lib/skus/actions.ts` on write. Audit that no place in the UI lets
  the user bypass this (the ingredient-picker dropdowns should filter by
  kind up-front).
- **RLS on `sku_packaging`.** Standard four-policy pattern. Verify at
  review time — same shape as `recipe_ingredients`.
- **`kind` column mutation.** Once an ingredient has lots or PO lines,
  flipping its `kind` from raw→packaging (or vice versa) retroactively
  miscategorizes historical data. Either lock the column after first use
  (server-side validation: refuse to update `kind` if any lots exist), or
  accept the retrospective-flip risk. Recommend lock-after-first-use.
- **Sale-time allocation concurrency.** `shipSalesOrder` switches from
  free-text lot numbers to real FEFO + decrement. Joins `startRun` on
  the list of actions that can overdraft under concurrent writes. Flag
  in the phase-1 review with an explicit recommendation to move both
  to a Postgres `rpc` function before any real multi-user rollout.
- **Operator-override audit trail on cost allocation.** Record `old_pct`
  and `new_pct` on `production_run_outputs.override_note` (or a dedicated
  audit column) so an accountant can reconstruct who shifted cost between
  SKUs and when.
- **`production_run_outputs` UNIQUE (run_id, sku_id).** Critical idempotency
  guard against double-submission of "Complete Run." Verify it's in migration
  007.
- **Lot-number collisions.** `UNIQUE (org_id, lot_number)` on `lots` is
  already there. Auto-generated finished-lot numbers
  (`{SKU_PREFIX}-{YYYYMMDD}-{NNN}`) need a uniqueness probe + retry pattern
  (the raw-lot creation code already has this — reuse it).
- **QBO fallback mapping.** If `sku.qbo_item_id` is set to a value the
  caller doesn't own in QBO (e.g. the operator manually pasted a realm's
  item ID that doesn't match the org's connected realm), invoice sync will
  fail at post-time. Same failure mode already exists for `qbo_default_item_id`,
  so no new threat — just flag the symmetry.

---

## Effort estimates (phase 1 rough, for planning only)

| Work | Days |
|---|---|
| Migration 007 + backfill + local testing (wider than v1) | 0.75 |
| `src/lib/skus` (schema/queries/actions + BOM CRUD) | 1.25 |
| FEFO generalization + call-site audit | 0.5 |
| `completeRun` rewrite: cost-split + expiry override + packaging consumption + invariant check + tests | 1.5 |
| `shipSalesOrder` rewrite to real allocation | 0.5 |
| `/dashboard/skus` list + create + detail + BOM editor | 1.25 |
| `/dashboard/ingredients` — kind filter tab + kind field on new form | 0.25 |
| Production-run complete UI (SKU-yield inputs + expiry override + cost-split + packaging preview + shortfall warning) | 1.0 |
| SO new + ship UI update | 0.5 |
| QBO invoice sync — SKU item lookup fallback | 0.25 |
| End-to-end smoke + contest-scenario validation (recipe + SKUs + packaging BOM + multi-size run + ship + QBO) | 0.75 |
| **Total** | **~8.5** |

Net delta from v1 of this plan: +2 dev days, almost all from the packaging
work (BOM editor UI, completeRun packaging consumption, cost-split
preview enhancement, and the wider e2e scenario). User confirmed they're
OK on timing (day 2 of build, already at stage 9), so the right call is to
ship packaging-in-phase-1 and accept the extra time — shipping unit-COGS
that correctly includes bottles + caps + labels is a significantly stronger
contest demo than shipping it without.

If a late scope-cut IS needed, cut lines in order:
1. BOM editor becomes flat form instead of per-row add/remove (~0.25 day
   back).
2. Cost-split preview shows post-save only, not live (~0.25 day back).
3. Defer `ingredients.kind` UI filter; keep the backend column + server
   validation, show everything in one list in phase 1 (~0.25 day back).
4. Defer expiry override (use computed default, no UI input) (~0.25 day
   back).

Full cut-line = ~1 day back, landing at ~7.5 days. Do not cut packaging
entirely — rolling it back to phase 3 re-introduces the "why is my 16oz
bottle COGS only $1.50 when a bottle costs $0.30?" demo problem.

