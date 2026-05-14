-- ============================================================================
-- Migration 003: clients.id  INTEGER  →  UUID
-- ============================================================================
--
-- Aligns the clients table with the rest of the schema: every other tenant of
-- this database uses UUID primary keys, and FKs that reference clients had to
-- be declared INTEGER as a special case (lokasi.client_id, refresh_tokens.
-- client_id). That asymmetry produced bug clusters around klien identity
-- (typed-pun JWT subjects, parseInt-into-string conversions, audit_log UUID
-- inserts rejecting klien actor ids, etc.) — this migration removes the
-- asymmetry at the schema level.
--
-- Scope of changes:
--   1. clients.id              integer → uuid (with PK, default, sequence drop)
--   2. lokasi.client_id        integer → uuid (FK rebuilt)
--   3. refresh_tokens.client_id  integer → uuid (FK rebuilt)  ← added in tahap 2
--   4. users_role_check        adds 'klien' to allowed roles
--   5. all_users_nrp           new VIEW for cross-table NRP uniqueness (P1-7)
--
-- Idempotency: the body is wrapped in a DO block that checks the current
-- data type of clients.id and skips (with a NOTICE) when the migration has
-- already been applied. The constraint update and view creation use their
-- own IF EXISTS / DROP-AND-RECREATE patterns so re-running this whole file
-- is safe.
--
-- One-way: this migration does NOT include a rollback. The integer ids are
-- not preserved anywhere after part A completes — there is no DOWN script.
-- If you need to roll back, do it from a database backup taken before this
-- migration ran.
--
-- Operational notes (see CHANGELOG.md for full text):
--   * All existing klien JWTs become invalid. The JWT carries
--     `client_id: <integer>` and the post-migration column rejects integer
--     comparison. Klien users must re-login. (User JWTs are unaffected.)
--   * Pre-migration refresh_tokens rows for klien have client_id remapped
--     to the new UUID, so refresh continues to work for that row — but the
--     JWT subject inside the access token will still mismatch, so the
--     practical effect is the same: re-login required.
--   * Application code in backend/src/services/auth.service.js called
--     parseInt() on the post-prefix portion of "client-<id>" JWT subjects.
--     That fails for UUIDs (parseInt('a1b2...') = NaN). The tahap 5 zip
--     ships a matching auth.service.js fix; do NOT apply this migration
--     without that code change in place, or klien getProfile / changePin
--     will throw.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- PART A:  clients.id + dependent FKs, integer → uuid
-- ----------------------------------------------------------------------------
DO $migration$
DECLARE
  v_id_type text;
BEGIN
  -- Introspect the current type of clients.id. We trust information_schema
  -- here because the migration commits inside this transaction; if any step
  -- below fails, the whole DO block rolls back and the type stays integer,
  -- which we'll see on next run and resume from the top.
  SELECT data_type INTO v_id_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'clients'
     AND column_name  = 'id';

  IF v_id_type IS NULL THEN
    RAISE EXCEPTION 'Migration 003: clients.id column not found. '
                    'Did you run the base schema (ptsss_db.sql) first?';
  END IF;

  IF v_id_type = 'uuid' THEN
    RAISE NOTICE 'Migration 003 part A: clients.id is already uuid — skipping (idempotent).';
    RETURN;
  END IF;

  IF v_id_type <> 'integer' THEN
    RAISE EXCEPTION 'Migration 003: unexpected clients.id type %, '
                    'aborting to avoid data loss.', v_id_type;
  END IF;

  RAISE NOTICE 'Migration 003 part A: converting clients.id integer → uuid';

  -- 1. Add the new UUID column on clients. DEFAULT gen_random_uuid() is a
  --    volatile expression: PostgreSQL evaluates it once per existing row
  --    when adding a NOT NULL column with a default, giving every existing
  --    row a distinct uuid.
  ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS new_id uuid DEFAULT gen_random_uuid() NOT NULL;

  -- 2. Add nullable UUID shadow columns on dependent tables (still no FK).
  ALTER TABLE public.lokasi
    ADD COLUMN IF NOT EXISTS client_id_new uuid;
  ALTER TABLE public.refresh_tokens
    ADD COLUMN IF NOT EXISTS client_id_new uuid;

  -- 3. Map old integer FK values to the new UUIDs via the clients table.
  --    Orphans (lokasi.client_id pointing to a non-existent clients.id)
  --    stay NULL — semantically correct, since the FK constraint we're
  --    about to drop would have prevented them in the first place.
  UPDATE public.lokasi l
     SET client_id_new = c.new_id
    FROM public.clients c
   WHERE l.client_id IS NOT NULL
     AND l.client_id = c.id;

  UPDATE public.refresh_tokens rt
     SET client_id_new = c.new_id
    FROM public.clients c
   WHERE rt.client_id IS NOT NULL
     AND rt.client_id = c.id;

  -- 4. Drop the integer FKs (they reference the integer id we're about to
  --    swap out). Use IF EXISTS so a re-run after a partial failure doesn't
  --    panic when the FK is already gone.
  ALTER TABLE public.lokasi
    DROP CONSTRAINT IF EXISTS lokasi_client_id_fkey;
  ALTER TABLE public.refresh_tokens
    DROP CONSTRAINT IF EXISTS refresh_tokens_client_id_fkey;

  -- 5. Drop the old integer columns. The index idx_lokasi_client was on the
  --    integer column and gets dropped implicitly with the column — we'll
  --    recreate it on the new uuid column further down.
  ALTER TABLE public.lokasi          DROP COLUMN IF EXISTS client_id;
  ALTER TABLE public.refresh_tokens  DROP COLUMN IF EXISTS client_id;

  -- 6. Rename shadow columns into the canonical name. Now lokasi.client_id
  --    and refresh_tokens.client_id are uuid columns, but still without FKs.
  ALTER TABLE public.lokasi          RENAME COLUMN client_id_new TO client_id;
  ALTER TABLE public.refresh_tokens  RENAME COLUMN client_id_new TO client_id;

  -- 7. clients table itself: drop the PK, drop the sequence default on id,
  --    drop the integer id column, rename new_id → id, restore the default
  --    (gen_random_uuid()), and add the PRIMARY KEY back. Order matters:
  --    you can't drop a column that has a PK constraint on it, and you
  --    can't drop the constraint while the default still points at a
  --    sequence (well — you can, but it's cleaner this way).
  ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_pkey;
  ALTER TABLE public.clients ALTER COLUMN id DROP DEFAULT;
  ALTER TABLE public.clients DROP COLUMN id;
  ALTER TABLE public.clients RENAME COLUMN new_id TO id;
  -- The DEFAULT on the renamed column was preserved across the rename, but
  -- be explicit so future readers don't have to remember that:
  ALTER TABLE public.clients ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE public.clients ADD PRIMARY KEY (id);

  -- 8. The integer sequence is now orphaned (its OWNED BY target column is
  --    gone). Drop it to clean up.
  DROP SEQUENCE IF EXISTS public.clients_id_seq;

  -- 9. Recreate FKs from dependent tables onto the new uuid PK. Preserve
  --    the original ON DELETE semantics:
  --      lokasi:         SET NULL  (a deleted client doesn't orphan its lokasi)
  --      refresh_tokens: CASCADE   (a deleted client purges its refresh tokens)
  ALTER TABLE public.lokasi
    ADD CONSTRAINT lokasi_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients (id) ON DELETE SET NULL;

  ALTER TABLE public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients (id) ON DELETE CASCADE;

  -- 10. Recreate the lokasi.client_id index. It existed before on the
  --     integer column and was dropped at step 5 alongside that column.
  CREATE INDEX IF NOT EXISTS idx_lokasi_client
    ON public.lokasi USING btree (client_id);

  RAISE NOTICE 'Migration 003 part A complete: clients.id is now uuid.';
END $migration$;


-- ----------------------------------------------------------------------------
-- PART B:  users_role_check  —  allow 'klien' as a role value
-- ----------------------------------------------------------------------------
--
-- The clients table still owns klien identity. The role check change is
-- defensive: there are code paths (audit log JOIN, application-level user
-- listings, future migrations) that may want to insert or surface a row in
-- `users` with role='klien' without the constraint blocking it. Today the
-- constraint hardcodes only the four staff roles.
--
-- DROP + ADD pattern is safer than ALTER ... DROP/ADD CHECK in one statement,
-- because we explicitly remove the old constraint by name before adding the
-- new one — avoids any chance of two same-named constraints racing.
DO $constraint$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.users'::regclass
       AND conname  = 'users_role_check'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_role_check;
  END IF;

  ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role = ANY (ARRAY[
      'anggota'::text,
      'komandan'::text,
      'supervisor'::text,
      'admin'::text,
      'klien'::text
    ]));

  RAISE NOTICE 'Migration 003 part B: users_role_check now includes klien.';
END $constraint$;


-- ----------------------------------------------------------------------------
-- PART C:  all_users_nrp  view  +  cross-table NRP uniqueness doc (P1-7)
-- ----------------------------------------------------------------------------
--
-- NRP must be unique across the entire system, but the system stores users
-- in two physical tables (`users` for staff, `clients` for klien). PostgreSQL
-- has no native cross-table unique constraint; partial workarounds via
-- triggers exist but are brittle. The chosen pattern is:
--
--   1. Expose a UNION view that surfaces every NRP from both tables.
--   2. Application code consults that view before INSERT on either table.
--   3. A second-line defense (trigger-based) can be added later if needed.
--
-- The view also serves as a convenient "show me everyone who can log in"
-- query for support and audit.

DROP VIEW IF EXISTS public.all_users_nrp;

CREATE VIEW public.all_users_nrp AS
  SELECT
    id,
    nrp,
    nama,
    role,
    'users'::text       AS source_table
  FROM public.users
  UNION ALL
  SELECT
    id,
    nrp_login           AS nrp,
    nama_klien          AS nama,
    'klien'::text       AS role,
    'clients'::text     AS source_table
  FROM public.clients
  WHERE nrp_login IS NOT NULL;

COMMENT ON VIEW public.all_users_nrp IS
  'P1-7 — Cross-table NRP visibility. NRP must be unique across users + clients combined; PostgreSQL cannot express that as a unique constraint over two physical tables, so application code is responsible for checking this view before inserting either a staff row (users) or a klien row (clients with nrp_login set). Queryable as: SELECT 1 FROM all_users_nrp WHERE nrp = $1.';

COMMIT;

-- ============================================================================
-- Post-migration verification queries (run manually, not part of the txn)
-- ============================================================================
--   -- Should report 'uuid' three times:
--   SELECT table_name, column_name, data_type
--     FROM information_schema.columns
--    WHERE (table_name='clients'         AND column_name='id')
--       OR (table_name='lokasi'          AND column_name='client_id')
--       OR (table_name='refresh_tokens'  AND column_name='client_id');
--
--   -- Should list two FK constraints, both REFERENCES public.clients(id):
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname IN ('lokasi_client_id_fkey','refresh_tokens_client_id_fkey');
--
--   -- Should include 'klien':
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'users_role_check';
--
--   -- Should return rows (one per clients.nrp_login + one per users.nrp):
--   SELECT COUNT(*), source_table FROM all_users_nrp GROUP BY source_table;
-- ============================================================================
