-- =============================================================================
-- Migration 002 — must_change_pin flag (P0-14)
-- =============================================================================
-- Adds a `must_change_pin` boolean to both `users` and `clients`. The flag
-- is set TRUE for every newly created account (random temp PIN, see
-- backend/src/utils/bootstrap.js and auth.service.js). The login endpoint
-- returns `mustChangePin: true` so the client UI can force the user
-- through change-PIN before unlocking the rest of the app.
--
-- Backfill policy for EXISTING accounts:
--   - We default to FALSE for existing rows. Setting them to TRUE would
--     lock out every demo/seed account on the next login, which is not
--     what we want for a security backfill — only freshly minted accounts
--     should hit the forced-change flow. Operators who *do* want to force
--     every existing account to rotate can run:
--
--       UPDATE users   SET must_change_pin = TRUE;
--       UPDATE clients SET must_change_pin = TRUE;
--
--     after applying this migration.
--
-- Apply with:
--   psql -U postgres -d ptsss_db -f database/migrations/002_must_change_pin.sql
-- =============================================================================

BEGIN;

-- --- users -----------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN NOT NULL DEFAULT FALSE;

-- New defaults for accounts created from this point on: TRUE. Existing
-- rows keep their backfilled FALSE because the ALTER above set the default
-- BEFORE we change it.
ALTER TABLE public.users
    ALTER COLUMN must_change_pin SET DEFAULT TRUE;

-- --- clients ---------------------------------------------------------------
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.clients
    ALTER COLUMN must_change_pin SET DEFAULT TRUE;

COMMIT;

-- =============================================================================
-- Verification queries (run manually after applying):
--
--   \d public.users    -- look for must_change_pin column
--   \d public.clients
--
--   SELECT COUNT(*) FILTER (WHERE must_change_pin) AS forced,
--          COUNT(*) FILTER (WHERE NOT must_change_pin) AS ok
--   FROM public.users;
-- =============================================================================