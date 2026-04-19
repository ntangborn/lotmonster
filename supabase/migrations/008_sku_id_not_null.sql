-- =============================================================================
-- 008_sku_id_not_null.sql
--
-- Phase-1 cutover after the SKU-picker + SKU-based shipSalesOrder app code
-- has been deployed and at least one SO shipped successfully. Tightens
-- sales_order_lines.sku_id to NOT NULL and relaxes recipe_id so future
-- resale/merch SKUs (recipe_id IS NULL) can go on sales orders.
--
-- Safety: an inline backfill DO block (same rule as 007's backfill) fills
-- sku_id on any orphan row whose recipe_id still points at a recipe with
-- at least one active unit SKU. Then a second DO block ASSERTs zero
-- NULL sku_ids remain before the constraint flips happen. If any orphan
-- can't be repaired (its recipe was deleted, or the SKU linkage is
-- gone), the whole transaction aborts with a clear error.
--
-- Pattern mirrored from 007_skus_and_finished_goods.sql.
-- =============================================================================


-- ── Backfill any orphan rows ────────────────────────────────────────────────
DO $$
DECLARE
  v_backfilled bigint;
BEGIN
  UPDATE public.sales_order_lines sol
  SET sku_id = (
    SELECT s.id FROM public.skus s
    WHERE s.recipe_id = sol.recipe_id
      AND s.kind = 'unit'
      AND s.active = true
    ORDER BY s.created_at ASC
    LIMIT 1
  )
  WHERE sol.sku_id IS NULL
    AND sol.recipe_id IS NOT NULL;
  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  IF v_backfilled > 0 THEN
    RAISE NOTICE 'migration 008: backfilled sku_id on % sales_order_lines row(s)', v_backfilled;
  END IF;
END $$;


-- ── Precondition check ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_null_sku_ids bigint;
BEGIN
  SELECT count(*) INTO v_null_sku_ids
  FROM public.sales_order_lines
  WHERE sku_id IS NULL;

  ASSERT v_null_sku_ids = 0,
    format(
      'migration 008: cannot tighten sku_id to NOT NULL — %s sales_order_lines rows still have NULL sku_id after backfill attempt. Inspect those rows and either delete them or link their recipe to an active unit SKU, then re-run.',
      v_null_sku_ids
    );
END $$;


-- ── Constraint flips ────────────────────────────────────────────────────────
ALTER TABLE public.sales_order_lines
  ALTER COLUMN sku_id SET NOT NULL;

-- recipe_id was NOT NULL in migration 001 so that sales_order_lines could
-- reference a recipe directly. With sku_id now carrying that responsibility,
-- recipe_id becomes optional: SKUs tied to a recipe (made goods) still have
-- their line's recipe_id populated server-side, but resale / merch SKUs
-- with recipe_id = NULL can now appear on SO lines too.
ALTER TABLE public.sales_order_lines
  ALTER COLUMN recipe_id DROP NOT NULL;
