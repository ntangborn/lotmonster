-- =============================================================================
-- 011_ai_query_remove_set_role.sql
--
-- Hotfix: PostgreSQL disallows `SET ROLE` inside SECURITY DEFINER functions
-- and raises "cannot set parameter 'role' within security-definer function"
-- at call time. Migration 010's execute_ai_query used `SET LOCAL ROLE
-- ai_readonly` / `RESET ROLE` inside a SECURITY DEFINER body, so every tool
-- call from /api/ai/query was failing on prod.
--
-- This migration redefines execute_ai_query WITHOUT the role switch. The
-- security boundary is unchanged:
--
--   1. Hard-coded CASE dispatcher over 11 literal function names.
--      No EXECUTE, no format(), no dynamic SQL anywhere in the body.
--   2. Unknown function name raises `unknown_ai_function` before any
--      work happens.
--   3. Caller must supply params.org_id (server-injected from the
--      authenticated session; the model never provides it).
--   4. REVOKE EXECUTE FROM PUBLIC, GRANT TO service_role only. Not
--      exposed via PostgREST to authenticated users.
--
-- The ai_readonly role + its grants from migration 010 are RETAINED for
-- future out-of-wrapper use (e.g. a read-only analytics shell). They're
-- just not invoked inside this function any more.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.execute_ai_query(
  p_function_name text,
  p_params        jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_result jsonb;
BEGIN
  -- org_id is ALWAYS injected server-side by the Next.js dispatcher after
  -- resolving the authenticated session. The model never supplies it.
  IF p_params IS NULL OR NOT (p_params ? 'org_id') THEN
    RAISE EXCEPTION 'execute_ai_query: params.org_id is required (server-injected)';
  END IF;
  BEGIN
    v_org_id := (p_params->>'org_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'execute_ai_query: params.org_id is not a valid uuid';
  END;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'execute_ai_query: params.org_id is null';
  END IF;

  -- Whitelist dispatcher — function names are string literals in the source
  -- text. No EXECUTE, no format(), no dynamic SQL. Postgres parses and
  -- binds each call at CREATE FUNCTION time.
  IF p_function_name = 'get_cogs_summary' THEN
    v_result := public.get_cogs_summary(
      v_org_id,
      (p_params->>'start_date')::date,
      (p_params->>'end_date')::date,
      COALESCE(p_params->>'granularity', 'range')
    );

  ELSIF p_function_name = 'get_expiring_lots' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    INTO v_result
    FROM public.get_expiring_lots(
      v_org_id,
      COALESCE((p_params->>'days_ahead')::integer, 30),
      COALESCE(p_params->>'kind', 'all'),
      COALESCE((p_params->>'include_expired')::boolean, false)
    ) r;

  ELSIF p_function_name = 'get_low_stock_ingredients' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    INTO v_result
    FROM public.get_low_stock_ingredients(
      v_org_id,
      COALESCE(p_params->>'kind', 'all'),
      COALESCE((p_params->>'include_no_threshold')::boolean, false)
    ) r;

  ELSIF p_function_name = 'get_ingredient_cost_history' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    INTO v_result
    FROM public.get_ingredient_cost_history(
      v_org_id,
      p_params->>'ingredient_name',
      COALESCE((p_params->>'months_back')::integer, 12)
    ) r;

  ELSIF p_function_name = 'get_production_run_detail' THEN
    v_result := public.get_production_run_detail(
      v_org_id,
      p_params->>'run_number'
    );

  ELSIF p_function_name = 'get_recipe_cost_estimate' THEN
    v_result := public.get_recipe_cost_estimate(
      v_org_id,
      p_params->>'recipe_name',
      COALESCE((p_params->>'batch_multiplier')::numeric, 1)
    );

  ELSIF p_function_name = 'get_sales_summary' THEN
    v_result := public.get_sales_summary(
      v_org_id,
      (p_params->>'start_date')::date,
      (p_params->>'end_date')::date,
      p_params->>'sku_name',
      COALESCE(p_params->>'status', 'any_post_ship')
    );

  ELSIF p_function_name = 'get_lot_traceability' THEN
    v_result := public.get_lot_traceability(
      v_org_id,
      p_params->>'lot_number',
      COALESCE(p_params->>'direction', 'forward')
    );

  ELSIF p_function_name = 'get_inventory_valuation' THEN
    v_result := public.get_inventory_valuation(
      v_org_id,
      COALESCE(p_params->>'kind', 'all'),
      COALESCE((p_params->>'top_n')::integer, 10)
    );

  ELSIF p_function_name = 'get_supplier_spend' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    INTO v_result
    FROM public.get_supplier_spend(
      v_org_id,
      (p_params->>'start_date')::date,
      (p_params->>'end_date')::date
    ) r;

  ELSIF p_function_name = 'get_finished_goods_status' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    INTO v_result
    FROM public.get_finished_goods_status(
      v_org_id,
      p_params->>'sku_name',
      COALESCE((p_params->>'only_in_stock')::boolean, false)
    ) r;

  ELSE
    RAISE EXCEPTION 'unknown_ai_function: %', p_function_name
      USING HINT = 'Function name must be one of the 11 whitelisted AI tools. See src/lib/ai/tools.ts.';
  END IF;

  RETURN COALESCE(v_result, 'null'::jsonb);
END;
$$;

-- Re-assert lockdown (idempotent but explicit so a fresh replay of this
-- migration alone would end up in the same state as running 010 + 011).
REVOKE EXECUTE ON FUNCTION public.execute_ai_query(text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.execute_ai_query(text, jsonb) TO service_role;
