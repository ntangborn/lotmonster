-- =============================================================================
-- 010_ai_readonly_role.sql
--
-- Security boundary for the AI assistant. Creates:
--
--   1. ai_readonly NOLOGIN role with:
--      - USAGE on schema public
--      - SELECT on all current + future public tables
--      - EXECUTE on EXACTLY the 11 whitelisted AI functions added in 009
--      (and nothing else — no INSERT, no UPDATE, no DELETE, no DDL)
--
--   2. execute_ai_query(function_name text, params jsonb) wrapper:
--      - SECURITY DEFINER owned by supabase_admin (implicit via migration)
--      - SET LOCAL ROLE ai_readonly before dispatch, RESET ROLE after
--      - Hard-coded CASE dispatcher over the 11 names; no EXECUTE, no
--        format(), no dynamic SQL of any kind — function names are
--        literals in the source text
--      - Unknown function_name raises `unknown_ai_function` and nothing
--        is executed
--      - Accepts params jsonb which MUST include 'org_id' injected by
--        the Next.js dispatcher (never by the model itself)
--      - REVOKE EXECUTE from PUBLIC, GRANT to service_role only — the
--        Supabase admin client is the only thing that can call it
--
-- This file is idempotent: the role-create is guarded by IF NOT EXISTS,
-- and every GRANT/REVOKE is safe to re-run.
-- =============================================================================


-- ── Role ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_readonly') THEN
    CREATE ROLE ai_readonly NOLOGIN;
  END IF;
END $$;

-- Schema access
GRANT USAGE ON SCHEMA public TO ai_readonly;

-- SELECT on all tables, current + future
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO ai_readonly;

-- EXECUTE on the 11 whitelisted functions (added in 009)
GRANT EXECUTE ON FUNCTION public.get_cogs_summary(uuid, date, date, text)           TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_expiring_lots(uuid, integer, text, boolean)    TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_low_stock_ingredients(uuid, text, boolean)     TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_ingredient_cost_history(uuid, text, integer)   TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_production_run_detail(uuid, text)              TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_recipe_cost_estimate(uuid, text, numeric)      TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_sales_summary(uuid, date, date, text, text)    TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_lot_traceability(uuid, text, text)             TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_inventory_valuation(uuid, text, integer)       TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_supplier_spend(uuid, date, date)               TO ai_readonly;
GRANT EXECUTE ON FUNCTION public.get_finished_goods_status(uuid, text, boolean)     TO ai_readonly;


-- ── Wrapper: execute_ai_query ───────────────────────────────────────────────
-- Hard-coded whitelist dispatcher. No dynamic SQL. No EXECUTE. No format().
-- Each CASE branch calls a function by its literal name; an unknown name
-- raises an exception before any work happens.
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
  -- If it's missing or malformed, fail fast — DO NOT swallow and continue
  -- with NULL (every inner function is scoped by p_org_id).
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

  -- Security barrier: downgrade privileges for the duration of the call.
  -- Even if something below malfunctions, SQL attempts are constrained to
  -- ai_readonly (SELECT + EXECUTE on the 11 whitelisted functions only).
  SET LOCAL ROLE ai_readonly;

  -- Whitelist dispatcher. Function names are string LITERALS in the source
  -- text — no interpolation, no EXECUTE, no dynamic call paths. Postgres
  -- parses and binds each call at CREATE FUNCTION time.
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
    RESET ROLE;
    RAISE EXCEPTION 'unknown_ai_function: %', p_function_name
      USING HINT = 'Function name must be one of the 11 whitelisted AI tools. See src/lib/ai/tools.ts.';
  END IF;

  RESET ROLE;
  RETURN COALESCE(v_result, 'null'::jsonb);

EXCEPTION WHEN OTHERS THEN
  -- Belt + suspenders: ensure role is reset on any exception path.
  -- (SET LOCAL auto-reverts on transaction rollback, but RESET is cheap
  -- and documents the intent.)
  RESET ROLE;
  RAISE;
END;
$$;


-- Lockdown the wrapper — only the server-side admin client (service_role)
-- may call it. PostgREST will NOT expose this RPC to the browser because
-- authenticated lacks EXECUTE.
REVOKE EXECUTE ON FUNCTION public.execute_ai_query(text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.execute_ai_query(text, jsonb) TO service_role;
