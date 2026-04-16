# SKUs and Finished Goods

**Date:** 2026-04-16
**Author:** Bob (build planner)
**Status:** Draft — awaiting user sign-off on open questions and [DANNY] / [RAY] review

## Summary

Lotmonster today conflates "what you make" (a recipe) with "what you sell" (a SKU),
which breaks the moment a single batch of hot sauce is filled into two bottle sizes
or packed into cases. This plan introduces `skus` (with 2-level nesting via
`parent_sku_id`), a polymorphic `lots` table that carries finished-goods lots next
to raw-material lots, and a `production_run_outputs` table that records which SKUs
a run yielded and at what cost allocation. The MVP ships finished-goods tracking
plus unit-SKU selling in phase 1 (contest window), case-pack and case-SKU selling
in phase 2, and deep nesting / full QBO item auto-provisioning in phase 3.

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
   system; they'd either need to become ingredients (consumed per-unit at
   the packaging step) or be tracked as their own "packaging components."
   The user hasn't prioritized this — see Open Questions.

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

**New tables:** `skus`, `production_run_outputs`, `case_pack_events` (phase 2).

**Extended tables:** `lots` (add `sku_id` nullable, allow `ingredient_id` nullable,
CHECK exactly one is set); `sales_order_lines` (add `sku_id`, phase out
`recipe_id`); `sales_order_line_lots` (new junction, phase 2 cleanup of the free-text
`lot_numbers_allocated`).

**Rationale.** The polymorphic-lots choice (see Q3) is the load-bearing
decision — once you accept that, everything else falls out cleanly without
parallel allocator / reporting / QBO-sync pipelines.

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
   cost_allocation_pct, allocated_cogs)`.
2. A row in `lots` with `sku_id=<sku>`, `production_run_id=<run>`,
   `quantity_received=quantity`, `quantity_remaining=quantity`,
   `unit_cost=allocated_cogs/quantity`, expiry auto-calculated from
   `sku.shelf_life_days`, lot number auto-generated
   (`{SKU_PREFIX}-{YYYYMMDD}-{NNN}`).

**Cost allocation.** See Q8. The default is allocate-by-volume (oz filled),
which handles "40× 16oz + 20× 32oz from one 10-gal batch" correctly. The
completion UI shows the computed split and lets the operator override the
percentage if they need to.

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
`total_cogs = $120`. If we fill 40× 16oz + 20× 32oz = 640 + 640 = 1,280 oz,
both SKUs have the same unit-volume COGS ($0.09375/oz) — but different
per-bottle COGS: $1.50 vs $3.00. If we fill 80× 16oz = 1,280 oz, the single
SKU has $1.50 per bottle. `total_cogs / total_bottles` gives $120/100 = $1.20
per bottle in the mixed case, which is wrong.

**Chosen allocation rule.** Per-SKU COGS allocated by **volume share** by
default, operator-override at completion.

```
// For each output SKU:
cost_share  = (sku.volume_per_unit * quantity) / sum(volume_per_unit * quantity across outputs)
allocated_cogs     = total_cogs * cost_share
unit_cogs          = allocated_cogs / quantity              // persisted on lots.unit_cost
```

The volume share requires each SKU to declare its `fill_volume` (e.g.
`16 fl oz`). For non-liquid products (e.g. a future jam SKU that fills by
weight), the column generalizes to `fill_quantity` + `fill_unit`; the
allocator normalizes by a conversion table.

**Persistence.**
- `production_run_outputs.cost_allocation_pct` + `allocated_cogs` stores the
  decision.
- `lots.unit_cost` for each finished-goods lot stores `allocated_cogs /
  quantity`. This is the snapshot a sale draws on.
- `production_runs.cost_per_unit` is **deprecated when multi-SKU runs exist.**
  Leave the column; just stop populating it when `production_run_outputs` has
  more than one row. The UI should read per-SKU unit-COGS instead.

**Sale-time COGS.** When an SO ships, each allocated lot contributes
`quantity_shipped * lot.unit_cost` to the sale's COGS. Sum across lots =
the invoice's true COGS. This matches the existing pattern on production
runs.

[RAY] Call out that cost allocation is a place operators can quietly lie
(override the pct split to shift profit between SKUs). For a small CPG this
is a feature, not a bug — but we should log the override (old_pct → new_pct)
on `production_run_outputs` so an accountant can audit.

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
inventory is always zero on the books. User must decide. Phase 3.

---

## Phasing

### Phase 1 — MVP (contest cut, ~5–7 dev days)

**Ship:** finished-goods tracking for unit SKUs, single-SKU OR multi-SKU
production runs, unit-SKU selling, FEFO on finished lots, SO ship consuming
real inventory.

**Migrations.** 007 (skus + output + polymorphic lots + SO.sku_id +
backfill).

**Schema adds.**
- `skus` (full spec below)
- `production_run_outputs` (full spec below)
- `lots.sku_id`, `lots.production_run_id`, `lots.ingredient_id → NULL`,
  XOR CHECK, new FEFO indexes
- `sales_order_lines.sku_id`

**Server code.**
- `src/lib/skus/schema.ts` + `queries.ts` + `actions.ts` (list/create/detail)
- `src/lib/fefo.ts` — generalize to `{ kind, id }` — **breaking change** for
  existing callers, audit with grep
- `src/lib/production/actions.ts` — `completeRun` takes a
  `outputs: { skuId, quantity, pctOverride? }[]` param, writes both
  `production_run_outputs` and finished-goods `lots`
- `src/lib/sales-orders/actions.ts` — `shipSalesOrder` switches from
  free-text lot numbers to real FEFO allocation against `line.sku_id`
- `src/lib/sales-orders/queries.ts` — switch joins from `recipes(name)`
  to `skus(name)`

**UI.**
- `/dashboard/skus` list + create + detail (reuses ingredient-page patterns)
- `/dashboard/recipes/[id]` — add a "Yields SKUs" section
- `/dashboard/production-runs/[id]` — complete dialog gets SKU-yield
  inputs + live cost-split preview
- `/dashboard/sales-orders/new` — product picker switches from recipe → SKU
- `/dashboard/sales-orders/[id]` — ship modal uses real allocation

**Out of scope for phase 1.**
- Case SKUs (`kind='case'`), `case_pack_events`, nested selling
- Per-SKU QBO Item mapping UI (use the default Item for now)
- Auto-creation of QBO Items
- UPC barcode scanning
- Packaging components (bottles/caps/labels as consumables)

**Definition of done.**
- A new recipe → create 2 SKUs (say, 16oz and 32oz) → run the recipe →
  complete with mixed yields → sell 10× 16oz on an SO → ship the SO →
  finished lots decrement, `production_run_outputs` has 2 rows, invoice
  sync still writes to QBO (with `sku.qbo_item_id ?? default`).

### Phase 2 — Case packing (~4–6 dev days, post-contest)

**Ship:** case SKUs, `case_pack_events`, FEFO on case lots, `sales_order_line_lots`
junction replacing the free-text `lot_numbers_allocated`.

- Migration 009: `case_pack_events`, `sku.parent_sku_id`, `units_per_parent`,
  `sales_order_line_lots` junction, drop `sales_order_lines.recipe_id` and
  `sales_order_lines.lot_numbers_allocated`.
- `src/lib/packing/actions.ts` — `packCases(parentSkuId, qty, orgId)` with
  FEFO against the child SKU's lots.
- `/dashboard/packing` page — list recent packs, "Pack cases" action.
- Per-SKU QBO Item mapping UI in Settings.

### Phase 3 — Deep nesting, auto-items, COGS-at-ship (~1+ weeks, optional)

- Self-reference nesting at arbitrary depth (pallet > case > unit), already
  supported by the schema — just UI.
- Auto-create QBO Items on SKU creation (POST /item).
- Move COGS debit from run-completion to ship-time; finished-goods
  inventory appears on the balance sheet.
- Mixed cases → migrate to `sku_components` junction.
- Packaging components as first-class ingredients (bottle/cap/label consumed
  per unit).

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
| cost_allocation_pct | numeric(6,4) NOT NULL | 0.0000–1.0000 |
| allocated_cogs | numeric(12,4) NOT NULL | = run.total_cogs * pct |
| unit_cogs | numeric(12,6) NOT NULL | = allocated_cogs / quantity |
| override_note | text NULL | if operator overrode the default split |
| created_at | timestamptz NOT NULL | |

**UNIQUE** `(production_run_id, sku_id)`. [RAY] idempotency guard so a
double-click on "Complete" doesn't double-insert.

**Indexes.**
- `(org_id, production_run_id)` for "what did this run yield?"
- `(org_id, sku_id)` for "what runs have made this SKU?"
- `(lot_id)` for reverse-trace (finished lot → run)

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

- **007** — all of the above schema adds + inline backfill DO block to
  create one SKU per existing recipe and populate `sales_order_lines.sku_id`
  from `recipe_id`.
- **008** (post-deploy, after phase 1 app code ships) — `sku_id SET NOT NULL`,
  `recipe_id DROP NOT NULL`.
- **009** (phase 2) — `sales_order_line_lots`, drop old columns,
  `case_pack_events`, `skus.parent_sku_id` etc.

[DANNY] Migration 007 does real work (creates skus, updates SO lines). Run
in a transaction; include row-count asserts in the DO block so a failed
backfill aborts the whole migration. Mirror the pattern from 006.

---

## Open questions

These need user input before the phase-1 migration is finalized:

1. **Can a SKU exist without a recipe?** Use case: selling branded merch,
   resale goods, case packs of a different brand's product. My default is
   yes (`recipe_id` NULL is allowed) so we don't paint ourselves into a
   corner, but it affects UI ("new SKU" form: is the recipe dropdown
   required?).

2. **Expiry override at completion.** Do operators ever want to override
   the auto-calculated expiry date on finished lots (e.g. a batch cooked
   "a little hot" gets a longer shelf life, or a manual lot-expiry correction
   after a QA test)? My default is yes, UI exposes it.

3. **Does the first customer (hot sauce) pre-label bottles with lot numbers
   and UPCs, or does the lot number get written during the fill step?**
   Affects whether phase 1 needs barcode scanning in the complete-run UI
   (probably deferrable).

4. **Packaging components.** Are 16oz bottles, caps, and labels tracked
   as inventory? If yes, they either become ingredients consumed at the
   packaging step (clean, reuses the `lots` + FEFO machinery) or a new
   `packaging_components` concept. I'm parking this for phase 3 unless
   the user says otherwise.

5. **Accounting stance on COGS-at-ship vs COGS-at-production.** Small
   CPGs on cash basis typically don't care; those on accrual do. The
   existing "Debit COGS / Credit Raw Inventory" at run-completion is
   defensible for cash basis but is technically posting COGS before the
   product is sold. Defer to phase 3, but the user should confirm they're
   OK with the current behavior for contest-launch.

6. **Case pricing model for phase 2.** When a customer buys a case,
   does the invoice show 1× case at case-price, or 12× units at unit-price?
   Most B2B invoices show cases-as-a-unit (cleaner reconciliation with
   purchase orders on the buyer side). Confirm.

---

## Handoff to Danny

**Infrastructure + rollout concerns:**

- **Migration 007 is the load-bearing one.** It creates 2 new tables, adds
  columns to 2 existing tables, adds a CHECK constraint, and runs an inline
  backfill DO block. Same shape as 006. Run in a transaction; abort on
  row-count mismatch.
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
- **Admin-client call sites grow.** `completeRun` now writes to 3 tables
  atomically (production_runs update, production_run_outputs insert, lots
  insert). Same best-effort rollback pattern as today — flag for a future
  Postgres RPC.

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
- **COGS integrity when a run spans multiple SKUs.** Default volume-based
  allocation is deterministic, but the operator-override path means
  `sum(allocated_cogs) across outputs` must equal `run.total_cogs` within
  rounding tolerance (±$0.01). Add a server-side invariant check at
  `completeRun` time — refuse to complete if the sum doesn't match.
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
| Migration 007 + backfill + local testing | 0.5 |
| `src/lib/skus` (schema/queries/actions) | 1.0 |
| FEFO generalization + call-site audit | 0.5 |
| `completeRun` rewrite + cost-split logic + tests | 1.0 |
| `shipSalesOrder` rewrite to real allocation | 0.5 |
| `/dashboard/skus` list + create + detail | 1.0 |
| Production-run complete UI (SKU-yield inputs + preview) | 0.75 |
| SO new + ship UI update | 0.5 |
| QBO invoice sync — SKU item lookup fallback | 0.25 |
| End-to-end smoke + contest-scenario validation | 0.5 |
| **Total** | **~6.5** |

Contest deadline-window work; no slack. If 6 days is too long, the cut line
is: defer the "recipe yields SKUs" default-yield row (make operators enter
manually every time) and defer the cost-split preview (show the number
post-save only). That claws back ~1 day.

