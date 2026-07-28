-- =====================================================================
-- Wrap auth.*() calls in RLS policies with (select ...)   (optimization #1)
-- =====================================================================
-- WHY: Postgres re-evaluates a bare auth.uid() / auth.jwt() / auth.role()
-- ONCE PER ROW scanned by a policy. Wrapping it as (select auth.uid())
-- turns it into an InitPlan that runs ONCE per statement. On large tables
-- this cuts RLS CPU cost by 5-100x. This is the pattern Supabase itself
-- recommends (https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
--
-- SAFETY / BEHAVIOUR:
--   * auth.uid()/jwt()/role() are CONSTANT within a request, so wrapping
--     returns the IDENTICAL value -> SAME rows, SAME access, SAME security.
--     No feature or query result changes. Pure planner optimization.
--   * Data-driven: rewrites the LIVE policies in pg_policies (the real
--     current state), not stale migration text. Catches every policy.
--   * Idempotent: already-wrapped policies are skipped; a double-wrap is
--     collapsed. Safe to run twice.
--   * Transactional (Supabase wraps migrations in a tx): all-or-nothing.
--   * Scope limited to schema 'public' — never touches storage/auth/realtime
--     policies that Supabase manages.
--
-- NOTE on detection: "(select auth.uid())" still contains the substring
-- "auth.uid()", so to find genuinely UNWRAPPED calls we first strip the
-- wrapped forms, then test what remains.
--
-- VERIFY: counts are RAISEd as NOTICE. "unwrapped remaining" must be 0.
-- =====================================================================

DO $rls_wrap$
DECLARE
  r            RECORD;
  new_qual     TEXT;
  new_check    TEXT;
  stmt         TEXT;
  n_before     INT := 0;
  n_after      INT := 0;
  n_changed    INT := 0;
  -- A wrapped call always has the keyword SELECT immediately before it.
  -- Postgres re-renders (select auth.uid()) canonically as
  -- "( SELECT auth.uid() AS uid)" (capital SELECT, spaces, alias), so we
  -- can't match the literal lowercase form. Instead strip "select auth.X()"
  -- (case-insensitive, any whitespace) and see if any BARE auth.X() remains.
  unwrapped    CONSTANT TEXT :=
    $$( regexp_replace(COALESCE(qual,''),       'select\s+auth\.(uid|jwt|role)\(\)','','gi') ~* 'auth\.(uid|jwt|role)\(\)'
     OR regexp_replace(COALESCE(with_check,''), 'select\s+auth\.(uid|jwt|role)\(\)','','gi') ~* 'auth\.(uid|jwt|role)\(\)' )$$;
BEGIN
  EXECUTE format(
    'SELECT count(*) FROM pg_policies WHERE schemaname = ''public'' AND %s', unwrapped
  ) INTO n_before;

  FOR r IN EXECUTE format(
    'SELECT schemaname, tablename, policyname, qual, with_check
       FROM pg_policies WHERE schemaname = ''public'' AND %s', unwrapped
  )
  LOOP
    -- Wrap via exact string replace (pg_get_expr emits canonical
    -- "auth.uid()" with no spaces); collapse any double-wrap for idempotency.
    new_qual := r.qual;
    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'auth.uid()',  '(select auth.uid())');
      new_qual := replace(new_qual, 'auth.jwt()',  '(select auth.jwt())');
      new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
      new_qual := replace(new_qual, '(select (select auth.uid()))',  '(select auth.uid())');
      new_qual := replace(new_qual, '(select (select auth.jwt()))',  '(select auth.jwt())');
      new_qual := replace(new_qual, '(select (select auth.role()))', '(select auth.role())');
    END IF;

    new_check := r.with_check;
    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'auth.uid()',  '(select auth.uid())');
      new_check := replace(new_check, 'auth.jwt()',  '(select auth.jwt())');
      new_check := replace(new_check, 'auth.role()', '(select auth.role())');
      new_check := replace(new_check, '(select (select auth.uid()))',  '(select auth.uid())');
      new_check := replace(new_check, '(select (select auth.jwt()))',  '(select auth.jwt())');
      new_check := replace(new_check, '(select (select auth.role()))', '(select auth.role())');
    END IF;

    -- Build ALTER POLICY with only the clauses this policy actually has
    -- (SELECT -> USING only; INSERT -> WITH CHECK only; ALL/UPDATE -> both).
    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF r.with_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    n_changed := n_changed + 1;
  END LOOP;

  EXECUTE format(
    'SELECT count(*) FROM pg_policies WHERE schemaname = ''public'' AND %s', unwrapped
  ) INTO n_after;

  RAISE NOTICE 'RLS auth-wrap: % policies had unwrapped calls, % rewritten, % unwrapped remaining',
    n_before, n_changed, n_after;

  IF n_after <> 0 THEN
    RAISE EXCEPTION 'Expected 0 unwrapped policies after rewrite, found %. Rolling back.', n_after;
  END IF;
END
$rls_wrap$;
