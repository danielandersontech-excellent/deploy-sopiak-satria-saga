-- Migration 005: Lokasi dedup + UNIQUE constraint + indexes
-- Fixed: UUID tidak support MIN() — ganti dengan ROW_NUMBER() saja

BEGIN;

-- Step 1: Dedup lokasi (nama + client_id sama), pakai ROW_NUMBER bukan MIN(id)
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT nama, client_id
    FROM lokasi
    WHERE client_id IS NOT NULL
    GROUP BY nama, client_id
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Found % duplicate (nama, client_id) group(s). De-duplicating...', dup_count;

    -- Hapus duplikat menggunakan ctid (physical row id) — aman untuk UUID
    -- Pertahankan baris dengan created_at paling lama, hapus yang lebih baru
    DELETE FROM lokasi
    WHERE ctid NOT IN (
      SELECT DISTINCT ON (nama, client_id) ctid
      FROM lokasi
      WHERE client_id IS NOT NULL
      ORDER BY nama, client_id, created_at ASC NULLS LAST
    )
    AND client_id IS NOT NULL
    AND (nama, client_id) IN (
      SELECT nama, client_id
      FROM lokasi
      WHERE client_id IS NOT NULL
      GROUP BY nama, client_id
      HAVING COUNT(*) > 1
    );

    RAISE NOTICE 'De-duplication complete.';
  ELSE
    RAISE NOTICE 'No duplicate lokasi found. Skipping dedup.';
  END IF;
END $$;

-- Step 2: Tambah UNIQUE constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lokasi_nama_client_unique'
    AND table_name = 'lokasi'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE lokasi
      ADD CONSTRAINT lokasi_nama_client_unique UNIQUE (nama, client_id);
    RAISE NOTICE 'Added UNIQUE constraint lokasi_nama_client_unique.';
  ELSE
    RAISE NOTICE 'UNIQUE constraint lokasi_nama_client_unique already exists. Skipping.';
  END IF;
END $$;

-- Step 3: Indexes (semua idempotent via IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_lokasi_client_id
  ON lokasi(client_id);

CREATE INDEX IF NOT EXISTS idx_lokasi_status_active
  ON lokasi(status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_lokasi_client_status
  ON lokasi(client_id, status);

COMMIT;