-- =============================================================================
-- 009_ai_functions.sql
--
-- 11 SECURITY DEFINER functions that back the Anthropic tool_use schemas in
-- src/lib/ai/tools.ts. Each function:
--   - takes p_org_id uuid as its first parameter (the server ALWAYS passes
--     the authenticated caller's orgId; the model never supplies org_id)
--   - is scoped by that p_org_id at every query — no `public.current_org_id()`
--     / JWT reads inside the function, so the caller must pass it explicitly
--   - is SECURITY DEFINER with `SET search_path = public, pg_temp` so it
--     bypasses RLS in a controlled way (schema-hijack protected)
--   - is STABLE (reads only, no side effects)
--
-- EXECUTE is revoked from PUBLIC at the bottom. Migration 010 grants it to
-- the ai_readonly role the tool dispatcher will use.
--
-- Function names match the tool names in tools.ts 1:1:
--   get_cogs_summary / get_expiring_lots / get_low_stock_ingredients /
--   get_ingredient_cost_history / get_production_run_detail /
--   get_recipe_cost_estimate / get_sales_summary / get_lot_traceability /
--   get_inventory_valuation / get_supplier_spend / get_finished_goods_status
-- =============================================================================


-- ============================================================================
-- 1. get_cogs_summary
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_cogs_summary(
  p_org_id       uuid,
  p_start_date   date,
  p_end_date     date,
  p_granularity  text DEFAULT 'range'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start     date   := p_start_date;
  v_end       date   := p_end_date;
  v_total     numeric := 0;
  v_liquid    numeric := 0;
  v_packaging numeric := 0;
  v_runs      jsonb  := '[]'::jsonb;
  v_buckets   jsonb  := '[]'::jsonb;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF p_granularity = 'ytd' THEN
    v_start := date_trunc('year', current_date)::date;
    v_end   := current_date;
  END IF;

  IF v_start IS NULL OR v_end IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date are required';
  END IF;

  -- Totals + liquid/packaging split
  SELECT
    COALESCE(SUM(prl.line_cost), 0),
    COALESCE(SUM(prl.line_cost) FILTER (WHERE i.kind = 'raw'), 0),
    COALESCE(SUM(prl.line_cost) FILTER (WHERE i.kind = 'packaging'), 0)
  INTO v_total, v_liquid, v_packaging
  FROM public.production_runs pr
  JOIN public.production_run_lots prl ON prl.production_run_id = pr.id
  LEFT JOIN public.ingredients i ON i.id = prl.ingredient_id
  WHERE pr.org_id = p_org_id
    AND pr.status = 'completed'
    AND pr.completed_at IS NOT NULL
    AND pr.completed_at >= v_start
    AND pr.completed_at < (v_end + interval '1 day');

  -- Per-run breakdown
  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'completed_at' DESC), '[]'::jsonb)
  INTO v_runs
  FROM (
    SELECT jsonb_build_object(
      'run_id',       pr.id,
      'run_number',   pr.run_number,
      'recipe_name',  rc.name,
      'status',       pr.status,
      'completed_at', pr.completed_at,
      'total_cogs',   pr.total_cogs
    ) AS r
    FROM public.production_runs pr
    LEFT JOIN public.recipes rc ON rc.id = pr.recipe_id
    WHERE pr.org_id = p_org_id
      AND pr.status = 'completed'
      AND pr.completed_at IS NOT NULL
      AND pr.completed_at >= v_start
      AND pr.completed_at < (v_end + interval '1 day')
  ) sub;

  -- Bucketing
  IF p_granularity IN ('daily', 'weekly', 'monthly') THEN
    SELECT COALESCE(jsonb_agg(b ORDER BY b->>'bucket_start'), '[]'::jsonb)
    INTO v_buckets
    FROM (
      SELECT jsonb_build_object(
        'bucket_start', to_char(bucket, 'YYYY-MM-DD'),
        'total_cogs',   SUM(tc),
        'run_count',    COUNT(*)
      ) AS b
      FROM (
        SELECT
          date_trunc(
            CASE p_granularity
              WHEN 'daily'   THEN 'day'
              WHEN 'weekly'  THEN 'week'
              WHEN 'monthly' THEN 'month'
            END,
            pr.completed_at
          )::date AS bucket,
          pr.total_cogs AS tc
        FROM public.production_runs pr
        WHERE pr.org_id = p_org_id
          AND pr.status = 'completed'
          AND pr.completed_at IS NOT NULL
          AND pr.completed_at >= v_start
          AND pr.completed_at < (v_end + interval '1 day')
      ) x
      GROUP BY bucket
    ) agg;
  END IF;

  RETURN jsonb_build_object(
    'start_date',     to_char(v_start, 'YYYY-MM-DD'),
    'end_date',       to_char(v_end,   'YYYY-MM-DD'),
    'granularity',    p_granularity,
    'total_cogs',     v_total,
    'liquid_cogs',    v_liquid,
    'packaging_cogs', v_packaging,
    'buckets',        v_buckets,
    'runs',           v_runs
  );
END;
$$;


-- ============================================================================
-- 2. get_expiring_lots
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_expiring_lots(
  p_org_id          uuid,
  p_days_ahead      integer DEFAULT 30,
  p_kind            text    DEFAULT 'all',
  p_include_expired boolean DEFAULT false
) RETURNS TABLE (
  lot_id              uuid,
  lot_number          text,
  kind                text,
  item_name           text,
  ingredient_id       uuid,
  sku_id              uuid,
  quantity_remaining  numeric,
  unit                text,
  expiry_date         date,
  days_until_expiry   integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.lot_number,
    (CASE WHEN l.sku_id IS NOT NULL THEN 'finished' ELSE 'raw' END)::text,
    COALESCE(s.name, i.name, 'Unknown')::text,
    l.ingredient_id,
    l.sku_id,
    l.quantity_remaining,
    l.unit,
    l.expiry_date,
    (l.expiry_date - current_date)::integer
  FROM public.lots l
  LEFT JOIN public.ingredients i ON i.id = l.ingredient_id
  LEFT JOIN public.skus s ON s.id = l.sku_id
  WHERE l.org_id = p_org_id
    AND l.status = 'available'
    AND l.expiry_date IS NOT NULL
    AND l.expiry_date <= (current_date + make_interval(days => p_days_ahead))
    AND (p_include_expired OR l.expiry_date >= current_date)
    AND (
      p_kind = 'all'
      OR (p_kind = 'raw'      AND l.ingredient_id IS NOT NULL)
      OR (p_kind = 'finished' AND l.sku_id        IS NOT NULL)
    )
  ORDER BY l.expiry_date ASC NULLS LAST;
END;
$$;


-- ============================================================================
-- 3. get_low_stock_ingredients
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_low_stock_ingredients(
  p_org_id               uuid,
  p_kind                 text    DEFAULT 'all',
  p_include_no_threshold boolean DEFAULT false
) RETURNS TABLE (
  ingredient_id        uuid,
  ingredient_name      text,
  kind                 text,
  current_stock        numeric,
  low_stock_threshold  numeric,
  unit                 text,
  out_of_stock         boolean,
  default_supplier     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  RETURN QUERY
  WITH stock AS (
    SELECT
      i.id,
      i.name,
      i.kind,
      i.unit,
      i.low_stock_threshold,
      i.default_supplier,
      COALESCE(
        SUM(l.quantity_remaining) FILTER (WHERE l.status = 'available'),
        0
      ) AS on_hand
    FROM public.ingredients i
    LEFT JOIN public.lots l
      ON l.ingredient_id = i.id
     AND l.org_id = p_org_id
    WHERE i.org_id = p_org_id
      AND (p_kind = 'all' OR i.kind = p_kind)
    GROUP BY i.id, i.name, i.kind, i.unit, i.low_stock_threshold, i.default_supplier
  )
  SELECT
    s.id,
    s.name,
    s.kind,
    s.on_hand,
    s.low_stock_threshold,
    s.unit,
    (s.on_hand <= 0)::boolean,
    s.default_supplier
  FROM stock s
  WHERE
    (s.low_stock_threshold IS NOT NULL AND s.on_hand < s.low_stock_threshold)
    OR (p_include_no_threshold AND s.on_hand <= 0)
  ORDER BY (s.on_hand <= 0) DESC, s.name ASC;
END;
$$;


-- ============================================================================
-- 4. get_ingredient_cost_history
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_ingredient_cost_history(
  p_org_id          uuid,
  p_ingredient_name text,
  p_months_back     integer DEFAULT 12
) RETURNS TABLE (
  received_date      date,
  po_number          text,
  supplier           text,
  unit_cost          numeric,
  quantity_received  numeric,
  unit               text,
  landed_cost        numeric,
  ingredient_name    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ingredient_id uuid;
BEGIN
  IF p_org_id IS NULL OR p_ingredient_name IS NULL THEN
    RAISE EXCEPTION 'p_org_id and p_ingredient_name are required';
  END IF;

  -- Exact match first, then prefix.
  SELECT id INTO v_ingredient_id
  FROM public.ingredients
  WHERE org_id = p_org_id AND lower(name) = lower(p_ingredient_name)
  LIMIT 1;

  IF v_ingredient_id IS NULL THEN
    SELECT id INTO v_ingredient_id
    FROM public.ingredients
    WHERE org_id = p_org_id AND lower(name) LIKE lower(p_ingredient_name) || '%'
    ORDER BY name
    LIMIT 1;
  END IF;

  IF v_ingredient_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.received_date,
    po.po_number,
    po.supplier,
    l.unit_cost,
    l.quantity_received,
    l.unit,
    COALESCE(pol.landed_cost, l.unit_cost)::numeric,
    i.name
  FROM public.lots l
  LEFT JOIN public.purchase_orders po ON po.id = l.po_id
  LEFT JOIN public.purchase_order_lines pol
    ON pol.po_id = l.po_id
   AND pol.ingredient_id = l.ingredient_id
  LEFT JOIN public.ingredients i ON i.id = l.ingredient_id
  WHERE l.org_id = p_org_id
    AND l.ingredient_id = v_ingredient_id
    AND l.received_date >= (current_date - make_interval(months => p_months_back))
  ORDER BY l.received_date ASC;
END;
$$;


-- ============================================================================
-- 5. get_production_run_detail
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_production_run_detail(
  p_org_id    uuid,
  p_run_number text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run         public.production_runs;
  v_recipe_name text;
  v_outputs     jsonb;
  v_consumed    jsonb;
BEGIN
  IF p_org_id IS NULL OR p_run_number IS NULL THEN
    RAISE EXCEPTION 'p_org_id and p_run_number are required';
  END IF;

  SELECT * INTO v_run
  FROM public.production_runs
  WHERE org_id = p_org_id AND run_number = p_run_number
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'run_number', p_run_number);
  END IF;

  SELECT name INTO v_recipe_name
  FROM public.recipes
  WHERE id = v_run.recipe_id;

  -- Per-SKU outputs
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'sku_name'), '[]'::jsonb)
  INTO v_outputs
  FROM (
    SELECT jsonb_build_object(
      'sku_id',                   pro.sku_id,
      'sku_name',                 s.name,
      'lot_id',                   pro.lot_id,
      'lot_number',               fl.lot_number,
      'quantity',                 pro.quantity,
      'cost_allocation_pct',      pro.cost_allocation_pct,
      'allocated_cogs_liquid',    pro.allocated_cogs_liquid,
      'allocated_cogs_packaging', pro.allocated_cogs_packaging,
      'allocated_cogs_total',     pro.allocated_cogs_total,
      'unit_cogs',                pro.unit_cogs,
      'override_note',            pro.override_note
    ) AS row
    FROM public.production_run_outputs pro
    LEFT JOIN public.skus s ON s.id = pro.sku_id
    LEFT JOIN public.lots fl ON fl.id = pro.lot_id
    WHERE pro.org_id = p_org_id
      AND pro.production_run_id = v_run.id
  ) sub;

  -- Consumed lots (raw + packaging)
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'ingredient_name'), '[]'::jsonb)
  INTO v_consumed
  FROM (
    SELECT jsonb_build_object(
      'lot_id',           prl.lot_id,
      'lot_number',       l.lot_number,
      'ingredient_id',    prl.ingredient_id,
      'ingredient_name',  i.name,
      'ingredient_kind',  i.kind,
      'quantity_used',    prl.quantity_used,
      'unit',             prl.unit,
      'unit_cost_at_use', prl.unit_cost_at_use,
      'line_cost',        prl.line_cost
    ) AS row
    FROM public.production_run_lots prl
    LEFT JOIN public.lots l ON l.id = prl.lot_id
    LEFT JOIN public.ingredients i ON i.id = prl.ingredient_id
    WHERE prl.org_id = p_org_id
      AND prl.production_run_id = v_run.id
  ) sub;

  RETURN jsonb_build_object(
    'found',             true,
    'run_id',            v_run.id,
    'run_number',        v_run.run_number,
    'recipe_id',         v_run.recipe_id,
    'recipe_name',       v_recipe_name,
    'recipe_version',    v_run.recipe_version,
    'status',            v_run.status,
    'batch_multiplier',  v_run.batch_multiplier,
    'expected_yield',    v_run.expected_yield,
    'actual_yield',      v_run.actual_yield,
    'yield_unit',        v_run.yield_unit,
    'total_cogs',        v_run.total_cogs,
    'cost_per_unit',     v_run.cost_per_unit,
    'waste_pct',         v_run.waste_pct,
    'notes',             v_run.notes,
    'started_at',        v_run.started_at,
    'completed_at',      v_run.completed_at,
    'created_at',        v_run.created_at,
    'outputs',           v_outputs,
    'consumed_lots',     v_consumed
  );
END;
$$;


-- ============================================================================
-- 6. get_recipe_cost_estimate
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_recipe_cost_estimate(
  p_org_id           uuid,
  p_recipe_name      text,
  p_batch_multiplier numeric DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipe_id   uuid;
  v_recipe_name text;
  v_target_yield      numeric;
  v_target_yield_unit text;
  v_multiplier  numeric := COALESCE(p_batch_multiplier, 1);
  v_liquid      numeric := 0;
  v_lines       jsonb   := '[]'::jsonb;
  v_skus        jsonb   := '[]'::jsonb;
BEGIN
  IF p_org_id IS NULL OR p_recipe_name IS NULL THEN
    RAISE EXCEPTION 'p_org_id and p_recipe_name are required';
  END IF;
  IF v_multiplier <= 0 THEN v_multiplier := 1; END IF;

  -- Exact match first, then prefix.
  SELECT id, name, target_yield, target_yield_unit
  INTO v_recipe_id, v_recipe_name, v_target_yield, v_target_yield_unit
  FROM public.recipes
  WHERE org_id = p_org_id AND lower(name) = lower(p_recipe_name)
  LIMIT 1;

  IF v_recipe_id IS NULL THEN
    SELECT id, name, target_yield, target_yield_unit
    INTO v_recipe_id, v_recipe_name, v_target_yield, v_target_yield_unit
    FROM public.recipes
    WHERE org_id = p_org_id AND lower(name) LIKE lower(p_recipe_name) || '%'
    ORDER BY name
    LIMIT 1;
  END IF;

  IF v_recipe_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'recipe_name', p_recipe_name);
  END IF;

  -- Recipe lines + estimated liquid COGS (weighted avg of available raw-lot costs)
  WITH avg_costs AS (
    SELECT
      l.ingredient_id,
      SUM(l.quantity_remaining * l.unit_cost) / NULLIF(SUM(l.quantity_remaining), 0) AS avg_cost
    FROM public.lots l
    WHERE l.org_id = p_org_id
      AND l.status = 'available'
      AND l.ingredient_id IS NOT NULL
    GROUP BY l.ingredient_id
  ),
  line_rows AS (
    SELECT
      rl.ingredient_id,
      i.name AS ingredient_name,
      rl.quantity * v_multiplier AS qty,
      rl.unit,
      COALESCE(ac.avg_cost, i.cost_per_unit, 0) AS unit_cost,
      rl.quantity * v_multiplier * COALESCE(ac.avg_cost, i.cost_per_unit, 0) AS line_cost,
      rl.sort_order
    FROM public.recipe_lines rl
    LEFT JOIN public.ingredients i ON i.id = rl.ingredient_id
    LEFT JOIN avg_costs ac ON ac.ingredient_id = rl.ingredient_id
    WHERE rl.org_id = p_org_id AND rl.recipe_id = v_recipe_id
  )
  SELECT
    COALESCE(SUM(line_cost), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'ingredient_id',   ingredient_id,
      'ingredient_name', ingredient_name,
      'quantity',        qty,
      'unit',            unit,
      'unit_cost',       unit_cost,
      'line_cost',       line_cost
    ) ORDER BY sort_order), '[]'::jsonb)
  INTO v_liquid, v_lines
  FROM line_rows;

  -- Per-SKU estimate. Note: liquid_cogs_per_unit assumes the whole batch
  -- goes into THIS SKU (a single-SKU run). Multi-SKU fills split liquid
  -- by volume share at actual completion; here we show the pricing-style
  -- "if I filled the whole batch into 16oz, what's the unit cost?".
  WITH pack_costs AS (
    SELECT
      l.ingredient_id,
      SUM(l.quantity_remaining * l.unit_cost) / NULLIF(SUM(l.quantity_remaining), 0) AS avg_cost
    FROM public.lots l
    JOIN public.ingredients i ON i.id = l.ingredient_id
    WHERE l.org_id = p_org_id
      AND l.status = 'available'
      AND i.kind = 'packaging'
    GROUP BY l.ingredient_id
  ),
  sku_info AS (
    SELECT
      s.id,
      s.name,
      s.fill_quantity,
      s.fill_unit,
      s.retail_price,
      CASE
        WHEN s.fill_quantity IS NOT NULL
         AND s.fill_quantity > 0
         AND s.fill_unit = v_target_yield_unit
        THEN floor((v_target_yield * v_multiplier) / s.fill_quantity)
      END::numeric AS expected_units,
      COALESCE((
        SELECT SUM(sp.quantity * COALESCE(pc.avg_cost, 0))
        FROM public.sku_packaging sp
        LEFT JOIN pack_costs pc ON pc.ingredient_id = sp.ingredient_id
        WHERE sp.org_id = p_org_id AND sp.sku_id = s.id
      ), 0)::numeric AS packaging_cogs_per_unit
    FROM public.skus s
    WHERE s.org_id = p_org_id
      AND s.recipe_id = v_recipe_id
      AND s.kind = 'unit'
      AND s.active = true
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sku_id',                 si.id,
    'sku_name',               si.name,
    'fill_quantity',          si.fill_quantity,
    'fill_unit',              si.fill_unit,
    'retail_price',           si.retail_price,
    'expected_units',         si.expected_units,
    'packaging_cogs_per_unit', si.packaging_cogs_per_unit,
    'liquid_cogs_per_unit',
      CASE WHEN si.expected_units IS NOT NULL AND si.expected_units > 0
           THEN v_liquid / si.expected_units
           ELSE NULL
      END,
    'unit_cogs',
      CASE WHEN si.expected_units IS NOT NULL AND si.expected_units > 0
           THEN (v_liquid / si.expected_units) + si.packaging_cogs_per_unit
           ELSE NULL
      END
  ) ORDER BY si.name), '[]'::jsonb)
  INTO v_skus
  FROM sku_info si;

  RETURN jsonb_build_object(
    'found',                 true,
    'recipe_id',             v_recipe_id,
    'recipe_name',           v_recipe_name,
    'target_yield',          v_target_yield,
    'target_yield_unit',     v_target_yield_unit,
    'batch_multiplier',      v_multiplier,
    'estimated_liquid_cogs', v_liquid,
    'recipe_lines',          v_lines,
    'skus',                  v_skus
  );
END;
$$;


-- ============================================================================
-- 7. get_sales_summary
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_sales_summary(
  p_org_id     uuid,
  p_start_date date,
  p_end_date   date,
  p_sku_name   text DEFAULT NULL,
  p_status     text DEFAULT 'any_post_ship'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_statuses text[];
  v_rows     jsonb;
  v_totals   jsonb;
BEGIN
  IF p_org_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_org_id, p_start_date, and p_end_date are required';
  END IF;

  v_statuses := CASE p_status
    WHEN 'shipped'  THEN ARRAY['shipped']
    WHEN 'invoiced' THEN ARRAY['invoiced']
    WHEN 'closed'   THEN ARRAY['closed']
    ELSE ARRAY['shipped','invoiced','closed']
  END;

  -- Per-SKU aggregates. COGS = units_sold × weighted-avg finished-lot unit_cost
  -- for that SKU (proxy until the line-level lot-draw junction ships in phase 2).
  WITH sku_sales AS (
    SELECT
      sol.sku_id,
      s.name AS sku_name,
      SUM(sol.quantity) AS units,
      SUM(sol.quantity * COALESCE(sol.unit_price, 0)) AS revenue
    FROM public.sales_orders so
    JOIN public.sales_order_lines sol ON sol.sales_order_id = so.id
    LEFT JOIN public.skus s ON s.id = sol.sku_id
    WHERE so.org_id = p_org_id
      AND so.status = ANY(v_statuses)
      AND so.shipped_at IS NOT NULL
      AND so.shipped_at >= p_start_date
      AND so.shipped_at < (p_end_date + interval '1 day')
      AND sol.sku_id IS NOT NULL
      AND (
        p_sku_name IS NULL
        OR lower(s.name) = lower(p_sku_name)
        OR lower(s.name) LIKE lower(p_sku_name) || '%'
      )
    GROUP BY sol.sku_id, s.name
  ),
  avg_cogs AS (
    SELECT
      l.sku_id,
      SUM(l.quantity_received * l.unit_cost) / NULLIF(SUM(l.quantity_received), 0) AS avg_unit_cost
    FROM public.lots l
    WHERE l.org_id = p_org_id
      AND l.sku_id IS NOT NULL
    GROUP BY l.sku_id
  ),
  final AS (
    SELECT
      ss.sku_id,
      ss.sku_name,
      ss.units,
      ss.revenue,
      ss.units * COALESCE(ac.avg_unit_cost, 0) AS cogs,
      ss.revenue - (ss.units * COALESCE(ac.avg_unit_cost, 0)) AS gross_profit
    FROM sku_sales ss
    LEFT JOIN avg_cogs ac ON ac.sku_id = ss.sku_id
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'sku_id',        sku_id,
      'sku_name',      sku_name,
      'units_sold',    units,
      'revenue',       revenue,
      'cogs',          cogs,
      'gross_profit',  gross_profit
    ) ORDER BY revenue DESC), '[]'::jsonb),
    jsonb_build_object(
      'total_units',        COALESCE(SUM(units), 0),
      'total_revenue',      COALESCE(SUM(revenue), 0),
      'total_cogs',         COALESCE(SUM(cogs), 0),
      'total_gross_profit', COALESCE(SUM(gross_profit), 0)
    )
  INTO v_rows, v_totals
  FROM final;

  RETURN jsonb_build_object(
    'start_date',      to_char(p_start_date, 'YYYY-MM-DD'),
    'end_date',        to_char(p_end_date,   'YYYY-MM-DD'),
    'status_filter',   p_status,
    'sku_name_filter', p_sku_name,
    'totals',          v_totals,
    'rows',            v_rows
  );
END;
$$;


-- ============================================================================
-- 8. get_lot_traceability
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_lot_traceability(
  p_org_id     uuid,
  p_lot_number text,
  p_direction  text DEFAULT 'forward'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot         public.lots;
  v_kind        text;
  v_item_name   text;
  v_shipped     jsonb;
  v_consumed_in jsonb;
  v_produced    jsonb;
  v_parent_run  jsonb;
  v_upstream    jsonb;
BEGIN
  IF p_org_id IS NULL OR p_lot_number IS NULL THEN
    RAISE EXCEPTION 'p_org_id and p_lot_number are required';
  END IF;

  SELECT * INTO v_lot
  FROM public.lots
  WHERE org_id = p_org_id AND lot_number = p_lot_number
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'lot_number', p_lot_number);
  END IF;

  v_kind := CASE WHEN v_lot.sku_id IS NOT NULL THEN 'finished' ELSE 'raw' END;

  SELECT COALESCE(i.name, s.name, 'Unknown')
  INTO v_item_name
  FROM public.lots l
  LEFT JOIN public.ingredients i ON i.id = l.ingredient_id
  LEFT JOIN public.skus s ON s.id = l.sku_id
  WHERE l.id = v_lot.id;

  -- Common: SOs whose lot_numbers_allocated contains this lot number.
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'sales_order_id', so.id,
    'order_number',   so.order_number,
    'customer_name',  so.customer_name,
    'status',         so.status,
    'shipped_at',     so.shipped_at
  )), '[]'::jsonb)
  INTO v_shipped
  FROM public.sales_order_lines sol
  JOIN public.sales_orders so ON so.id = sol.sales_order_id
  WHERE sol.org_id = p_org_id
    AND sol.lot_numbers_allocated && ARRAY[p_lot_number];

  IF v_kind = 'raw' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'run_id',         pr.id,
      'run_number',     pr.run_number,
      'status',         pr.status,
      'completed_at',   pr.completed_at,
      'quantity_used',  prl.quantity_used,
      'unit',           prl.unit
    )), '[]'::jsonb)
    INTO v_consumed_in
    FROM public.production_run_lots prl
    JOIN public.production_runs pr ON pr.id = prl.production_run_id
    WHERE prl.org_id = p_org_id AND prl.lot_id = v_lot.id;

    SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'lot_id',             fl.id,
      'lot_number',         fl.lot_number,
      'sku_id',             fl.sku_id,
      'sku_name',           s.name,
      'production_run_id',  fl.production_run_id,
      'quantity_remaining', fl.quantity_remaining,
      'expiry_date',        fl.expiry_date
    )), '[]'::jsonb)
    INTO v_produced
    FROM public.lots fl
    LEFT JOIN public.skus s ON s.id = fl.sku_id
    WHERE fl.org_id = p_org_id
      AND fl.sku_id IS NOT NULL
      AND fl.production_run_id IN (
        SELECT production_run_id
        FROM public.production_run_lots
        WHERE org_id = p_org_id AND lot_id = v_lot.id
      );

    RETURN jsonb_build_object(
      'found',                  true,
      'kind',                   'raw',
      'direction',              p_direction,
      'lot_id',                 v_lot.id,
      'lot_number',             v_lot.lot_number,
      'item_name',              v_item_name,
      'consumed_in_runs',       v_consumed_in,
      'produced_finished_lots', v_produced,
      'shipped_in',             v_shipped
    );
  END IF;

  -- Finished lot: parent run + raw lots that run consumed.
  SELECT jsonb_build_object(
    'run_id',       pr.id,
    'run_number',   pr.run_number,
    'status',       pr.status,
    'completed_at', pr.completed_at
  )
  INTO v_parent_run
  FROM public.production_runs pr
  WHERE pr.org_id = p_org_id AND pr.id = v_lot.production_run_id;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'lot_id',          rl.id,
    'lot_number',      rl.lot_number,
    'ingredient_name', i.name,
    'ingredient_kind', i.kind,
    'supplier',        po.supplier,
    'po_number',       po.po_number
  )), '[]'::jsonb)
  INTO v_upstream
  FROM public.production_run_lots prl
  LEFT JOIN public.lots rl ON rl.id = prl.lot_id
  LEFT JOIN public.ingredients i ON i.id = rl.ingredient_id
  LEFT JOIN public.purchase_orders po ON po.id = rl.po_id
  WHERE prl.org_id = p_org_id AND prl.production_run_id = v_lot.production_run_id;

  RETURN jsonb_build_object(
    'found',             true,
    'kind',              'finished',
    'direction',         p_direction,
    'lot_id',            v_lot.id,
    'lot_number',        v_lot.lot_number,
    'item_name',         v_item_name,
    'parent_run',        v_parent_run,
    'upstream_raw_lots', v_upstream,
    'shipped_in',        v_shipped
  );
END;
$$;


-- ============================================================================
-- 9. get_inventory_valuation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_inventory_valuation(
  p_org_id uuid,
  p_kind   text    DEFAULT 'all',
  p_top_n  integer DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_raw       numeric := 0;
  v_total_packaging numeric := 0;
  v_total_finished  numeric := 0;
  v_top             jsonb   := '[]'::jsonb;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF p_top_n IS NULL OR p_top_n <= 0 THEN p_top_n := 10; END IF;

  SELECT
    COALESCE(SUM(l.quantity_remaining * l.unit_cost)
             FILTER (WHERE l.ingredient_id IS NOT NULL AND i.kind = 'raw'), 0),
    COALESCE(SUM(l.quantity_remaining * l.unit_cost)
             FILTER (WHERE l.ingredient_id IS NOT NULL AND i.kind = 'packaging'), 0),
    COALESCE(SUM(l.quantity_remaining * l.unit_cost)
             FILTER (WHERE l.sku_id IS NOT NULL), 0)
  INTO v_total_raw, v_total_packaging, v_total_finished
  FROM public.lots l
  LEFT JOIN public.ingredients i ON i.id = l.ingredient_id
  WHERE l.org_id = p_org_id
    AND l.status = 'available'
    AND l.quantity_remaining > 0;

  -- Top-N by value
  WITH items AS (
    SELECT
      CASE
        WHEN l.sku_id IS NOT NULL THEN 'finished'
        ELSE COALESCE(i.kind, 'raw')
      END AS kind,
      COALESCE(i.name, s.name, 'Unknown') AS item_name,
      SUM(l.quantity_remaining * l.unit_cost) AS value,
      SUM(l.quantity_remaining) AS qty,
      MIN(l.unit) AS unit
    FROM public.lots l
    LEFT JOIN public.ingredients i ON i.id = l.ingredient_id
    LEFT JOIN public.skus s ON s.id = l.sku_id
    WHERE l.org_id = p_org_id
      AND l.status = 'available'
      AND l.quantity_remaining > 0
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'kind',      kind,
    'item_name', item_name,
    'value',     value,
    'quantity',  qty,
    'unit',      unit
  ) ORDER BY value DESC), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT * FROM items
    WHERE p_kind = 'all' OR kind = p_kind
    ORDER BY value DESC
    LIMIT p_top_n
  ) t;

  RETURN jsonb_build_object(
    'kind_filter',       p_kind,
    'top_n',             p_top_n,
    'total_raw',         v_total_raw,
    'total_packaging',   v_total_packaging,
    'total_finished',    v_total_finished,
    'total_all',         v_total_raw + v_total_packaging + v_total_finished,
    'top_items',         v_top
  );
END;
$$;


-- ============================================================================
-- 10. get_supplier_spend
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_supplier_spend(
  p_org_id     uuid,
  p_start_date date,
  p_end_date   date
) RETURNS TABLE (
  supplier              text,
  po_count              bigint,
  total_spend           numeric,
  top_ingredient        text,
  top_ingredient_spend  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_org_id, p_start_date, p_end_date are required';
  END IF;

  RETURN QUERY
  WITH po_spend AS (
    SELECT
      po.supplier,
      po.id AS po_id,
      SUM(COALESCE(pol.landed_cost, pol.unit_cost) * pol.qty_received) AS po_total
    FROM public.purchase_orders po
    JOIN public.purchase_order_lines pol ON pol.po_id = po.id
    WHERE po.org_id = p_org_id
      AND po.created_at >= p_start_date
      AND po.created_at < (p_end_date + interval '1 day')
      AND COALESCE(pol.qty_received, 0) > 0
    GROUP BY po.supplier, po.id
  ),
  supplier_totals AS (
    SELECT
      ps.supplier,
      COUNT(*)::bigint AS po_count,
      COALESCE(SUM(ps.po_total), 0) AS total
    FROM po_spend ps
    GROUP BY ps.supplier
  ),
  ingredient_spend AS (
    SELECT
      po.supplier,
      i.name AS ingredient_name,
      SUM(COALESCE(pol.landed_cost, pol.unit_cost) * pol.qty_received) AS spend,
      ROW_NUMBER() OVER (
        PARTITION BY po.supplier
        ORDER BY SUM(COALESCE(pol.landed_cost, pol.unit_cost) * pol.qty_received) DESC
      ) AS rn
    FROM public.purchase_orders po
    JOIN public.purchase_order_lines pol ON pol.po_id = po.id
    JOIN public.ingredients i ON i.id = pol.ingredient_id
    WHERE po.org_id = p_org_id
      AND po.created_at >= p_start_date
      AND po.created_at < (p_end_date + interval '1 day')
      AND COALESCE(pol.qty_received, 0) > 0
    GROUP BY po.supplier, i.name
  )
  SELECT
    st.supplier,
    st.po_count,
    st.total,
    is_top.ingredient_name,
    is_top.spend
  FROM supplier_totals st
  LEFT JOIN ingredient_spend is_top
    ON is_top.supplier = st.supplier AND is_top.rn = 1
  ORDER BY st.total DESC NULLS LAST;
END;
$$;


-- ============================================================================
-- 11. get_finished_goods_status  (NEW — "what can I sell today?")
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_finished_goods_status(
  p_org_id         uuid,
  p_sku_name       text    DEFAULT NULL,
  p_only_in_stock  boolean DEFAULT false
) RETURNS TABLE (
  sku_id                  uuid,
  sku_name                text,
  on_hand                 numeric,
  lot_count               bigint,
  earliest_expiry         date,
  weighted_avg_unit_cost  numeric,
  retail_price            numeric,
  fill_quantity           numeric,
  fill_unit               text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  RETURN QUERY
  WITH sku_lots AS (
    SELECT
      l.sku_id,
      COALESCE(SUM(l.quantity_remaining), 0) AS on_hand,
      COUNT(*)::bigint AS lot_count,
      MIN(l.expiry_date) AS earliest_expiry,
      SUM(l.quantity_remaining * l.unit_cost)
        / NULLIF(SUM(l.quantity_remaining), 0) AS avg_cost
    FROM public.lots l
    WHERE l.org_id = p_org_id
      AND l.sku_id IS NOT NULL
      AND l.status = 'available'
      AND l.quantity_remaining > 0
    GROUP BY l.sku_id
  )
  SELECT
    s.id,
    s.name,
    COALESCE(sl.on_hand, 0),
    COALESCE(sl.lot_count, 0),
    sl.earliest_expiry,
    sl.avg_cost,
    s.retail_price,
    s.fill_quantity,
    s.fill_unit
  FROM public.skus s
  LEFT JOIN sku_lots sl ON sl.sku_id = s.id
  WHERE s.org_id = p_org_id
    AND s.kind = 'unit'
    AND s.active = true
    AND (
      p_sku_name IS NULL
      OR lower(s.name) = lower(p_sku_name)
      OR lower(s.name) LIKE lower(p_sku_name) || '%'
    )
    AND (NOT p_only_in_stock OR COALESCE(sl.on_hand, 0) > 0)
  ORDER BY COALESCE(sl.on_hand, 0) DESC, s.name ASC;
END;
$$;


-- ============================================================================
-- Lockdown — migration 010 will GRANT EXECUTE to the ai_readonly role.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.get_cogs_summary(uuid, date, date, text)                            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_expiring_lots(uuid, integer, text, boolean)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_low_stock_ingredients(uuid, text, boolean)                      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ingredient_cost_history(uuid, text, integer)                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_production_run_detail(uuid, text)                               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recipe_cost_estimate(uuid, text, numeric)                       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_sales_summary(uuid, date, date, text, text)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_lot_traceability(uuid, text, text)                              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_inventory_valuation(uuid, text, integer)                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_supplier_spend(uuid, date, date)                                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_finished_goods_status(uuid, text, boolean)                      FROM PUBLIC;
