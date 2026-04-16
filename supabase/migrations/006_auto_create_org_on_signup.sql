-- =============================================================================
-- 006_auto_create_org_on_signup.sql
--
-- Every new auth.users row gets a solo org + owner membership.
--
-- Fixes: "No organization found for this user." error in bulkInsertIngredients
-- and every other action that calls resolveOrgId(). Signup previously stashed
-- org_name / org_slug in raw_user_meta_data but nothing consumed it.
--
-- Also backfills existing auth.users rows that don't yet have an org_members
-- row, and adds a self-select policy on org_members so resolveOrgId() works
-- before the JWT refresh that populates app_metadata.org_id.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Slug helper: lowercase, alnum + hyphens, no leading/trailing hyphens.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
      '^-+|-+$',
      '',
      'g'
    ),
    ''
  )
$$;


-- -----------------------------------------------------------------------------
-- ensure_org_for_user(user_id): idempotent — creates org + membership if the
-- user doesn't already have one. Returns the org_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_org_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_org   uuid;
  u_email        text;
  u_meta         jsonb;
  raw_org_name   text;
  raw_org_slug   text;
  full_name      text;
  email_prefix   text;
  resolved_name  text;
  candidate_slug text;
  final_slug     text;
  new_org_id     uuid;
  tries          int := 0;
BEGIN
  SELECT org_id INTO existing_org
  FROM public.org_members
  WHERE user_id = p_user_id
  LIMIT 1;

  IF existing_org IS NOT NULL THEN
    RETURN existing_org;
  END IF;

  SELECT email, coalesce(raw_user_meta_data, '{}'::jsonb)
  INTO u_email, u_meta
  FROM auth.users
  WHERE id = p_user_id;

  IF u_email IS NULL THEN
    RAISE EXCEPTION 'ensure_org_for_user: no auth.users row for %', p_user_id;
  END IF;

  raw_org_name := nullif(trim(u_meta->>'org_name'), '');
  raw_org_slug := nullif(trim(u_meta->>'org_slug'), '');
  full_name    := nullif(trim(u_meta->>'full_name'), '');
  email_prefix := split_part(u_email, '@', 1);

  -- Name priority: signup form > OAuth full_name > email prefix
  resolved_name := coalesce(
    raw_org_name,
    full_name || '''s workspace',
    email_prefix || '''s workspace'
  );

  candidate_slug := coalesce(
    public.slugify(raw_org_slug),
    public.slugify(resolved_name),
    'workspace'
  );

  final_slug := candidate_slug;
  WHILE EXISTS (SELECT 1 FROM public.orgs WHERE slug = final_slug) LOOP
    tries := tries + 1;
    final_slug := candidate_slug || '-' ||
      substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    EXIT WHEN tries >= 5;
  END LOOP;

  INSERT INTO public.orgs (name, slug)
  VALUES (resolved_name, final_slug)
  RETURNING id INTO new_org_id;

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (new_org_id, p_user_id, 'owner');

  -- Stamp org_id into JWT app_metadata so current_org_id() resolves after the
  -- user's next session refresh. App code doesn't rely on this (it reads from
  -- org_members), but downstream RLS policies on other tables do.
  UPDATE auth.users
  SET raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('org_id', new_org_id::text)
  WHERE id = p_user_id;

  RETURN new_org_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- Trigger: fire on new auth.users INSERT.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.ensure_org_for_user(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- -----------------------------------------------------------------------------
-- Self-select policy: resolveOrgId() runs as the authed user against
-- org_members and needs to see its own row before the JWT carries org_id.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "org_members_self_select" ON public.org_members;
CREATE POLICY "org_members_self_select" ON public.org_members
  FOR SELECT
  USING (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- Backfill: create orgs for any existing auth.users lacking a membership.
-- Safe to re-run — ensure_org_for_user is idempotent.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN
    SELECT au.id
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_members m WHERE m.user_id = au.id
    )
  LOOP
    PERFORM public.ensure_org_for_user(u.id);
  END LOOP;
END $$;
