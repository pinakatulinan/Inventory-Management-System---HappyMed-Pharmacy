-- Close the Supabase REST surface over this schema.
--
-- WHY THIS EXISTS
--
-- Supabase publishes the `public` schema through PostgREST, authenticated with
-- the `anon` key. That key is public by design - it ships to browsers. Tables
-- created by Prisma have no Row Level Security, so without this migration every
-- row in Product, Batch, StockMovement and User is readable, and writable, by
-- anyone who has that key. For a pharmacy that is patient-adjacent data and a
-- destroyable stock ledger.
--
-- This application never uses PostgREST. It connects to Postgres directly as
-- the table owner. So the correct fix is to close the API surface completely
-- rather than to write per-table policies that we would then have to maintain.
--
-- IMPORTANT: RLS is enabled WITHOUT `FORCE`. A table's owner bypasses RLS, and
-- the app connects as that owner, so nothing in the application changes. Adding
-- FORCE would lock out the application itself, because there are deliberately
-- no policies to let anything through.
--
-- This migration is written to be a no-op on a plain PostgreSQL server, where
-- the Supabase roles do not exist.

-- 1. Deny-all RLS on every table in the schema.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      target.tablename
    );
  END LOOP;
END $$;

-- 2. Remove the Supabase API roles from this schema entirely.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role
      );
      EXECUTE format(
        'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role
      );
      EXECUTE format(
        'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role
      );
      EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', api_role);

      -- Cover tables created by future migrations, not just the ones that
      -- exist today.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END $$;
