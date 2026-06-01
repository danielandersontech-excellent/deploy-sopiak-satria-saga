-- =============================================================================
-- Migration 004 — Case-insensitive NRP uniqueness (P1-6)
-- =============================================================================
-- Background:
--   `findByNrp` already used `WHERE UPPER(nrp) = UPPER($1)` in
--   backend/src/repositories/auth.repository.js, but the sibling method
--   `nrpExists` still used a case-sensitive `WHERE nrp = $1`. That meant
--   an account "AGT001" could be located by login but the duplicate-check
--   on `createUser` would happily let an admin create another "agt001",
--   producing two rows with the same logical NRP and breaking login.
--
--   The application-side fix is to normalise both lookups to UPPER().
--   This migration backs that up at the database level by adding a
--   functional UNIQUE index on UPPER(nrp), so concurrent inserts via
--   the audit-log/seed/admin paths cannot race past the application
--   check and create case-variant duplicates.
--
-- Scope:
--   * CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nrp_upper ON users (UPPER(nrp))
--   * No ALTER TABLE. The existing `users_nrp_key` UNIQUE constraint
--     (case-sensitive) is RETAINED on purpose — dropping it would change
--     the constraint name surface area for any tooling that catches
--     unique_violation by constraint name. The new functional index
--     overlaps it but is stricter, which is exactly the desired behaviour.
--
-- Idempotency:
--   * Wrapped in a single transaction.
--   * The CREATE INDEX uses IF NOT EXISTS (Postgres 9.5+) so re-applying
--     the migration is a no-op.
--   * Belt-and-braces: a DO block also checks pg_indexes first and emits
--     a NOTICE when the index already exists, so the migration log is
--     informative when it's a no-op.
--
-- Pre-flight check the migration performs:
--   * Looks for any *existing* pair of rows that already collide under
--     UPPER(nrp) (e.g. "AGT001" + "agt001"). If found, the migration
--     RAISES EXCEPTION and rolls back. Resolve the duplicate by hand
--     (pick which row to keep) and re-run the migration.
--
-- Apply with:
--   psql -U ptsss_user -d ptsss_db -f database/migrations/004_nrp_case_insensitive.sql
--
-- Rollback (only if you must — see CHANGELOG):
--   DROP INDEX IF EXISTS public.idx_users_nrp_upper;
-- =============================================================================

BEGIN;

-- --- Pre-flight: detect existing case-variant duplicates -------------------
-- If any exist, abort so the operator can resolve them before the unique
-- index is created. Without this guard, CREATE UNIQUE INDEX would throw a
-- much less helpful "could not create unique index" deep in pg internals.
DO $$
DECLARE
    dup_count int;
    dup_sample text;
BEGIN
    SELECT COUNT(*), STRING_AGG(DISTINCT UPPER(nrp), ', ')
      INTO dup_count, dup_sample
      FROM (
        SELECT UPPER(nrp) AS k
          FROM public.users
         GROUP BY UPPER(nrp)
         HAVING COUNT(*) > 1
      ) d
      JOIN public.users u ON UPPER(u.nrp) = d.k;

    IF dup_count > 0 THEN
        RAISE EXCEPTION
            'Migration 004 aborted: % users row(s) collide under UPPER(nrp). Samples: %. Resolve the duplicates (DELETE or UPDATE one row) and re-run.',
            dup_count, COALESCE(dup_sample, '(none)');
    END IF;
END
$$;

-- --- Create the functional unique index ------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname  = 'idx_users_nrp_upper'
    ) THEN
        RAISE NOTICE 'idx_users_nrp_upper already present — skipping.';
    ELSE
        -- IF NOT EXISTS is technically redundant given the check above,
        -- but keeping it makes the migration tolerant of a partial state
        -- where someone created the index out-of-band.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nrp_upper
            ON public.users (UPPER(nrp));
        RAISE NOTICE 'Created idx_users_nrp_upper (functional UNIQUE on UPPER(nrp)).';
    END IF;
END
$$;

COMMIT;

-- =============================================================================
-- Verification (run manually after applying):
--
--   \d public.users                          -- expect: idx_users_nrp_upper
--   SELECT indexname, indexdef
--     FROM pg_indexes
--    WHERE tablename = 'users'
--      AND indexname = 'idx_users_nrp_upper';
--
--   -- Sanity: should now return 0
--   SELECT UPPER(nrp), COUNT(*)
--     FROM public.users
--    GROUP BY UPPER(nrp)
--   HAVING COUNT(*) > 1;
--
--   -- Sanity: this insert MUST fail with unique_violation if "AGT001" exists
--   --   INSERT INTO public.users (nrp, nama, role, shift, pin_hash)
--   --     VALUES ('agt001', 'lowercase dup', 'anggota', '08:00-16:00', 'x');
-- =============================================================================