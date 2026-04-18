-- =============================================================================
-- 007_skus_and_finished_goods.sql
--
-- Phase 1 of the SKU + finished-goods plan.
--   See docs/plans/2026-04-16-skus-and-finished-goods.md for the full spec.
--
-- Creates:
--   - skus                     (unit / case / pallet), + RLS
--   - production_run_outputs   (per-run per-SKU output with split COGS), + RLS
--   - sku_packaging            (BOM: which packaging ingredients feed a SKU), + RLS
--
-- Extends:
--   - ingredients.kind         ('raw' | 'packaging'), default 'raw'
--   - lots.sku_id, lots.production_run_id, XOR CHECK, new partial FEFO indexes
--   - sales_order_lines.sku_id (NULL-able for now; 008 cuts to NOT NULL)
--
-- Backfill (same transaction, row-count ASSERTs):
--   - one kind='unit' SKU per existing recipe
--   - sales_order_lines.sku_id populated from recipe_id
--
-- Pattern mirrored from 006_auto_create_org_on_signup.sql — DO blocks with
-- GET DIAGNOSTICS + ASSERT so a failed check aborts the whole txn.
-- =============================================================================


-- =============================================================================
-- A. SKUS
-- =============================================================================

CREATE TABLE public.skus (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID           NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  recipe_id        UUID           REFERENCES public.recipes(id) ON DELETE SET NULL,
  parent_sku_id    UUID           REFERENCES public.skus(id),
  units_per_parent INTEGER        CHECK (units_per_parent IS NULL OR units_per_parent > 0),
  kind             TEXT           NOT NULL CHECK (kind IN ('unit','case','pallet')),
  name             TEXT           NOT NULL,
  upc              TEXT,
  fill_quantity    NUMERIC(12, 4),
  fill_unit        TEXT,
  shelf_life_days  INTEGER,
  retail_price     NUMERIC(12, 4),
  qbo_item_id      TEXT,
  lot_prefix       TEXT,
  active           BOOLEAN        NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),

  -- Only unit SKUs may stand alone; case/pallet SKUs must name a parent.
  CONSTRAINT skus_parent_required_for_non_unit
    CHECK (kind = 'unit' OR parent_sku_id IS NOT NULL),

  -- parent_sku_id and units_per_parent travel together.
  CONSTRAINT skus_parent_units_paired
    CHECK ((parent_sku_id IS NULL) = (units_per_parent IS NULL))
);

-- Partial unique index for UPC — NULLs allowed, per-org scope.
CREATE UNIQUE INDEX skus_org_upc_uq
  ON public.skus (org_id, upc)
  WHERE upc IS NOT NULL;

CREATE INDEX skus_org_name_idx
  ON public.skus (org_id, name);

CREATE INDEX skus_org_recipe_idx
  ON public.skus (org_id, recipe_id)
  WHERE recipe_id IS NOT NULL;

ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skus_select" ON public.skus
  FOR SELECT
  USING (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE POLICY "skus_insert" ON public.skus
  FOR INSERT
  WITH CHECK (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE POLICY "skus_update" ON public.skus
  FOR UPDATE
  USING (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  )
  WITH CHECK (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE POLICY "skus_delete" ON public.skus
  FOR DELETE
  USING (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE TRIGGER skus_updated_at
  BEFORE UPDATE ON public.skus
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- B. PRODUCTION_RUN_OUTPUTS
-- =============================================================================

CREATE TABLE public.production_run_outputs (
  id                       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID           NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  production_run_id        UUID           NOT NULL REFERENCES public.production_runs(id) ON DELETE CASCADE,
  sku_id                   UUID           NOT NULL REFERENCES public.skus(id),
  lot_id                   UUID           NOT NULL REFERENCES public.lots(id),
  quantity                 NUMERIC(12, 4) NOT NULL,
  cost_allocation_pct      NUMERIC(6, 4)  NOT NULL,
  allocated_cogs_liquid    NUMERIC(12, 4) NOT NULL,
  allocated_cogs_packaging NUMERIC(12, 4) NOT NULL,
  allocated_cogs_total     NUMERIC(12, 4) NOT NULL,
  unit_cogs                NUMERIC(12, 6) NOT NULL,
  override_note            TEXT,
  created_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),

  -- Idempotency guard: one output row per (run, sku).
  UNIQUE (production_run_id, sku_id)
);

CREATE INDEX production_run_outputs_run_idx
  ON public.production_run_outputs (org_id, production_run_id);

CREATE INDEX production_run_outputs_sku_idx
  ON public.production_run_outputs (org_id, sku_id);

CREATE INDEX production_run_outputs_lot_idx
  ON public.production_run_outputs (lot_id);

ALTER TABLE public.production_run_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_run_outputs_select" ON public.production_run_outputs
  FOR SELECT
  USING (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE POLICY "production_run_outputs_insert" ON public.production_run_outputs
  FOR INSERT
  WITH CHECK (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE POLICY "production_run_outputs_update" ON public.production_run_outputs
  FOR UPDATE
  USING (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  )
  WITH CHECK (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE POLICY "production_run_outputs_delete" ON public.production_run_outputs
  FOR DELETE
  USING (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );


-- =============================================================================
-- C. SKU_PACKAGING
-- =============================================================================

CREATE TABLE public.sku_packaging (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID           NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  sku_id        UUID           NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  ingredient_id UUID           NOT NULL REFERENCES public.ingredients(id),
  quantity      NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
  unit          TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),

  UNIQUE (sku_id, ingredient_id)
);

CREATE INDEX sku_packaging_sku_idx
  ON public.sku_packaging (org_id, sku_id);

CREATE INDEX sku_packaging_ingredient_idx
  ON public.sku_packaging (org_id, ingredient_id);

ALTER TABLE public.sku_packaging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sku_packaging_select" ON public.sku_packaging
  FOR SELECT
  USING (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE POLICY "sku_packaging_insert" ON public.sku_packaging
  FOR INSERT
  WITH CHECK (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE POLICY "sku_packaging_update" ON public.sku_packaging
  FOR UPDATE
  USING (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  )
  WITH CHECK (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE POLICY "sku_packaging_delete" ON public.sku_packaging
  FOR DELETE
  USING (
    public.current_org_id() IS NOT NULL
    AND org_id = public.current_org_id()
  );

CREATE TRIGGER sku_packaging_updated_at
  BEFORE UPDATE ON public.sku_packaging
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- D. INGREDIENTS.KIND  ('raw' | 'packaging')
-- =============================================================================

ALTER TABLE public.ingredients
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'raw'
    CHECK (kind IN ('raw', 'packaging'));

-- Explicit backfill w/ row-count assertion (redundant against DEFAULT, but
-- verifies every row landed as 'raw' as specified).
DO $$
DECLARE
  v_total   bigint;
  v_updated bigint;
BEGIN
  SELECT count(*) INTO v_total FROM public.ingredients;

  UPDATE public.ingredients SET kind = 'raw';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  ASSERT v_updated = v_total,
    format('migration 007: expected ingredients rows updated = %s, got %s', v_total, v_updated);
END $$;


-- =============================================================================
-- E. LOTS — extend to polymorphic (ingredient XOR sku)
-- =============================================================================

ALTER TABLE public.lots
  ADD COLUMN sku_id UUID REFERENCES public.skus(id);

ALTER TABLE public.lots
  ADD COLUMN production_run_id UUID REFERENCES public.production_runs(id);

ALTER TABLE public.lots
  ALTER COLUMN ingredient_id DROP NOT NULL;

ALTER TABLE public.lots
  ADD CONSTRAINT lots_ingredient_xor_sku
    CHECK ((ingredient_id IS NOT NULL) <> (sku_id IS NOT NULL));

-- Swap the existing FEFO index for two partials — one per polymorphic branch.
DROP INDEX IF EXISTS public.lots_fefo_idx;

CREATE INDEX lots_fefo_ingredient_idx
  ON public.lots (org_id, ingredient_id, expiry_date ASC NULLS LAST)
  WHERE status = 'available' AND ingredient_id IS NOT NULL;

CREATE INDEX lots_fefo_sku_idx
  ON public.lots (org_id, sku_id, expiry_date ASC NULLS LAST)
  WHERE status = 'available' AND sku_id IS NOT NULL;


-- =============================================================================
-- F. SALES_ORDER_LINES.SKU_ID (NULL-able in 007; 008 tightens to NOT NULL)
-- =============================================================================

ALTER TABLE public.sales_order_lines
  ADD COLUMN sku_id UUID REFERENCES public.skus(id);


-- =============================================================================
-- G. BACKFILL — one SKU per recipe, populate sales_order_lines.sku_id
-- =============================================================================

DO $$
DECLARE
  v_recipes_count    bigint;
  v_inserted         bigint;
  v_backfill_missing bigint;
BEGIN
  SELECT count(*) INTO v_recipes_count FROM public.recipes;

  -- Create one kind='unit' SKU per existing recipe, inheriting org_id + name.
  -- lot_prefix = first 6 alphanumeric chars of recipe.name, uppercased;
  -- NULL if name strips to empty (e.g. all punctuation).
  INSERT INTO public.skus (org_id, recipe_id, kind, name, lot_prefix, active)
  SELECT
    r.org_id,
    r.id,
    'unit',
    r.name,
    nullif(upper(left(regexp_replace(r.name, '\W', '', 'g'), 6)), ''),
    true
  FROM public.recipes r;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ASSERT v_inserted = v_recipes_count,
    format('migration 007: expected %s SKUs inserted (one per recipe), got %s',
           v_recipes_count, v_inserted);

  -- Populate sales_order_lines.sku_id from the freshly-inserted SKUs.
  UPDATE public.sales_order_lines sol
  SET sku_id = (
    SELECT s.id FROM public.skus s
    WHERE s.recipe_id = sol.recipe_id
    LIMIT 1
  )
  WHERE sol.sku_id IS NULL
    AND sol.recipe_id IS NOT NULL;

  -- Every SO line with a recipe_id must now carry a sku_id.
  SELECT count(*) INTO v_backfill_missing
  FROM public.sales_order_lines
  WHERE sku_id IS NULL AND recipe_id IS NOT NULL;

  ASSERT v_backfill_missing = 0,
    format('migration 007: %s sales_order_lines rows still have NULL sku_id after backfill',
           v_backfill_missing);
END $$;
