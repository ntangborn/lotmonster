-- =============================================================================
-- Lotmonster — Initial Schema Migration
-- 001_initial_schema.sql
--
-- Table creation order (dependency-safe):
--   1.  orgs
--   2.  org_members
--   3.  ingredients
--   4.  recipes
--   5.  recipe_lines
--   6.  purchase_orders
--   7.  purchase_order_lines
--   8.  lots                   (references purchase_orders)
--   9.  production_runs        (references recipes)
--  10.  production_run_lots    (references production_runs, lots)
--  11.  sales_orders
--  12.  sales_order_lines      (references sales_orders, recipes)
--  13.  qbo_sync_log
-- =============================================================================


-- =============================================================================
-- HELPER: JWT claim extractor
-- Returns the org_id from app_metadata in the Supabase JWT.
-- Returns NULL if the claim is absent — RLS policies treat NULL as deny.
-- =============================================================================

CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    auth.jwt() -> 'app_metadata' ->> 'org_id',
    ''
  )::uuid
$$;


-- =============================================================================
-- HELPER: updated_at trigger function
-- Automatically stamps updated_at on every UPDATE.
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 1. ORGS
-- =============================================================================

CREATE TABLE orgs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  slug               TEXT        NOT NULL UNIQUE,
  plan               TEXT        NOT NULL DEFAULT 'free'
                                   CHECK (plan IN ('free', 'starter', 'growth', 'scale')),
  stripe_customer_id TEXT,
  qbo_realm_id       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

-- Orgs: users can only see/edit their own org (id = JWT org_id)
CREATE POLICY "orgs_select" ON orgs
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND id = auth.org_id()
  );

CREATE POLICY "orgs_insert" ON orgs
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND id = auth.org_id()
  );

CREATE POLICY "orgs_update" ON orgs
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND id = auth.org_id()
  );

CREATE POLICY "orgs_delete" ON orgs
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND id = auth.org_id()
  );

CREATE TRIGGER orgs_updated_at
  BEFORE UPDATE ON orgs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2. ORG_MEMBERS
-- =============================================================================

CREATE TABLE org_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member'
                           CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select" ON org_members
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "org_members_insert" ON org_members
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "org_members_update" ON org_members
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "org_members_delete" ON org_members
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );


-- =============================================================================
-- 3. INGREDIENTS
-- =============================================================================

CREATE TABLE ingredients (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID           NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name                TEXT           NOT NULL,
  sku                 TEXT,
  unit                TEXT           NOT NULL,          -- recipe unit (oz, g, ml, lb, etc.)
  bulk_unit           TEXT,                             -- purchase unit (gallon, case, lb)
  bulk_to_unit_factor NUMERIC(12, 4),                  -- e.g. 1 gallon = 128 oz
  cost_per_unit       NUMERIC(12, 6),                  -- cost in recipe unit
  cost_per_bulk_unit  NUMERIC(12, 4),                  -- cost at purchase
  category            TEXT,
  allergens           TEXT[],
  low_stock_threshold NUMERIC(12, 4),
  default_supplier    TEXT,
  storage_notes       TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredients_select" ON ingredients
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "ingredients_insert" ON ingredients
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "ingredients_update" ON ingredients
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "ingredients_delete" ON ingredients
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE TRIGGER ingredients_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 4. RECIPES
-- =============================================================================

CREATE TABLE recipes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  target_yield      NUMERIC(12, 4) NOT NULL,
  target_yield_unit TEXT        NOT NULL,              -- bottles, jars, lbs, etc.
  version           INTEGER     NOT NULL DEFAULT 1,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_select" ON recipes
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "recipes_insert" ON recipes
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "recipes_update" ON recipes
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "recipes_delete" ON recipes
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 5. RECIPE_LINES
-- =============================================================================

CREATE TABLE recipe_lines (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID           NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  recipe_id     UUID           NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID           NOT NULL REFERENCES ingredients(id),
  quantity      NUMERIC(12, 4) NOT NULL,
  unit          TEXT           NOT NULL,
  sort_order    INTEGER        NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE recipe_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_lines_select" ON recipe_lines
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "recipe_lines_insert" ON recipe_lines
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "recipe_lines_update" ON recipe_lines
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "recipe_lines_delete" ON recipe_lines
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );


-- =============================================================================
-- 6. PURCHASE_ORDERS
-- =============================================================================

CREATE TABLE purchase_orders (
  id                     UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID           NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  po_number              TEXT           NOT NULL,
  supplier               TEXT           NOT NULL,
  status                 TEXT           NOT NULL DEFAULT 'draft'
                                          CHECK (status IN (
                                            'draft', 'sent', 'partially_received',
                                            'received', 'closed', 'cancelled'
                                          )),
  expected_delivery_date DATE,
  total_amount           NUMERIC(12, 2),
  notes                  TEXT,
  created_at             TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (org_id, po_number)
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_select" ON purchase_orders
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "purchase_orders_insert" ON purchase_orders
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "purchase_orders_update" ON purchase_orders
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "purchase_orders_delete" ON purchase_orders
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );


-- =============================================================================
-- 7. PURCHASE_ORDER_LINES
-- =============================================================================

CREATE TABLE purchase_order_lines (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID           NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  po_id         UUID           NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id UUID           NOT NULL REFERENCES ingredients(id),
  qty_ordered   NUMERIC(12, 4) NOT NULL,
  qty_received  NUMERIC(12, 4) NOT NULL DEFAULT 0,
  unit          TEXT           NOT NULL,
  unit_cost     NUMERIC(12, 6) NOT NULL,
  landed_cost   NUMERIC(12, 6),                        -- unit_cost + allocated freight
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_order_lines_select" ON purchase_order_lines
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "purchase_order_lines_insert" ON purchase_order_lines
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "purchase_order_lines_update" ON purchase_order_lines
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "purchase_order_lines_delete" ON purchase_order_lines
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );


-- =============================================================================
-- 8. LOTS
-- =============================================================================

CREATE TABLE lots (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID           NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  ingredient_id       UUID           NOT NULL REFERENCES ingredients(id),
  po_id               UUID           REFERENCES purchase_orders(id),  -- optional link
  lot_number          TEXT           NOT NULL,
  supplier_lot_number TEXT,
  quantity_received   NUMERIC(12, 4) NOT NULL,
  quantity_remaining  NUMERIC(12, 4) NOT NULL,
  unit                TEXT           NOT NULL,
  unit_cost           NUMERIC(12, 6) NOT NULL,          -- landed cost per unit
  expiry_date         DATE,
  received_date       DATE           NOT NULL DEFAULT CURRENT_DATE,
  status              TEXT           NOT NULL DEFAULT 'available'
                                       CHECK (status IN (
                                         'available', 'depleted', 'expired', 'quarantined'
                                       )),
  notes               TEXT,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (org_id, lot_number)
);

ALTER TABLE lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lots_select" ON lots
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "lots_insert" ON lots
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "lots_update" ON lots
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "lots_delete" ON lots
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

-- Index for FEFO queries: expiry_date ASC, status = 'available'
CREATE INDEX lots_fefo_idx
  ON lots (org_id, ingredient_id, expiry_date ASC NULLS LAST)
  WHERE status = 'available';


-- =============================================================================
-- 9. PRODUCTION_RUNS
-- =============================================================================

CREATE TABLE production_runs (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID           NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  recipe_id        UUID           NOT NULL REFERENCES recipes(id),
  recipe_version   INTEGER        NOT NULL,
  run_number       TEXT           NOT NULL,
  status           TEXT           NOT NULL DEFAULT 'planned'
                                    CHECK (status IN (
                                      'planned', 'in_progress', 'completed', 'cancelled'
                                    )),
  batch_multiplier NUMERIC(8, 2)  NOT NULL DEFAULT 1.0,
  expected_yield   NUMERIC(12, 4),
  actual_yield     NUMERIC(12, 4),
  yield_unit       TEXT,
  total_cogs       NUMERIC(12, 4),                    -- sum of all ingredient costs consumed
  cost_per_unit    NUMERIC(12, 6),                    -- total_cogs / actual_yield
  waste_pct        NUMERIC(5, 2),                     -- (expected - actual) / expected * 100
  notes            TEXT,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (org_id, run_number)
);

ALTER TABLE production_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_runs_select" ON production_runs
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "production_runs_insert" ON production_runs
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "production_runs_update" ON production_runs
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "production_runs_delete" ON production_runs
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );


-- =============================================================================
-- 10. PRODUCTION_RUN_LOTS
-- Links ingredient lots consumed to a production run (lot genealogy — backward trace).
-- =============================================================================

CREATE TABLE production_run_lots (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID           NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  production_run_id UUID           NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE,
  lot_id            UUID           NOT NULL REFERENCES lots(id),
  ingredient_id     UUID           NOT NULL REFERENCES ingredients(id),
  quantity_used     NUMERIC(12, 4) NOT NULL,
  unit              TEXT           NOT NULL,
  unit_cost_at_use  NUMERIC(12, 6) NOT NULL,           -- snapshot of lot unit_cost at time of use
  line_cost         NUMERIC(12, 4) NOT NULL,            -- quantity_used * unit_cost_at_use
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE production_run_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_run_lots_select" ON production_run_lots
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "production_run_lots_insert" ON production_run_lots
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "production_run_lots_update" ON production_run_lots
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "production_run_lots_delete" ON production_run_lots
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );


-- =============================================================================
-- 11. SALES_ORDERS
-- =============================================================================

CREATE TABLE sales_orders (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  order_number       TEXT        NOT NULL,
  customer_name      TEXT        NOT NULL,
  customer_email     TEXT,
  status             TEXT        NOT NULL DEFAULT 'draft'
                                   CHECK (status IN (
                                     'draft', 'confirmed', 'allocated',
                                     'shipped', 'invoiced', 'closed', 'cancelled'
                                   )),
  expected_ship_date DATE,
  shipped_at         TIMESTAMPTZ,
  qbo_invoice_id     TEXT,                             -- QBO document ID once synced
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, order_number)
);

ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_orders_select" ON sales_orders
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "sales_orders_insert" ON sales_orders
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "sales_orders_update" ON sales_orders
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "sales_orders_delete" ON sales_orders
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );


-- =============================================================================
-- 12. SALES_ORDER_LINES
-- =============================================================================

CREATE TABLE sales_order_lines (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID           NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  sales_order_id       UUID           NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  recipe_id            UUID           NOT NULL REFERENCES recipes(id),  -- finished good (SKU)
  quantity             NUMERIC(12, 4) NOT NULL,
  unit                 TEXT           NOT NULL DEFAULT 'unit',
  unit_price           NUMERIC(12, 4),
  lot_numbers_allocated TEXT[],                        -- array of finished goods lot numbers shipped
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_order_lines_select" ON sales_order_lines
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "sales_order_lines_insert" ON sales_order_lines
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "sales_order_lines_update" ON sales_order_lines
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "sales_order_lines_delete" ON sales_order_lines
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );


-- =============================================================================
-- 13. QBO_SYNC_LOG
-- =============================================================================

CREATE TABLE qbo_sync_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity_type   TEXT        NOT NULL
                              CHECK (entity_type IN (
                                'bill', 'invoice', 'journal_entry',
                                'vendor', 'customer', 'item'
                              )),
  entity_id     UUID        NOT NULL,                  -- local record UUID (PO, SO, production run)
  qbo_doc_id    TEXT,                                  -- QBO document ID after successful sync
  status        TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending', 'success', 'failed', 'retrying'
                              )),
  error_message TEXT,
  retry_count   INTEGER     NOT NULL DEFAULT 0,
  synced_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE qbo_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qbo_sync_log_select" ON qbo_sync_log
  FOR SELECT
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "qbo_sync_log_insert" ON qbo_sync_log
  FOR INSERT
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "qbo_sync_log_update" ON qbo_sync_log
  FOR UPDATE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  )
  WITH CHECK (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

CREATE POLICY "qbo_sync_log_delete" ON qbo_sync_log
  FOR DELETE
  USING (
    auth.org_id() IS NOT NULL
    AND org_id = auth.org_id()
  );

-- Index for polling failed syncs in the retry cron job
CREATE INDEX qbo_sync_log_retry_idx
  ON qbo_sync_log (org_id, status, retry_count)
  WHERE status IN ('failed', 'retrying');


-- =============================================================================
-- ADDITIONAL INDEXES (performance)
-- =============================================================================

-- Ingredient lookup by org + name
CREATE INDEX ingredients_org_name_idx ON ingredients (org_id, name);

-- Lot lookup by ingredient (for stock queries)
CREATE INDEX lots_ingredient_idx ON lots (org_id, ingredient_id);

-- Lot lookup by expiry (for expiry dashboard)
CREATE INDEX lots_expiry_idx ON lots (org_id, expiry_date)
  WHERE status = 'available';

-- Production runs by recipe
CREATE INDEX production_runs_recipe_idx ON production_runs (org_id, recipe_id);

-- Production run lots — forward trace: find all runs that used a specific lot
CREATE INDEX production_run_lots_lot_idx ON production_run_lots (lot_id);

-- Sales order lines — forward trace: find all SOs that allocated a lot
CREATE INDEX sales_order_lines_order_idx ON sales_order_lines (org_id, sales_order_id);

-- QBO sync log — lookup by entity
CREATE INDEX qbo_sync_log_entity_idx ON qbo_sync_log (org_id, entity_type, entity_id);
